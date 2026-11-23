package com.eventsync;

import java.time.*;
import java.util.*;
import java.util.stream.*;
import org.springframework.stereotype.Service;

@Service
class SchedulingService {
    private final Db db;
    SchedulingService(Db db){this.db=db;}
    record Interval(Instant start,Instant end) {
        boolean overlaps(Interval other){return start.isBefore(other.end)&&end.isAfter(other.start);}
        boolean covers(Instant a,Instant b){return !start.isAfter(a)&&!end.isBefore(b);}
    }
    record Override(Interval range,String status) {}
    record Suggestion(Instant start,Instant end,String localStart,int availableCount,int totalParticipants,
                      List<Db.PublicUser> availableUsers,List<Db.PublicUser> unavailableUsers,boolean allAvailable) {}
    record Recommendations(String eventId,int participantCount,int slotMinutes,List<Suggestion> suggestions) {}
    record Candidate(Instant start,Instant end,int count,List<Db.PublicUser> yes,List<Db.PublicUser> no) {}

    Recommendations recommend(String eventId){
        var rows=db.sql.queryForList("SELECT window_start,window_end,duration_minutes,status,time_zone FROM events WHERE id=?",eventId);
        if(rows.isEmpty())throw ApiException.missing();
        var r=rows.getFirst();String status=(String)r.get("status");
        if(!Set.of("DRAFT","COLLECTING").contains(status))throw ApiException.bad("Event is no longer collecting availability");
        Instant start=((java.sql.Timestamp)r.get("window_start")).toInstant(),end=((java.sql.Timestamp)r.get("window_end")).toInstant();
        int duration=((Number)r.get("duration_minutes")).intValue();
        String organizer=db.sql.queryForObject("SELECT organizer_id FROM events WHERE id=?",String.class,eventId);
        var participants=new LinkedHashSet<String>();participants.add(organizer);
        participants.addAll(db.sql.queryForList("SELECT user_id FROM invitations WHERE event_id=? AND response<>'DECLINED'",String.class,eventId));
        if(participants.size()>150)throw ApiException.bad("Events are currently limited to 150 participants");
        var names=new HashMap<String,Db.PublicUser>();
        var available=new HashMap<String,List<Interval>>();var busy=new HashMap<String,List<Interval>>();var committed=new HashMap<String,List<Interval>>();var overrides=new HashMap<String,List<Override>>();
        for(var user:participants){
            var u=db.user(user);names.put(user,new Db.PublicUser(user,u.name()));
            available.put(user,db.sql.query("SELECT starts_at,ends_at FROM event_availability WHERE event_id=? AND user_id=? ORDER BY starts_at",
                (rr,n)->new Interval(rr.getTimestamp(1).toInstant(),rr.getTimestamp(2).toInstant()),eventId,user));
            var busyRanges=new ArrayList<>(db.sql.query("SELECT starts_at,ends_at FROM imported_busy WHERE user_id=? AND starts_at<? AND ends_at>?",
                (rr,n)->new Interval(rr.getTimestamp(1).toInstant(),rr.getTimestamp(2).toInstant()),user,Db.ts(end),Db.ts(start)));
            committed.put(user,db.sql.query("SELECT e.starts_at,e.ends_at FROM events e WHERE e.status='FINALIZED' AND e.cancelled=FALSE AND e.starts_at<? AND e.ends_at>? AND (e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=? AND i.response='ACCEPTED'))",
                (rr,n)->new Interval(rr.getTimestamp(1).toInstant(),rr.getTimestamp(2).toInstant()),Db.ts(end),Db.ts(start),user,user));
            busy.put(user,busyRanges);
            overrides.put(user,db.sql.query("SELECT starts_at,ends_at,status FROM manual_overrides WHERE user_id=? AND starts_at<? AND ends_at>?",
                (rr,n)->new Override(new Interval(rr.getTimestamp(1).toInstant(),rr.getTimestamp(2).toInstant()),rr.getString(3)),user,Db.ts(end),Db.ts(start)));
        }
        List<Candidate> all=new ArrayList<>();
        Duration length=Duration.ofMinutes(duration);
        for(Instant cursor=start;!cursor.plus(length).isAfter(end);cursor=cursor.plus(Duration.ofMinutes(30))){
            var slot=new Interval(cursor,cursor.plus(length));
            List<Db.PublicUser> yes=new ArrayList<>(),no=new ArrayList<>();
            for(var id:participants){
                if(isAvailable(slot,available.get(id),busy.get(id),overrides.get(id),committed.get(id)))yes.add(names.get(id));else no.add(names.get(id));
            }
            yes.sort(Comparator.comparing(Db.PublicUser::name));no.sort(Comparator.comparing(Db.PublicUser::name));
            all.add(new Candidate(slot.start,slot.end,yes.size(),yes,no));
        }
        all.sort(Comparator.comparingInt(Candidate::count).reversed().thenComparing(Candidate::start));
        ZoneId zone=ZoneId.of((String)r.get("time_zone"));
        var best=all.stream().limit(20).map(c->new Suggestion(c.start,c.end,c.start.atZone(zone).toString(),c.count(),participants.size(),c.yes(),c.no(),c.count()==participants.size())).toList();
        return new Recommendations(eventId,participants.size(),30,best);
    }
    // A participant must affirmatively select the ENTIRE proposed interval. Manual overrides only
    // modify external busy information; they do not constitute an RSVP or event availability.
    static boolean isAvailable(Interval slot,List<Interval> choices,List<Interval> busy,List<Override> overrides){
        return isAvailable(slot,choices,busy,overrides,List.of());
    }
    static boolean isAvailable(Interval slot,List<Interval> choices,List<Interval> busy,List<Override> overrides,List<Interval> committed){
        if(!covered(slot,choices))return false;
        if(committed.stream().anyMatch(slot::overlaps))return false;
        SortedSet<Instant> boundaries=new TreeSet<>();boundaries.add(slot.start);boundaries.add(slot.end);
        for(var b:busy){if(b.overlaps(slot)){if(b.start.isAfter(slot.start))boundaries.add(b.start);if(b.end.isBefore(slot.end))boundaries.add(b.end);}}
        for(var o:overrides){if(o.range.overlaps(slot)){if(o.range.start.isAfter(slot.start))boundaries.add(o.range.start);if(o.range.end.isBefore(slot.end))boundaries.add(o.range.end);}}
        var cuts=new ArrayList<>(boundaries);
        for(int i=0;i<cuts.size()-1;i++){
            Instant a=cuts.get(i),b=cuts.get(i+1);
            var override=overrides.stream().filter(o->o.range.covers(a,b)).findFirst();
            if(override.isPresent()){
                if("BUSY".equals(override.get().status))return false;
                continue; // Explicit AVAILABLE supersedes imported busy, but not participation.
            }
            if(busy.stream().anyMatch(x->x.covers(a,b)))return false;
        }
        return true;
    }
    static boolean covered(Interval slot,List<Interval> selections){
        Instant until=slot.start;
        for(var range:selections.stream().sorted(Comparator.comparing(Interval::start)).toList()){
            if(range.start.isAfter(until))break;
            if(range.end.isAfter(until))until=range.end;
            if(!until.isBefore(slot.end))return true;
        }
        return false;
    }
}
