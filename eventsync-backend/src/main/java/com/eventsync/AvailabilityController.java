package com.eventsync;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/availability")
class AvailabilityController {
    private final Db db;private final FriendsController friends;
    AvailabilityController(Db db,FriendsController friends){this.db=db;this.friends=friends;}
    record Range(Instant start,Instant end) {
        boolean overlaps(Range other){return start.isBefore(other.end)&&end.isAfter(other.start);}
        boolean covers(Range other){return !start.isAfter(other.start)&&!end.isBefore(other.end);}
    }
    record Replace(@NotNull LocalDate weekStart,@NotBlank String timeZone,@NotNull @Size(max=169) Set<@NotNull Instant> slots) {}
    record Match(@NotNull LocalDate weekStart,@NotBlank String timeZone,@NotNull @Size(max=50) Set<@NotBlank String> friendIds) {}
    record Slot(Instant start,Instant end,String localTime,boolean youAvailable,int availableCount,List<Db.PublicUser> availableFriends,boolean best) {}
    record Week(LocalDate weekStart,String timeZone,List<Instant> selectedStarts,List<Range> busy,List<Map<String,Object>> outlookCoverage,List<Map<String,Object>> overrides) {}
    record Matches(List<Slot> slots,int highestCount) {}
    static List<Range> slots(LocalDate monday,String zone){
        if(monday.getDayOfWeek()!=DayOfWeek.MONDAY)throw ApiException.bad("weekStart must be a Monday");
        ZoneId z=ZoneId.of(zone);ZonedDateTime start=monday.atStartOfDay(z),end=monday.plusWeeks(1).atStartOfDay(z);
        List<Range> list=new ArrayList<>();
        for(var t=start;t.isBefore(end);t=t.plusHours(1)) list.add(new Range(t.toInstant(),t.plusHours(1).isAfter(end)?end.toInstant():t.plusHours(1).toInstant()));
        return list;
    }
    record CalendarSlot(Instant start,Instant end,String localTime) {}
    @GetMapping("/slots")
    List<CalendarSlot> grid(@RequestParam LocalDate weekStart,@RequestParam String timeZone){
        ZoneId z=ZoneId.of(timeZone);
        return slots(weekStart,timeZone).stream().map(s->new CalendarSlot(s.start(),s.end(),s.start().atZone(z).toString())).toList();
    }
    @GetMapping @Transactional(readOnly=true)
    Week get(Authentication a,@RequestParam LocalDate weekStart,@RequestParam String timeZone){
        var grid=slots(weekStart,timeZone);Instant start=grid.getFirst().start,end=grid.getLast().end;
        var chosen=manual(a.getName(),start,end).stream().map(Range::start).toList();
        var coverage=db.sql.query("SELECT calendar_id,range_start,range_end,synced_at FROM calendar_syncs WHERE user_id=? AND range_start<? AND range_end>?",
            (r,n)->Map.<String,Object>of("calendarId",r.getString(1),"start",r.getTimestamp(2).toInstant(),"end",r.getTimestamp(3).toInstant(),"syncedAt",r.getTimestamp(4).toInstant()),a.getName(),Db.ts(end),Db.ts(start));
        var overrides=db.sql.query("SELECT id,starts_at,ends_at,status FROM manual_overrides WHERE user_id=? AND starts_at<? AND ends_at>?",
            (r,n)->Map.<String,Object>of("id",r.getString(1),"start",r.getTimestamp(2).toInstant(),"end",r.getTimestamp(3).toInstant(),"status",r.getString(4)),a.getName(),Db.ts(end),Db.ts(start));
        return new Week(weekStart,timeZone,chosen,busy(a.getName(),start,end),coverage,overrides);
    }
    @PutMapping @Transactional
    Week replace(Authentication a,@Valid @RequestBody Replace r){
        var grid=slots(r.weekStart(),r.timeZone());var valid=grid.stream().map(Range::start).collect(java.util.stream.Collectors.toSet());
        if(!valid.containsAll(r.slots()))throw ApiException.bad("Slots must be hour boundaries within the selected local week");
        db.lockUser(a.getName());
        db.sql.update("DELETE FROM availability WHERE user_id=? AND starts_at<? AND ends_at>?",a.getName(),Db.ts(grid.getLast().end),Db.ts(grid.getFirst().start));
        for(var slot:grid)if(r.slots().contains(slot.start))db.sql.update("INSERT INTO availability(user_id,starts_at,ends_at) VALUES(?,?,?)",a.getName(),Db.ts(slot.start),Db.ts(slot.end));
        return get(a,r.weekStart(),r.timeZone());
    }
    @PostMapping("/matches") @Transactional(readOnly=true)
    Matches matches(Authentication a,@Valid @RequestBody Match r){
        var grid=slots(r.weekStart(),r.timeZone());Instant start=grid.getFirst().start,end=grid.getLast().end;
        for(String id:r.friendIds()) {if(id.equals(a.getName()))throw ApiException.bad("friendIds cannot include yourself");friends.requireFriend(a.getName(),id);}
        Map<String,List<Range>> manual=new HashMap<>(),busy=new HashMap<>();Map<String,List<SchedulingService.Override>> overrides=new HashMap<>();Map<String,Db.PublicUser> profiles=new HashMap<>();
        var ids=new HashSet<>(r.friendIds());ids.add(a.getName());
        for(String id:ids){
            manual.put(id,manual(id,start,end));busy.put(id,busy(id,start,end));
            overrides.put(id,db.sql.query("SELECT starts_at,ends_at,status FROM manual_overrides WHERE user_id=? AND starts_at<? AND ends_at>?",
                (rr,n)->new SchedulingService.Override(new SchedulingService.Interval(rr.getTimestamp(1).toInstant(),rr.getTimestamp(2).toInstant()),rr.getString(3)),id,Db.ts(end),Db.ts(start)));
            var u=db.user(id);profiles.put(id,new Db.PublicUser(id,u.name()));
        }
        List<Slot> results=new ArrayList<>();int best=0;
        for(Range slot:grid){
            var available=r.friendIds().stream().filter(id->effectiveFree(slot,manual.get(id),busy.get(id),overrides.get(id))).map(profiles::get).sorted(Comparator.comparing(Db.PublicUser::name)).toList();
            boolean me=effectiveFree(slot,manual.get(a.getName()),busy.get(a.getName()),overrides.get(a.getName()));
            if(me)best=Math.max(best,available.size());
            results.add(new Slot(slot.start,slot.end,slot.start.atZone(ZoneId.of(r.timeZone())).toString(),me,available.size(),available,false));
        }
        final int max=best;
        return new Matches(results.stream().map(s->new Slot(s.start,s.end,s.localTime,s.youAvailable,s.availableCount,s.availableFriends,s.youAvailable&&max>0&&s.availableCount==max)).toList(),max);
    }
    static boolean isFree(Range slot,List<Range> manual,List<Range> busy){
        // Merge adjacent/overlapping selections: friends may use different timezone hour boundaries.
        Instant covered=slot.start;
        for(Range r:manual.stream().sorted(Comparator.comparing(Range::start)).toList()){
            if(r.start.isAfter(covered))break;
            if(r.end.isAfter(covered))covered=r.end;
        }
        return !covered.isBefore(slot.end)&&busy.stream().noneMatch(slot::overlaps);
    }
    static boolean effectiveFree(Range slot,List<Range> manual,List<Range> busy,List<SchedulingService.Override> overrides){
        return SchedulingService.isAvailable(new SchedulingService.Interval(slot.start(),slot.end()),
            manual.stream().map(x->new SchedulingService.Interval(x.start(),x.end())).toList(),
            busy.stream().map(x->new SchedulingService.Interval(x.start(),x.end())).toList(),overrides);
    }
    List<Range> manual(String user,Instant start,Instant end){
        return db.sql.query("SELECT starts_at,ends_at FROM availability WHERE user_id=? AND starts_at<? AND ends_at>?",(r,n)->new Range(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant()),user,Db.ts(end),Db.ts(start));
    }
    List<Range> busy(String user,Instant start,Instant end){
        List<Range> list=new ArrayList<>(db.sql.query("SELECT starts_at,ends_at FROM imported_busy WHERE user_id=? AND starts_at<? AND ends_at>?",(r,n)->new Range(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant()),user,Db.ts(end),Db.ts(start)));
        list.addAll(db.sql.query("SELECT e.starts_at,e.ends_at FROM events e WHERE e.cancelled=FALSE AND e.starts_at<? AND e.ends_at>? AND (e.organizer_id=? OR EXISTS(SELECT 1 FROM invitations i WHERE i.event_id=e.id AND i.user_id=? AND i.response='ACCEPTED'))",(r,n)->new Range(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant()),Db.ts(end),Db.ts(start),user,user));
        return list;
    }
}
