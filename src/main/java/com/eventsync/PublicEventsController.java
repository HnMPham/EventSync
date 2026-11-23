package com.eventsync;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** All signed-in users can discover public announcements; only system admins manage them. */
@RestController
@RequestMapping("/api/public-events")
class PublicEventsController {
    private final Db db;
    PublicEventsController(Db db){this.db=db;}
    record Input(@NotBlank @Size(max=160) String title,@NotNull @Size(max=5000) String description,
        @NotNull @Size(max=255) String location,@NotNull Instant start,@NotNull Instant end,@NotBlank String timeZone) {}
    record PublicEvent(String id,String title,String description,String location,Instant start,Instant end,
        String timeZone,boolean cancelled,String createdBy,long interestedCount,boolean interested) {}
    private void publisher(Authentication auth){
        Boolean allowed=db.sql.queryForObject("SELECT organization_publisher OR system_admin FROM users WHERE id=?",Boolean.class,auth.getName());
        if(!Boolean.TRUE.equals(allowed))throw ApiException.forbidden();
    }
    private void manage(Authentication auth,String eventId){
        publisher(auth);
        if(db.user(auth.getName()).systemAdmin())return;
        String owner=db.sql.query("SELECT created_by FROM public_events WHERE id=?",(r,n)->r.getString(1),eventId).stream().findFirst().orElseThrow(ApiException::missing);
        if(!owner.equals(auth.getName()))throw ApiException.forbidden();
    }
    private void validate(Input input){
        ZoneId.of(input.timeZone());
        if(!input.start().isBefore(input.end())||Duration.between(input.start(),input.end()).compareTo(Duration.ofDays(7))>0)
            throw ApiException.bad("Event must last between 1 second and 7 days");
    }
    private PublicEvent row(ResultSet r,String me)throws SQLException{
        return new PublicEvent(r.getString("id"),r.getString("title"),r.getString("description"),r.getString("location"),
            r.getTimestamp("starts_at").toInstant(),r.getTimestamp("ends_at").toInstant(),r.getString("time_zone"),
            r.getBoolean("cancelled"),r.getString("created_by"),r.getLong("interested_count"),r.getBoolean("interested"));
    }
    private String columns(){return "SELECT p.*, (SELECT COUNT(*) FROM public_event_rsvps x WHERE x.event_id=p.id) AS interested_count, "+
        "EXISTS(SELECT 1 FROM public_event_rsvps x WHERE x.event_id=p.id AND x.user_id=?) AS interested FROM public_events p ";}
    @GetMapping List<PublicEvent> list(Authentication a,@RequestParam(defaultValue="false") boolean includePast){
        String where=includePast?"WHERE p.cancelled=FALSE":"WHERE p.cancelled=FALSE AND p.ends_at>?";
        return includePast?db.sql.query(columns()+where+" ORDER BY p.starts_at LIMIT 200",(r,n)->row(r,a.getName()),a.getName()):
            db.sql.query(columns()+where+" ORDER BY p.starts_at LIMIT 200",(r,n)->row(r,a.getName()),a.getName(),Db.ts(Instant.now()));
    }
    @GetMapping("/{id}") PublicEvent get(Authentication a,@PathVariable String id){
        return db.sql.query(columns()+"WHERE p.id=? AND p.cancelled=FALSE",(r,n)->row(r,a.getName()),a.getName(),id)
            .stream().findFirst().orElseThrow(ApiException::missing);
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    PublicEvent create(Authentication a,@Valid @RequestBody Input input){
        publisher(a);validate(input);
        if(!input.start().isAfter(Instant.now()))throw ApiException.bad("Event start must be in the future");
        String id=Db.id();db.sql.update("INSERT INTO public_events(id,created_by,title,description,location,starts_at,ends_at,time_zone,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            id,a.getName(),input.title().trim(),input.description(),input.location(),Db.ts(input.start()),Db.ts(input.end()),input.timeZone(),Db.ts(Instant.now()));
        return get(a,id);
    }
    @PutMapping("/{id}") @Transactional
    PublicEvent edit(Authentication a,@PathVariable String id,@Valid @RequestBody Input input){
        manage(a,id);validate(input);
        if(db.sql.update("UPDATE public_events SET title=?,description=?,location=?,starts_at=?,ends_at=?,time_zone=? WHERE id=? AND cancelled=FALSE",
            input.title().trim(),input.description(),input.location(),Db.ts(input.start()),Db.ts(input.end()),input.timeZone(),id)==0)throw ApiException.missing();
        return get(a,id);
    }
    @DeleteMapping("/{id}") @Transactional
    Map<String,Boolean> cancel(Authentication a,@PathVariable String id){
        manage(a,id);
        if(db.sql.update("UPDATE public_events SET cancelled=TRUE WHERE id=? AND cancelled=FALSE",id)==0)throw ApiException.missing();
        return Map.of("ok",true);
    }
    @PutMapping("/{id}/interest") @Transactional
    PublicEvent interested(Authentication a,@PathVariable String id){
        PublicEvent event=get(a,id);
        if(!event.end().isAfter(Instant.now()))throw ApiException.bad("Event has ended");
        db.sql.update("INSERT IGNORE INTO public_event_rsvps(event_id,user_id,created_at) VALUES(?,?,?)",id,a.getName(),Db.ts(Instant.now()));
        return get(a,id);
    }
    @DeleteMapping("/{id}/interest") @Transactional
    PublicEvent notInterested(Authentication a,@PathVariable String id){
        get(a,id);db.sql.update("DELETE FROM public_event_rsvps WHERE event_id=? AND user_id=?",id,a.getName());return get(a,id);
    }
}
