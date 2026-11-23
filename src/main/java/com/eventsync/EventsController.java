package com.eventsync;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/events")
class EventsController {
    private final Db db; private final FriendsController friends;
    EventsController(Db db,FriendsController friends){this.db=db;this.friends=friends;}
    record EventInput(@NotBlank @Size(max=160) String title,@NotNull @Size(max=5000) String description,
        @NotNull @Size(max=255) String location,@NotNull Instant start,@NotNull Instant end,
        @NotBlank String timeZone,@NotNull @Size(max=50) Set<@NotBlank String> inviteeIds,String groupId) {}
    enum Reply { ACCEPTED, DECLINED }
    record Response(@NotNull Reply response) {}
    record Guest(Db.PublicUser user,String response) {}
    record Event(String id,String organizerId,String title,String description,String location,
                 Instant start,Instant end,String timeZone,String groupId,boolean cancelled,String myResponse,List<Guest> guests) {}
    private Event event(ResultSet r,String me) throws SQLException {
        String id=r.getString("id");
        var guests=db.sql.query("SELECT u.id,u.name,i.response FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.event_id=? ORDER BY u.name",
            (g,n)->new Guest(new Db.PublicUser(g.getString(1),g.getString(2)),g.getString(3)),id);
        String response=r.getString("organizer_id").equals(me)?"ORGANIZER":guests.stream().filter(g->g.user.id().equals(me)).map(Guest::response).findFirst().orElse(null);
        return new Event(id,r.getString("organizer_id"),r.getString("title"),r.getString("description"),r.getString("location"),r.getTimestamp("starts_at").toInstant(),r.getTimestamp("ends_at").toInstant(),r.getString("time_zone"),r.getString("group_id"),r.getBoolean("cancelled"),response,guests);
    }
    @GetMapping List<Event> list(Authentication a,@RequestParam(defaultValue="upcoming") String view,@RequestParam(required=false) String groupId){
        String condition=switch(view){
            case "upcoming" -> "e.cancelled=FALSE AND e.ends_at>? AND (e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=? AND i.response='ACCEPTED'))";
            case "invitations" -> "e.cancelled=FALSE AND e.ends_at>? AND e.organizer_id<>? AND EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=? AND i.response='PENDING')";
            case "organized" -> "e.cancelled=FALSE AND e.organizer_id=?";
            default -> throw ApiException.bad("view must be upcoming, invitations, or organized");
        };
        Object[] args=view.equals("organized")?new Object[]{a.getName()}:new Object[]{Db.ts(Instant.now()),a.getName(),a.getName()};
        if(groupId!=null && !groupId.isBlank()){
            requireGroupMember(a.getName(),groupId);
            return db.sql.query("SELECT e.* FROM events e WHERE e.window_start IS NULL AND e.group_id=? AND ("+condition+") ORDER BY e.starts_at LIMIT 500",(r,n)->event(r,a.getName()),prepend(groupId,args));
        }
        return db.sql.query("SELECT e.* FROM events e WHERE e.window_start IS NULL AND ("+condition+") ORDER BY e.starts_at LIMIT 500",(r,n)->event(r,a.getName()),args);
    }
    @GetMapping("/{id}") Event get(Authentication a,@PathVariable String id){return visible(a.getName(),id);}
    private Event visible(String me,String id){
        return db.sql.query("SELECT e.* FROM events e WHERE e.id=? AND e.window_start IS NULL AND (e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=?))",(r,n)->event(r,me),id,me,me).stream().findFirst().orElseThrow(ApiException::missing);
    }
    private static Object[] prepend(Object head,Object[] tail){Object[] all=new Object[tail.length+1];all[0]=head;System.arraycopy(tail,0,all,1,tail.length);return all;}
    private void requireGroupMember(String user,String group){
        if(db.sql.queryForList("SELECT user_id FROM group_members WHERE group_id=? AND user_id=?",String.class,group,user).isEmpty())throw ApiException.forbidden();
    }
    private Set<String> recipients(String organizer,EventInput r){
        var ids=new LinkedHashSet<>(r.inviteeIds());
        if(r.groupId()!=null && !r.groupId().isBlank()){
            requireGroupMember(organizer,r.groupId());
            ids.addAll(db.sql.queryForList("SELECT user_id FROM group_members WHERE group_id=? AND user_id<>?",String.class,r.groupId(),organizer));
        }
        ids.remove(organizer);
        if(ids.size()>500)throw ApiException.bad("An event cannot invite more than 500 people");
        for(String id:r.inviteeIds()){
            if(id.equals(organizer))throw ApiException.bad("Organizer cannot invite themselves");
            // Explicit additional invitations remain restricted to friends.
            friends.requireFriend(organizer,id);
        }
        return ids;
    }
    @PostMapping @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED) @Transactional
    Event create(Authentication a,@Valid @RequestBody EventInput r){
        validate(r);var recipients=recipients(a.getName(),r);
        String id=Db.id(); db.sql.update("INSERT INTO events(id,organizer_id,title,description,location,starts_at,ends_at,time_zone,group_id) VALUES(?,?,?,?,?,?,?,?,?)",id,a.getName(),r.title().trim(),r.description(),r.location(),Db.ts(r.start()),Db.ts(r.end()),r.timeZone(),r.groupId()==null||r.groupId().isBlank()?null:r.groupId());
        for(String user:recipients) db.sql.update("INSERT INTO invitations(event_id,user_id,response) VALUES(?,?,'PENDING')",id,user);
        return visible(a.getName(),id);
    }
    @PutMapping("/{id}") @Transactional
    Event update(Authentication a,@PathVariable String id,@Valid @RequestBody EventInput r){
        db.sql.queryForList("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        var old=visible(a.getName(),id); if(!old.organizerId().equals(a.getName())) throw ApiException.forbidden();
        if(old.cancelled()) throw ApiException.bad("Event is cancelled");
        validate(r);var recipients=recipients(a.getName(),r);
        db.sql.update("UPDATE events SET title=?,description=?,location=?,starts_at=?,ends_at=?,time_zone=?,group_id=? WHERE id=?",r.title().trim(),r.description(),r.location(),Db.ts(r.start()),Db.ts(r.end()),r.timeZone(),r.groupId()==null||r.groupId().isBlank()?null:r.groupId(),id);
        // Editing any event detail requires fresh consent from invitees.
        db.sql.update("DELETE FROM invitations WHERE event_id=?",id);
        for(String user:recipients)db.sql.update("INSERT INTO invitations(event_id,user_id,response) VALUES(?,?,'PENDING')",id,user);
        return visible(a.getName(),id);
    }
    @DeleteMapping("/{id}") @Transactional
    Map<String,Boolean> cancel(Authentication a,@PathVariable String id){
        var e=visible(a.getName(),id);if(!e.organizerId().equals(a.getName()))throw ApiException.forbidden();
        db.sql.update("UPDATE events SET cancelled=TRUE WHERE id=?",id);return Map.of("ok",true);
    }
    @PostMapping("/{id}/respond") @Transactional
    Event respond(Authentication a,@PathVariable String id,@Valid @RequestBody Response r){
        db.sql.queryForList("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        var e=visible(a.getName(),id);
        if(e.organizerId().equals(a.getName())) throw ApiException.forbidden();
        if(e.cancelled()||!e.end().isAfter(Instant.now()))throw ApiException.bad("Event is cancelled or has ended");
        if(db.sql.update("UPDATE invitations SET response=? WHERE event_id=? AND user_id=?",r.response().name(),id,a.getName())==0)throw ApiException.forbidden();
        return visible(a.getName(),id);
    }
    private void validate(EventInput r){
        ZoneId.of(r.timeZone());
        if(!r.start().isBefore(r.end())||Duration.between(r.start(),r.end()).compareTo(Duration.ofDays(7))>0)throw ApiException.bad("Event must last between 1 second and 7 days");
        if(!r.start().isAfter(Instant.now()))throw ApiException.bad("Event must start in the future");
    }
}
