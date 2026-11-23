package com.eventsync;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/availability/overrides")
class AvailabilityOverridesController {
    private final Db db;
    AvailabilityOverridesController(Db db){this.db=db;}
    record OverrideInput(@NotNull Instant start,@NotNull Instant end,@NotNull State status) {}
    enum State { AVAILABLE, BUSY }
    record Override(String id,Instant start,Instant end,State status) {}
    @GetMapping List<Override> list(Authentication a,@RequestParam Instant start,@RequestParam Instant end){
        validate(start,end);
        return db.sql.query("SELECT id,starts_at,ends_at,status FROM manual_overrides WHERE user_id=? AND starts_at<? AND ends_at>? ORDER BY starts_at",
            (r,n)->new Override(r.getString(1),r.getTimestamp(2).toInstant(),r.getTimestamp(3).toInstant(),State.valueOf(r.getString(4))),a.getName(),Db.ts(end),Db.ts(start));
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    Override create(Authentication a,@Valid @RequestBody OverrideInput r){
        validate(r.start(),r.end());
        // Serialize override writes for this user so two concurrent requests cannot
        // both pass the overlap check and persist conflicting availability.
        db.lockUser(a.getName());
        Integer n=db.sql.queryForObject("SELECT COUNT(*) FROM manual_overrides WHERE user_id=? AND starts_at<? AND ends_at>?",Integer.class,a.getName(),Db.ts(r.end()),Db.ts(r.start()));
        if(n!=null&&n>0)throw new ApiException(HttpStatus.CONFLICT,"Manual overrides may not overlap");
        String id=Db.id();db.sql.update("INSERT INTO manual_overrides(id,user_id,starts_at,ends_at,status) VALUES(?,?,?,?,?)",id,a.getName(),Db.ts(r.start()),Db.ts(r.end()),r.status().name());
        return new Override(id,r.start(),r.end(),r.status());
    }
    @DeleteMapping("/{id}") Map<String,Boolean> delete(Authentication a,@PathVariable String id){
        if(db.sql.update("DELETE FROM manual_overrides WHERE id=? AND user_id=?",id,a.getName())==0)throw ApiException.missing();
        return Map.of("ok",true);
    }
    static void validate(Instant start,Instant end){
        if(start==null||end==null||!start.isBefore(end)||Duration.between(start,end).compareTo(Duration.ofDays(90))>0)
            throw ApiException.bad("Time interval must be positive and at most 90 days");
    }
}
