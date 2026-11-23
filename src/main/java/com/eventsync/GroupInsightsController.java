package com.eventsync;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Group-only analytics. An RSVP never counts as attendance without an explicit mark. */
@RestController
@RequestMapping("/api/groups/{groupId}/insights")
class GroupInsightsController {
    private final Db db;private final GroupsController groups;
    GroupInsightsController(Db db,GroupsController groups){this.db=db;this.groups=groups;}
    record MemberStats(String userId,String name,int present,int absent,int verified,double attendanceRate,Instant lastAttended) {}
    record EventStats(String id,String title,Instant start,int markedPresent,int markedAbsent,int unmarked) {}
    record Dashboard(String groupId,int totalMembers,int pastEvents,int verifiedMarks,double attendanceRate,
        List<MemberStats> members,List<EventStats> events) {}
    record Attendance(String userId,String name,String response,String status) {}
    record MarkInput(@NotBlank String userId,@NotBlank String status) {}
    private void authorized(Authentication a,String group){groups.requireAdmin(a.getName(),group);}
    private Map<String,Object> event(String groupId,String eventId){
        var found=db.sql.queryForList("SELECT id,title,starts_at,ends_at FROM events WHERE id=? AND group_id=? AND cancelled=FALSE AND starts_at IS NOT NULL AND ends_at<=?",
            eventId,groupId,Db.ts(Instant.now()));
        if(found.isEmpty())throw ApiException.bad("Attendance can only be recorded for completed group events");
        return found.getFirst();
    }
    @GetMapping Dashboard dashboard(Authentication a,@PathVariable String groupId){
        authorized(a,groupId);
        int total=db.sql.queryForObject("SELECT COUNT(*) FROM group_members WHERE group_id=?",Integer.class,groupId);
        int past=db.sql.queryForObject("SELECT COUNT(*) FROM events e WHERE e.group_id=? AND e.cancelled=FALSE AND e.starts_at IS NOT NULL AND e.ends_at<=?",Integer.class,groupId,Db.ts(Instant.now()));
        List<MemberStats> members=db.sql.query("SELECT u.id,u.name,COUNT(CASE WHEN at.status='PRESENT' THEN 1 END) present_count,"+
            "COUNT(CASE WHEN at.status='ABSENT' THEN 1 END) absent_count,MAX(CASE WHEN at.status='PRESENT' THEN e.starts_at END) last_attended " +
            "FROM group_members gm JOIN users u ON u.id=gm.user_id " +
            "LEFT JOIN group_event_attendance at ON at.user_id=gm.user_id AND at.event_id IN (SELECT id FROM events WHERE group_id=gm.group_id AND cancelled=FALSE) " +
            "LEFT JOIN events e ON e.id=at.event_id AND e.group_id=gm.group_id AND e.cancelled=FALSE " +
            "WHERE gm.group_id=? GROUP BY u.id,u.name ORDER BY u.name",
            (r,n)->{
                int present=r.getInt("present_count"),absent=r.getInt("absent_count");
                var ts=r.getTimestamp("last_attended");
                return new MemberStats(r.getString("id"),r.getString("name"),present,absent,present+absent,
                    present+absent==0?0:Math.round(1000.0*present/(present+absent))/10.0,ts==null?null:ts.toInstant());
            },groupId);
        // Only counts explicit verification. For zero marks, rates are displayed as not yet available in UI.
        int present=members.stream().mapToInt(MemberStats::present).sum(),absent=members.stream().mapToInt(MemberStats::absent).sum();
        List<EventStats> events=db.sql.query("SELECT e.id,e.title,e.starts_at,"+
            "(SELECT COUNT(*) FROM group_event_attendance x WHERE x.event_id=e.id AND x.status='PRESENT') present_count,"+
            "(SELECT COUNT(*) FROM group_event_attendance x WHERE x.event_id=e.id AND x.status='ABSENT') absent_count,"+
            "(SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=e.group_id AND (gm.user_id=e.organizer_id OR EXISTS (SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=gm.user_id))) - " +
            "(SELECT COUNT(*) FROM group_event_attendance x JOIN group_members gm ON gm.user_id=x.user_id AND gm.group_id=e.group_id WHERE x.event_id=e.id) unmarked_count " +
            "FROM events e WHERE e.group_id=? AND e.cancelled=FALSE AND e.starts_at IS NOT NULL AND e.ends_at<=? ORDER BY e.starts_at DESC LIMIT 30",
            (r,n)->new EventStats(r.getString(1),r.getString(2),r.getTimestamp(3).toInstant(),r.getInt(4),r.getInt(5),Math.max(0,r.getInt(6))),groupId,Db.ts(Instant.now()));
        return new Dashboard(groupId,total,past,present+absent,present+absent==0?0:Math.round(1000.0*present/(present+absent))/10.0,members,events);
    }
    @GetMapping("/events/{eventId}/attendance") List<Attendance> roster(Authentication a,@PathVariable String groupId,@PathVariable String eventId){
        authorized(a,groupId);event(groupId,eventId);
        return db.sql.query("SELECT u.id,u.name,i.response,at.status FROM ("+
            "SELECT user_id FROM invitations WHERE event_id=? UNION SELECT organizer_id FROM events WHERE id=?"+
            ") x JOIN group_members gm ON gm.user_id=x.user_id AND gm.group_id=? JOIN users u ON u.id=x.user_id LEFT JOIN invitations i ON i.user_id=x.user_id AND i.event_id=? "+
            "LEFT JOIN group_event_attendance at ON at.user_id=x.user_id AND at.event_id=? ORDER BY u.name",
            (r,n)->new Attendance(r.getString(1),r.getString(2),r.getString(3),r.getString(4)),eventId,eventId,groupId,eventId,eventId);
    }
    @PutMapping("/events/{eventId}/attendance") @Transactional
    List<Attendance> mark(Authentication a,@PathVariable String groupId,@PathVariable String eventId,@Valid @RequestBody MarkInput input){
        authorized(a,groupId);event(groupId,eventId);
        if(!Set.of("PRESENT","ABSENT").contains(input.status()))throw ApiException.bad("status must be PRESENT or ABSENT");
        int eligible=db.sql.queryForObject("SELECT COUNT(*) FROM events e WHERE e.id=? AND (e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=?))",Integer.class,eventId,input.userId(),input.userId());
        if(eligible==0 || groups.role(input.userId(),groupId)==null)throw ApiException.bad("User must be a current group member who participated in this event");
        db.sql.update("INSERT INTO group_event_attendance(event_id,user_id,status,verified_by,verified_at) VALUES(?,?,?,?,?) "+
            "ON DUPLICATE KEY UPDATE status=VALUES(status),verified_by=VALUES(verified_by),verified_at=VALUES(verified_at)",
            eventId,input.userId(),input.status(),a.getName(),Db.ts(Instant.now()));
        return roster(a,groupId,eventId);
    }
    @DeleteMapping("/events/{eventId}/attendance/{userId}") @Transactional
    List<Attendance> clear(Authentication a,@PathVariable String groupId,@PathVariable String eventId,@PathVariable String userId){
        authorized(a,groupId);event(groupId,eventId);
        db.sql.update("DELETE FROM group_event_attendance WHERE event_id=? AND user_id=?",eventId,userId);
        return roster(a,groupId,eventId);
    }
}
