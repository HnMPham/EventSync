package com.eventsync;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Proposed meeting events. Legacy /api/events endpoints remain available for finalized events. */
@RestController
@RequestMapping("/api/scheduling-events")
class SchedulingEventsController {
    private final Db db;
    private final GroupsController groups;
    private final SchedulingService scheduling;
    private final Notifications notifications;
    SchedulingEventsController(Db db,GroupsController groups,SchedulingService scheduling,Notifications notifications){
        this.db=db;this.groups=groups;this.scheduling=scheduling;this.notifications=notifications;
    }
    record PollInput(@NotBlank @Size(max=160) String title,@Size(max=5000) String description,
        @Size(max=255) String location,@NotNull Instant windowStart,@NotNull Instant windowEnd,
        @Min(30) @Max(480) int durationMinutes,@NotBlank String timeZone,String groupId,
        Instant responseDeadline,Set<@NotBlank String> inviteeIds,boolean draft) {}
    record Participant(Db.PublicUser user,String response,boolean submitted) {}
    record Poll(String id,String organizerId,String title,String description,String location,String status,
        String groupId,Instant windowStart,Instant windowEnd,int durationMinutes,String timeZone,
        Instant responseDeadline,Instant finalizedStart,Instant finalizedEnd,
        List<Participant> participants,List<SchedulingService.Interval> myAvailability) {}
    record Created(Poll event,String invitationCode) {}
    record Invite(@NotBlank String userId) {}
    record Join(@NotBlank String code) {}
    record InviteEmail(@NotBlank @Email String email) {}
    record Decision(@NotNull Boolean accept) {}
    record Prefill(@NotNull LocalDate weekStart) {}
    record AvailabilityInput(@NotNull @Size(max=300) List<@Valid TimeRange> slots) {}
    record TimeRange(@NotNull Instant start,@NotNull Instant end) {}
    record Finalize(@NotNull Instant start) {}

    private void requireVisible(String user,String id){
        var rows=db.sql.queryForList("SELECT organizer_id,group_id,status FROM events WHERE id=?",id);
        if(rows.isEmpty())throw ApiException.missing();
        var row=rows.getFirst();
        if(user.equals(row.get("organizer_id")))return;
        Integer invited=db.sql.queryForObject("SELECT COUNT(*) FROM invitations WHERE event_id=? AND user_id=?",Integer.class,id,user);
        if(invited!=null&&invited>0)return;
        Object group=row.get("group_id");
        if(group!=null&&!"DRAFT".equals(row.get("status"))&&groups.role(user,(String)group)!=null)return;
        throw ApiException.missing();
    }
    private void requireOrganizer(String user,String id){
        String owner=db.sql.query("SELECT organizer_id FROM events WHERE id=?",(r,n)->r.getString(1),id)
            .stream().findFirst().orElseThrow(ApiException::missing);
        if(!user.equals(owner))throw ApiException.forbidden();
    }
    private Poll detail(String user,String id){
        requireVisible(user,id);
        return db.sql.query("SELECT * FROM events WHERE id=? AND window_start IS NOT NULL",(r,n)->{
            var participants=db.sql.query("SELECT u.id,u.name,i.response,CASE WHEN s.user_id IS NOT NULL THEN TRUE ELSE FALSE END submitted " +
                "FROM invitations i JOIN users u ON u.id=i.user_id LEFT JOIN event_submissions s ON s.event_id=i.event_id AND s.user_id=i.user_id " +
                "WHERE i.event_id=? ORDER BY u.name",(p,k)->new Participant(new Db.PublicUser(p.getString(1),p.getString(2)),p.getString(3),p.getBoolean(4)),id);
            var mine=db.sql.query("SELECT starts_at,ends_at FROM event_availability WHERE event_id=? AND user_id=? ORDER BY starts_at",
                (p,k)->new SchedulingService.Interval(p.getTimestamp(1).toInstant(),p.getTimestamp(2).toInstant()),id,user);
            return new Poll(r.getString("id"),r.getString("organizer_id"),r.getString("title"),r.getString("description"),r.getString("location"),
                r.getString("status"),r.getString("group_id"),r.getTimestamp("window_start").toInstant(),r.getTimestamp("window_end").toInstant(),
                r.getInt("duration_minutes"),r.getString("time_zone"),instant(r,"response_deadline"),instant(r,"starts_at"),instant(r,"ends_at"),participants,mine);
        },id).stream().findFirst().orElseThrow(ApiException::missing);
    }
    private static Instant instant(java.sql.ResultSet r,String key)throws java.sql.SQLException{
        var t=r.getTimestamp(key);return t==null?null:t.toInstant();
    }
    @GetMapping List<Poll> list(Authentication a,@RequestParam(defaultValue="all") String view,
                               @RequestParam(defaultValue="") String query){
        if(!Set.of("all","organized","invited","draft","collecting","finalized","cancelled").contains(view))throw ApiException.bad("Unknown view");
        if(query.length()>100)throw ApiException.bad("Search is too long");
        String condition=switch(view){
            case "organized"->"AND e.organizer_id=?";
            case "invited"->"AND e.organizer_id<>? AND EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=?)";
            case "draft","collecting","finalized","cancelled"->"AND e.status='"+view.toUpperCase(Locale.ROOT)+"'";
            default->"";
        };
        var args=new ArrayList<Object>();args.add(a.getName());args.add(a.getName());args.add(a.getName());
        if(view.equals("organized"))args.add(a.getName());
        if(view.equals("invited")){args.add(a.getName());args.add(a.getName());}
        String needle="%"+query.trim().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        args.add(needle);
        var ids=db.sql.query("SELECT e.id FROM events e WHERE e.window_start IS NOT NULL AND " +
            "(e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=?) " +
            "OR (e.status<>'DRAFT' AND EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=e.group_id AND gm.user_id=?))) " + condition +
            " AND LOWER(e.title) LIKE ? ESCAPE '!' ORDER BY e.window_start DESC LIMIT 200",
            (r,n)->r.getString(1),args.toArray());
        return ids.stream().map(id->detail(a.getName(),id)).toList();
    }
    record PreviewInput(@NotNull Instant windowStart,@NotNull Instant windowEnd,
        @Min(30) @Max(480) int durationMinutes,@NotBlank String timeZone,
        String groupId,@Size(max=150) Set<@NotBlank String> inviteeIds) {}
    @PostMapping("/preview") @Transactional(readOnly=true)
    SchedulingService.Recommendations preview(Authentication a,@Valid @RequestBody PreviewInput input){
        var people=new LinkedHashSet<String>();people.add(a.getName());
        if(input.groupId()!=null && !input.groupId().isBlank()){
            groups.requireMember(a.getName(),input.groupId());
            people.addAll(db.sql.queryForList("SELECT user_id FROM group_members WHERE group_id=?",String.class,input.groupId()));
        }
        for(String id:input.inviteeIds()==null?Set.<String>of():input.inviteeIds()){
            if(!id.equals(a.getName())){
                String[] pair=FriendsController.pair(a.getName(),id);
                Integer accepted=db.sql.queryForObject("SELECT COUNT(*) FROM friendships WHERE low_id=? AND high_id=? AND status='ACCEPTED'",Integer.class,pair[0],pair[1]);
                if(accepted==null||accepted==0)throw ApiException.forbidden();
            }
            people.add(id);
        }
        return scheduling.preview(people,input.windowStart(),input.windowEnd(),input.durationMinutes(),input.timeZone());
    }
    @GetMapping("/{id}") Poll get(Authentication a,@PathVariable String id){return detail(a.getName(),id);}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    Created create(Authentication a,@Valid @RequestBody PollInput input){
        validate(input);String owner=a.getName();
        if(input.groupId()!=null)groups.requireAdmin(owner,input.groupId());
        String id=Db.id(),code=Crypto.random();
        db.sql.update("INSERT INTO events(id,organizer_id,title,description,location,time_zone,status,window_start,window_end,duration_minutes,invite_code_hash,group_id,response_deadline) " +
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",id,owner,input.title().trim(),blank(input.description()),blank(input.location()),input.timeZone(),
            input.draft()?"DRAFT":"COLLECTING",Db.ts(input.windowStart()),Db.ts(input.windowEnd()),input.durationMinutes(),Crypto.hash(code),input.groupId(),
            input.responseDeadline()==null?null:Db.ts(input.responseDeadline()));
        if(input.groupId()!=null){
            for(String member:db.sql.queryForList("SELECT user_id FROM group_members WHERE group_id=?",String.class,input.groupId()))
                if(!member.equals(owner))addInvite(id,owner,member);
        }
        for(String guest:safe(input.inviteeIds())){
            if(!guest.equals(owner)){
                String[] pair=FriendsController.pair(owner,guest);
                Integer accepted=db.sql.queryForObject("SELECT COUNT(*) FROM friendships WHERE low_id=? AND high_id=? AND status='ACCEPTED'",Integer.class,pair[0],pair[1]);
                if(accepted==null||accepted==0)throw ApiException.forbidden();
                Integer already=db.sql.queryForObject("SELECT COUNT(*) FROM invitations WHERE event_id=? AND user_id=?",Integer.class,id,guest);
                if(already==null||already==0)addInvite(id,owner,guest);
            }
        }
        return new Created(detail(owner,id),code);
    }
    @PutMapping("/{id}") @Transactional
    Poll edit(Authentication a,@PathVariable String id,@Valid @RequestBody PollInput input){
        requireOrganizer(a.getName(),id);validate(input);
        var old=detail(a.getName(),id);
        if(!Set.of("DRAFT","COLLECTING").contains(old.status()))throw ApiException.bad("Cannot edit a finalized event");
        if(input.groupId()!=null)groups.requireAdmin(a.getName(),input.groupId());
        db.sql.update("UPDATE events SET title=?,description=?,location=?,window_start=?,window_end=?,duration_minutes=?,time_zone=?,group_id=?,response_deadline=? WHERE id=?",
            input.title().trim(),blank(input.description()),blank(input.location()),Db.ts(input.windowStart()),Db.ts(input.windowEnd()),input.durationMinutes(),input.timeZone(),input.groupId(),
            input.responseDeadline()==null?null:Db.ts(input.responseDeadline()),id);
        // A changed date window invalidates previously supplied availability.
        if(!old.windowStart().equals(input.windowStart())||!old.windowEnd().equals(input.windowEnd())){
            db.sql.update("DELETE FROM event_availability WHERE event_id=?",id);
            db.sql.update("DELETE FROM event_submissions WHERE event_id=?",id);
        }
        notifications.toParticipants(id,a.getName(),"EVENT_UPDATED","Event details have changed: "+input.title());
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/publish") @Transactional
    Poll publish(Authentication a,@PathVariable String id){
        requireOrganizer(a.getName(),id);
        if(db.sql.update("UPDATE events SET status='COLLECTING' WHERE id=? AND status='DRAFT'",id)==0)throw ApiException.bad("Event is not a draft");
        notifications.toParticipants(id,a.getName(),"PUBLISHED","An event is now collecting availability");
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/invite") @Transactional
    Poll invite(Authentication a,@PathVariable String id,@Valid @RequestBody Invite input){
        requireOrganizer(a.getName(),id);if(!Set.of("DRAFT","COLLECTING").contains(detail(a.getName(),id).status()))throw ApiException.bad("Event is closed");
        addInvite(id,a.getName(),input.userId());return detail(a.getName(),id);
    }
    @PostMapping("/{id}/invite-email") @Transactional
    Poll inviteEmail(Authentication a,@PathVariable String id,@Valid @RequestBody InviteEmail input){
        requireOrganizer(a.getName(),id);
        if(!Set.of("DRAFT","COLLECTING").contains(detail(a.getName(),id).status()))throw ApiException.bad("Event is closed");
        String user=db.sql.query("SELECT id FROM users WHERE email=?",(r,n)->r.getString(1),input.email().trim().toLowerCase(Locale.ROOT))
            .stream().findFirst().orElseThrow(()->ApiException.bad("Invitee must first register an EventSync account"));
        addInvite(id,a.getName(),user);return detail(a.getName(),id);
    }
    @PostMapping("/{id}/respond") @Transactional
    Poll respond(Authentication a,@PathVariable String id,@Valid @RequestBody Decision input){
        db.sql.queryForObject("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        var poll=detail(a.getName(),id);
        if(!"COLLECTING".equals(poll.status()))throw ApiException.bad("Scheduling is closed");
        if(a.getName().equals(poll.organizerId()))throw ApiException.forbidden();
        if(db.sql.update("UPDATE invitations SET response=? WHERE event_id=? AND user_id=?",input.accept()?"ACCEPTED":"DECLINED",id,a.getName())==0)
            throw ApiException.forbidden();
        if(!input.accept()){
            db.sql.update("DELETE FROM event_availability WHERE event_id=? AND user_id=?",id,a.getName());
            db.sql.update("DELETE FROM event_submissions WHERE event_id=? AND user_id=?",id,a.getName());
        }
        return detail(a.getName(),id);
    }
    @DeleteMapping("/{id}/participants/{userId}") @Transactional
    Poll remove(Authentication a,@PathVariable String id,@PathVariable String userId){
        requireOrganizer(a.getName(),id);if(!Set.of("DRAFT","COLLECTING").contains(detail(a.getName(),id).status()))throw ApiException.bad("Event is closed");
        if(db.sql.update("DELETE FROM invitations WHERE event_id=? AND user_id=?",id,userId)==0)throw ApiException.missing();
        db.sql.update("DELETE FROM event_availability WHERE event_id=? AND user_id=?",id,userId);
        db.sql.update("DELETE FROM event_submissions WHERE event_id=? AND user_id=?",id,userId);
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/join") @Transactional
    Poll join(Authentication a,@PathVariable String id,@Valid @RequestBody Join input){
        if(input.code().length()>256)throw ApiException.bad("Invalid invitation code");
        Integer exists=db.sql.queryForObject("SELECT COUNT(*) FROM events WHERE id=? AND invite_code_hash=? AND status='COLLECTING'",Integer.class,id,Crypto.hash(input.code()));
        if(exists==null||exists==0)throw ApiException.forbidden();
        addInvite(id,db.sql.queryForObject("SELECT organizer_id FROM events WHERE id=?",String.class,id),a.getName());
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/rotate-code") @Transactional
    Map<String,String> rotateCode(Authentication a,@PathVariable String id){
        requireOrganizer(a.getName(),id);
        if(!Set.of("DRAFT","COLLECTING").contains(detail(a.getName(),id).status()))throw ApiException.bad("Event is closed");
        String code=Crypto.random();db.sql.update("UPDATE events SET invite_code_hash=? WHERE id=?",Crypto.hash(code),id);
        return Map.of("invitationCode",code);
    }
    @PostMapping("/{id}/join-group") @Transactional
    Poll joinGroup(Authentication a,@PathVariable String id){
        var rows=db.sql.queryForList("SELECT group_id,status,organizer_id FROM events WHERE id=?",id);
        if(rows.isEmpty())throw ApiException.missing();var row=rows.getFirst();
        if(!"COLLECTING".equals(row.get("status")))throw ApiException.bad("Event is not collecting availability");
        if(row.get("group_id")==null)throw ApiException.bad("This is not a group event");
        groups.requireMember(a.getName(),(String)row.get("group_id"));
        addInvite(id,(String)row.get("organizer_id"),a.getName());
        return detail(a.getName(),id);
    }
    @PutMapping("/{id}/availability") @Transactional
    Poll submit(Authentication a,@PathVariable String id,@Valid @RequestBody AvailabilityInput input){
        String user=a.getName();
        db.sql.queryForObject("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        requireVisible(user,id);var poll=detail(user,id);
        if(!"COLLECTING".equals(poll.status()))throw ApiException.bad("Availability is closed");
        if(poll.responseDeadline()!=null&&Instant.now().isAfter(poll.responseDeadline()))throw ApiException.bad("Availability deadline has passed");
        if(!user.equals(poll.organizerId())){
            Integer n=db.sql.queryForObject("SELECT COUNT(*) FROM invitations WHERE event_id=? AND user_id=?",Integer.class,id,user);
            if(n==null||n==0)throw ApiException.forbidden();
        }
        var sorted=new ArrayList<>(input.slots());sorted.sort(Comparator.comparing(TimeRange::start));
        Instant previous=null;
        for(var range:sorted){
            if(!range.start().isBefore(range.end())||range.start().isBefore(poll.windowStart())||range.end().isAfter(poll.windowEnd()))
                throw ApiException.bad("Availability must fall within the event date window");
            if(previous!=null&&range.start().isBefore(previous))throw ApiException.bad("Availability periods cannot overlap");
            previous=range.end();
        }
        db.sql.update("DELETE FROM event_availability WHERE event_id=? AND user_id=?",id,user);
        for(var range:sorted)db.sql.update("INSERT INTO event_availability(event_id,user_id,starts_at,ends_at) VALUES(?,?,?,?)",
            id,user,Db.ts(range.start()),Db.ts(range.end()));
        db.sql.update("DELETE FROM event_submissions WHERE event_id=? AND user_id=?",id,user);
        db.sql.update("INSERT INTO event_submissions(event_id,user_id,submitted_at) VALUES(?,?,?)",id,user,Db.ts(Instant.now()));
        db.sql.update("UPDATE invitations SET response='ACCEPTED' WHERE event_id=? AND user_id=?",id,user);
        if(!user.equals(poll.organizerId()))notifications.send(poll.organizerId(),id,"AVAILABILITY_RECEIVED","A participant submitted availability for "+poll.title());
        return detail(user,id);
    }
    @PostMapping("/{id}/prefill-my-weekly") @Transactional
    Poll prefill(Authentication a,@PathVariable String id){
        db.sql.queryForObject("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        var poll=detail(a.getName(),id);
        if(!"COLLECTING".equals(poll.status()))throw ApiException.bad("Scheduling is closed");
        if(poll.responseDeadline()!=null&&Instant.now().isAfter(poll.responseDeadline()))throw ApiException.bad("Availability deadline has passed");
        if(!a.getName().equals(poll.organizerId())){
            Integer n=db.sql.queryForObject("SELECT COUNT(*) FROM invitations WHERE event_id=? AND user_id=?",Integer.class,id,a.getName());
            if(n==null||n==0)throw ApiException.forbidden();
        }
        var selected=db.sql.query("SELECT starts_at,ends_at FROM availability WHERE user_id=? AND starts_at<? AND ends_at>? ORDER BY starts_at",
            (r,n)->new SchedulingService.Interval(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant()),a.getName(),Db.ts(poll.windowEnd()),Db.ts(poll.windowStart()));
        db.sql.update("DELETE FROM event_availability WHERE event_id=? AND user_id=?",id,a.getName());
        for(var range:selected){
            Instant start=range.start().isBefore(poll.windowStart())?poll.windowStart():range.start();
            Instant end=range.end().isAfter(poll.windowEnd())?poll.windowEnd():range.end();
            if(start.isBefore(end))db.sql.update("INSERT INTO event_availability(event_id,user_id,starts_at,ends_at) VALUES(?,?,?,?)",id,a.getName(),Db.ts(start),Db.ts(end));
        }
        db.sql.update("DELETE FROM event_submissions WHERE event_id=? AND user_id=?",id,a.getName());
        db.sql.update("INSERT INTO event_submissions(event_id,user_id,submitted_at) VALUES(?,?,?)",id,a.getName(),Db.ts(Instant.now()));
        db.sql.update("UPDATE invitations SET response='ACCEPTED' WHERE event_id=? AND user_id=?",id,a.getName());
        if(!a.getName().equals(poll.organizerId()))notifications.send(poll.organizerId(),id,"AVAILABILITY_RECEIVED","A participant submitted availability for "+poll.title());
        return detail(a.getName(),id);
    }
    @GetMapping("/{id}/recommendations") @Transactional(readOnly=true)
    SchedulingService.Recommendations recommendations(Authentication a,@PathVariable String id){
        requireVisible(a.getName(),id);return scheduling.recommend(id);
    }
    @PostMapping("/{id}/finalize") @Transactional
    Poll finalizeEvent(Authentication a,@PathVariable String id,@Valid @RequestBody Finalize input){
        db.sql.queryForObject("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        requireOrganizer(a.getName(),id);var poll=detail(a.getName(),id);
        if(!"COLLECTING".equals(poll.status()))throw ApiException.bad("Event is not collecting availability");
        Instant end=input.start().plus(Duration.ofMinutes(poll.durationMinutes()));
        if(input.start().isBefore(poll.windowStart())||end.isAfter(poll.windowEnd()))throw ApiException.bad("Chosen time is outside the event window");
        if(db.sql.update("UPDATE events SET starts_at=?,ends_at=?,status='FINALIZED' WHERE id=? AND status='COLLECTING'",
            Db.ts(input.start()),Db.ts(end),id)==0)throw ApiException.bad("Event was already finalized");
        // The existing events row is the canonical calendar event. /api/events includes
        // finalized scheduling rows for the organizer and ACCEPTED invitees only.
        // Do not insert a second event or send calendar invitations to DECLINED/PENDING users.
        notifications.toParticipants(id,a.getName(),"FINALIZED","Meeting time finalized for "+poll.title());
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/reopen") @Transactional
    Poll reopen(Authentication a,@PathVariable String id){
        requireOrganizer(a.getName(),id);var poll=detail(a.getName(),id);
        if(!"FINALIZED".equals(poll.status()))throw ApiException.bad("Only finalized events can be reopened");
        if(poll.windowEnd().isBefore(Instant.now()))throw ApiException.bad("The scheduling window has passed");
        db.sql.update("UPDATE events SET status='COLLECTING',starts_at=NULL,ends_at=NULL WHERE id=?",id);
        notifications.toParticipants(id,a.getName(),"REOPENED","Meeting reopened for scheduling: "+poll.title());
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/cancel") @Transactional
    Poll cancel(Authentication a,@PathVariable String id){
        requireOrganizer(a.getName(),id);var poll=detail(a.getName(),id);
        if("CANCELLED".equals(poll.status()))throw ApiException.bad("Event already cancelled");
        db.sql.update("UPDATE events SET status='CANCELLED',cancelled=TRUE WHERE id=?",id);
        notifications.toParticipants(id,a.getName(),"CANCELLED","Event cancelled: "+poll.title());
        return detail(a.getName(),id);
    }
    @DeleteMapping("/{id}") @Transactional
    Map<String,Boolean> delete(Authentication a,@PathVariable String id){
        requireOrganizer(a.getName(),id);
        db.sql.update("DELETE FROM notifications WHERE event_id=?",id);
        db.sql.update("DELETE FROM events WHERE id=? AND window_start IS NOT NULL",id);
        return Map.of("ok",true);
    }
    /** Organizers may remove cancelled scheduling events immediately, or completed past scheduling events. */
    @DeleteMapping("/{id}/past") @Transactional
    Map<String,Boolean> deletePast(Authentication a,@PathVariable String id){
        db.sql.queryForObject("SELECT id FROM events WHERE id=? FOR UPDATE",String.class,id);
        requireOrganizer(a.getName(),id);
        Poll poll=detail(a.getName(),id);
        Instant effectiveEnd=poll.finalizedEnd()!=null?poll.finalizedEnd():poll.windowEnd();
        if(!"CANCELLED".equals(poll.status()) && !effectiveEnd.isBefore(Instant.now()))
            throw ApiException.bad("Only cancelled or past scheduling events can be deleted");
        db.sql.update("DELETE FROM notifications WHERE event_id=?",id);
        db.sql.update("DELETE FROM events WHERE id=? AND window_start IS NOT NULL",id);
        return Map.of("ok",true);
    }
    @GetMapping(value="/{id}/calendar.ics",produces="text/calendar")
    ResponseEntity<String> calendar(Authentication a,@PathVariable String id){
        var poll=detail(a.getName(),id);
        if(!"FINALIZED".equals(poll.status())||poll.finalizedStart()==null)throw ApiException.bad("Event is not finalized");
        String text="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//EventSync//EN\r\nBEGIN:VEVENT\r\n"+
            "UID:"+poll.id()+"@eventsync\r\nDTSTAMP:"+icsTime(Instant.now())+"\r\n"+
            "DTSTART:"+icsTime(poll.finalizedStart())+"\r\nDTEND:"+icsTime(poll.finalizedEnd())+"\r\n"+
            "SUMMARY:"+icsEscape(poll.title())+"\r\nLOCATION:"+icsEscape(poll.location())+"\r\n"+
            "DESCRIPTION:"+icsEscape(poll.description())+"\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=eventsync.ics").body(text);
    }
    private static String icsTime(Instant time){return java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(time);}
    private static String icsEscape(String text){return blank(text).replace("\\","\\\\").replace("\n","\\n").replace(",","\\,").replace(";","\\;").replace("\r","");}
    private static String blank(String x){return x==null?"":x;}
    private static Set<String> safe(Set<String> x){return x==null?Set.of():x;}
    private void addInvite(String id,String organizer,String user){
        if(user.equals(organizer))return;
        db.user(user);
        Integer n=db.sql.queryForObject("SELECT COUNT(*) FROM invitations WHERE event_id=? AND user_id=?",Integer.class,id,user);
        if(n!=null&&n>0)return;
        db.sql.update("INSERT INTO invitations(event_id,user_id,response) VALUES(?,?,'PENDING')",id,user);
        notifications.send(user,id,"INVITED","You were invited to a scheduling event");
    }
    private static void validate(PollInput input){
        ZoneId.of(input.timeZone());
        if(!input.windowStart().isBefore(input.windowEnd()))throw ApiException.bad("Scheduling window must be positive");
        if(Duration.between(input.windowStart(),input.windowEnd()).compareTo(Duration.ofDays(31))>0)
            throw ApiException.bad("Scheduling window cannot exceed 31 days");
        if(Duration.between(input.windowStart(),input.windowEnd()).toMinutes()<input.durationMinutes())
            throw ApiException.bad("Scheduling window must fit the meeting duration");
        if(input.windowEnd().isBefore(Instant.now()))throw ApiException.bad("Scheduling window has already passed");
        if(input.responseDeadline()!=null&&input.responseDeadline().isAfter(input.windowEnd()))throw ApiException.bad("Response deadline must fall before window end");
        if(input.responseDeadline()!=null&&input.responseDeadline().isBefore(Instant.now()))throw ApiException.bad("Response deadline has already passed");
        if(safe(input.inviteeIds()).size()>150)throw ApiException.bad("Too many invitees");
    }
}
