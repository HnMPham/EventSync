package com.eventsync;

import java.time.Instant;
import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

@Service
class Notifications {
    private final Db db;
    Notifications(Db db){this.db=db;}
    void send(String user, String event, String category, String message) {
        db.sql.update("INSERT INTO notifications(id,user_id,event_id,category,message,created_at) VALUES(?,?,?,?,?,?)",
            Db.id(),user,event,category,message,Db.ts(Instant.now()));
    }
    void toParticipants(String event,String except,String category,String message) {
        for(String user:db.sql.queryForList("SELECT user_id FROM invitations WHERE event_id=?",String.class,event))
            if(!user.equals(except))send(user,event,category,message);
    }
}

@RestController
@RequestMapping("/api/notifications")
class NotificationsController {
    private final Db db;
    NotificationsController(Db db){this.db=db;}
    record Notification(String id,String eventId,String category,String message,Instant createdAt,Instant readAt) {}
    @GetMapping List<Notification> list(Authentication a){
        return db.sql.query("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",(r,n)->
            new Notification(r.getString("id"),r.getString("event_id"),r.getString("category"),r.getString("message"),
                r.getTimestamp("created_at").toInstant(),r.getTimestamp("read_at")==null?null:r.getTimestamp("read_at").toInstant()),a.getName());
    }
    @PostMapping("/{id}/read") Map<String,Boolean> read(Authentication a,@PathVariable String id) {
        if(db.sql.update("UPDATE notifications SET read_at=? WHERE id=? AND user_id=?",Db.ts(Instant.now()),id,a.getName())==0)throw ApiException.missing();
        return Map.of("ok",true);
    }
}
