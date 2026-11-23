package com.eventsync;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/friends")
class FriendsController {
    private final Db db;
    FriendsController(Db db){this.db=db;}
    record Request(@NotBlank String userId) {}
    record Decision(@NotNull Boolean accept) {}
    record Friend(Db.PublicUser user,String status,boolean incoming) {}
    @GetMapping("/search") List<Db.PublicUser> search(Authentication a,@RequestParam String query) {
        if(query.trim().length()<3||query.length()>80) throw ApiException.bad("Search must contain 3–80 characters");
        String needle=query.trim().toLowerCase(Locale.ROOT);
        if(needle.matches("[a-z0-9_]{3,32}#[0-9]{1,18}")) {
            String[] parts=needle.split("#",2);
            long discriminator;
            try { discriminator=Long.parseLong(parts[1]); } catch(NumberFormatException e){return List.of();}
            return db.sql.query("SELECT u.id,u.name FROM user_handles h JOIN users u ON u.id=h.user_id WHERE h.username=? AND h.discriminator=? AND u.id<>?",
                (r,n)->new Db.PublicUser(r.getString(1),r.getString(2)),parts[0],discriminator,a.getName());
        }
        String q="%"+needle.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        return db.sql.query("SELECT id,name FROM users WHERE id<>? AND (LOWER(name) LIKE ? ESCAPE '!' OR LOWER(email) LIKE ? ESCAPE '!') ORDER BY name LIMIT 20",
            (r,n)->new Db.PublicUser(r.getString(1),r.getString(2)),a.getName(),q,q);
    }
    @GetMapping List<Friend> list(Authentication a){
        return db.sql.query("SELECT u.id,u.name,f.status,f.requester_id FROM friendships f JOIN users u ON u.id=CASE WHEN f.low_id=? THEN f.high_id ELSE f.low_id END WHERE f.low_id=? OR f.high_id=? ORDER BY u.name",
            (r,n)->new Friend(new Db.PublicUser(r.getString(1),r.getString(2)),r.getString(3),!r.getString(4).equals(a.getName())),a.getName(),a.getName(),a.getName());
    }
    @PostMapping("/requests") @Transactional
    Map<String,Boolean> request(Authentication a,@Valid @RequestBody Request r){
        if(a.getName().equals(r.userId())) throw ApiException.bad("Cannot add yourself");
        db.user(r.userId()); String[] pair=pair(a.getName(),r.userId());
        db.sql.update("INSERT INTO friendships(low_id,high_id,requester_id,status) VALUES(?,?,?,'PENDING')",pair[0],pair[1],a.getName());
        return Map.of("ok",true);
    }
    @PostMapping("/requests/{userId}/respond") @Transactional
    Map<String,Boolean> respond(Authentication a,@PathVariable String userId,@Valid @RequestBody Decision r){
        String[] p=pair(a.getName(),userId);
        int changed=r.accept()?db.sql.update("UPDATE friendships SET status='ACCEPTED' WHERE low_id=? AND high_id=? AND status='PENDING' AND requester_id=?",p[0],p[1],userId)
            :db.sql.update("DELETE FROM friendships WHERE low_id=? AND high_id=? AND status='PENDING' AND requester_id=?",p[0],p[1],userId);
        if(changed==0) throw ApiException.missing(); return Map.of("ok",true);
    }
    @DeleteMapping("/{userId}") Map<String,Boolean> remove(Authentication a,@PathVariable String userId){
        String[] p=pair(a.getName(),userId); db.sql.update("DELETE FROM friendships WHERE low_id=? AND high_id=?",p[0],p[1]); return Map.of("ok",true);
    }
    static String[] pair(String a,String b){return a.compareTo(b)<0?new String[]{a,b}:new String[]{b,a};}
    void requireFriend(String me,String other){
        String[] p=pair(me,other);
        Integer count=db.sql.queryForObject("SELECT COUNT(*) FROM friendships WHERE low_id=? AND high_id=? AND status='ACCEPTED'",Integer.class,p[0],p[1]);
        if(count==null||count==0) throw ApiException.forbidden();
    }
}
