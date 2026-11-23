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
@RequestMapping("/api/groups")
class GroupsController {
    private final Db db;
    GroupsController(Db db){this.db=db;}
    record GroupInput(@NotBlank @Size(max=160) String name,@Size(max=1000) String description) {}
    record AddMember(@NotBlank String userId) {}
    record Role(@NotBlank String role) {}
    record Member(Db.PublicUser user,String role) {}
    record Group(String id,String name,String description,String ownerId,String myRole,List<Member> members) {}

    String role(String user,String group){
        return db.sql.query("SELECT role FROM group_members WHERE group_id=? AND user_id=?",(r,n)->r.getString(1),group,user)
            .stream().findFirst().orElse(null);
    }
    void requireMember(String user,String group){if(role(user,group)==null)throw ApiException.forbidden();}
    void requireAdmin(String user,String group){if(!"ADMIN".equals(role(user,group)))throw ApiException.forbidden();}
    private Group detail(String user,String id){
        String role=role(user,id);if(role==null)throw ApiException.missing();
        return db.sql.query("SELECT id,name,description,owner_id FROM event_groups WHERE id=?",(r,n)->
            new Group(r.getString(1),r.getString(2),r.getString(3),r.getString(4),role,
                db.sql.query("SELECT u.id,u.name,gm.role FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY u.name",
                    (m,i)->new Member(new Db.PublicUser(m.getString(1),m.getString(2)),m.getString(3)),id)),id).stream().findFirst().orElseThrow(ApiException::missing);
    }
    @GetMapping List<Group> list(Authentication a){
        return db.sql.queryForList("SELECT group_id FROM group_members WHERE user_id=? ORDER BY group_id",String.class,a.getName())
            .stream().map(id->detail(a.getName(),id)).toList();
    }
    @GetMapping("/{id}") Group get(Authentication a,@PathVariable String id){return detail(a.getName(),id);}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    Group create(Authentication a,@Valid @RequestBody GroupInput input){
        String id=Db.id();db.sql.update("INSERT INTO event_groups(id,name,description,owner_id,created_at) VALUES(?,?,?,?,?)",
            id,input.name().trim(),input.description()==null?"":input.description(),a.getName(),Db.ts(Instant.now()));
        db.sql.update("INSERT INTO group_members(group_id,user_id,role) VALUES(?,?,'ADMIN')",id,a.getName());
        return detail(a.getName(),id);
    }
    @PutMapping("/{id}") @Transactional
    Group update(Authentication a,@PathVariable String id,@Valid @RequestBody GroupInput input){
        requireAdmin(a.getName(),id);db.sql.update("UPDATE event_groups SET name=?,description=? WHERE id=?",input.name().trim(),input.description()==null?"":input.description(),id);
        return detail(a.getName(),id);
    }
    @PostMapping("/{id}/members") @Transactional
    Group add(Authentication a,@PathVariable String id,@Valid @RequestBody AddMember input){
        requireAdmin(a.getName(),id);db.user(input.userId());
        if(role(input.userId(),id)!=null)throw new ApiException(HttpStatus.CONFLICT,"User is already a group member");
        db.sql.update("INSERT INTO group_members(group_id,user_id,role) VALUES(?,?,'MEMBER')",id,input.userId());
        return detail(a.getName(),id);
    }
    @PutMapping("/{id}/members/{userId}/role") @Transactional
    Group changeRole(Authentication a,@PathVariable String id,@PathVariable String userId,@Valid @RequestBody Role input){
        requireAdmin(a.getName(),id);
        if(!Set.of("ADMIN","MEMBER").contains(input.role()))throw ApiException.bad("role must be ADMIN or MEMBER");
        var owner=db.sql.queryForList("SELECT owner_id FROM event_groups WHERE id=?",String.class,id);
        if(owner.contains(userId))throw ApiException.bad("Cannot change the group owner's role");
        if(db.sql.update("UPDATE group_members SET role=? WHERE group_id=? AND user_id=?",input.role(),id,userId)==0)throw ApiException.missing();
        return detail(a.getName(),id);
    }
    @DeleteMapping("/{id}/members/{userId}") @Transactional
    Map<String,Boolean> remove(Authentication a,@PathVariable String id,@PathVariable String userId){
        if(!a.getName().equals(userId))requireAdmin(a.getName(),id);else requireMember(a.getName(),id);
        if(db.sql.queryForList("SELECT owner_id FROM event_groups WHERE id=?",String.class,id).contains(userId))throw ApiException.bad("Cannot remove the group owner");
        if(db.sql.update("DELETE FROM group_members WHERE group_id=? AND user_id=?",id,userId)==0)throw ApiException.missing();
        return Map.of("ok",true);
    }
    @DeleteMapping("/{id}") @Transactional
    Map<String,Boolean> delete(Authentication a,@PathVariable String id){
        if(db.sql.update("DELETE FROM event_groups WHERE id=? AND owner_id=?",id,a.getName())==0)throw ApiException.forbidden();
        return Map.of("ok",true);
    }
}
