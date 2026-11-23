package com.eventsync;

import java.time.Instant;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Application-wide administration, completely separate from group role management. */
@RestController
@RequestMapping("/api/admin")
class AdminController {
    private final Db db;
    AdminController(Db db){ this.db=db; }

    record Summary(long users, long groups, long events, long pendingInvitations) {}
    record AdminUser(String id,String name,String email,boolean systemAdmin,long groupCount) {}
    record Member(String id,String name,String email,String role) {}
    record ManagedGroup(String id,String name,String description,String ownerId,String ownerName,
                        List<Member> members,long eventCount) {}
    record GroupDetails(@NotBlank @Size(max=160) String name,@Size(max=1000) String description) {}
    record AddMember(@NotBlank String userId) {}
    record ChangeRole(@NotBlank String role) {}

    private void requireAdmin(Authentication a){
        Boolean ok=db.sql.queryForObject("SELECT system_admin FROM users WHERE id=?", Boolean.class,a.getName());
        if(!Boolean.TRUE.equals(ok)) throw ApiException.forbidden();
    }
    private long count(String sql){ return db.sql.queryForObject(sql, Long.class); }
    private void audit(Authentication a,String action,String type,String target){
        db.sql.update("INSERT INTO admin_audit_log(id,admin_id,action,target_type,target_id,occurred_at) VALUES(?,?,?,?,?,?)",
            Db.id(),a.getName(),action,type,target,Db.ts(Instant.now()));
    }
    @GetMapping("/summary") Summary summary(Authentication a){
        requireAdmin(a);
        return new Summary(count("SELECT COUNT(*) FROM users"),count("SELECT COUNT(*) FROM event_groups"),
            count("SELECT COUNT(*) FROM events"),count("SELECT COUNT(*) FROM invitations WHERE response='PENDING'"));
    }
    @GetMapping("/users") List<AdminUser> users(Authentication a){
        requireAdmin(a);
        return db.sql.query("SELECT u.id,u.name,u.email,u.system_admin,COUNT(gm.group_id) AS group_count " +
            "FROM users u LEFT JOIN group_members gm ON gm.user_id=u.id " +
            "GROUP BY u.id,u.name,u.email,u.system_admin ORDER BY u.name,u.email",
            (r,n)->new AdminUser(r.getString(1),r.getString(2),r.getString(3),r.getBoolean(4),r.getLong(5)));
    }
    @GetMapping("/groups") List<ManagedGroup> groups(Authentication a){
        requireAdmin(a);
        return db.sql.queryForList("SELECT id FROM event_groups ORDER BY name,id",String.class)
            .stream().map(this::detail).toList();
    }
    @GetMapping("/groups/{id}") ManagedGroup group(Authentication a,@PathVariable String id){
        requireAdmin(a);return detail(id);
    }
    private ManagedGroup detail(String id){
        return db.sql.query("SELECT g.id,g.name,g.description,g.owner_id,u.name," +
                "(SELECT COUNT(*) FROM events e WHERE e.group_id=g.id) FROM event_groups g " +
                "JOIN users u ON u.id=g.owner_id WHERE g.id=?",(r,n)->
                new ManagedGroup(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),
                    db.sql.query("SELECT u.id,u.name,u.email,gm.role FROM group_members gm " +
                        "JOIN users u ON gm.user_id=u.id WHERE gm.group_id=? ORDER BY u.name",(m,k)->
                        new Member(m.getString(1),m.getString(2),m.getString(3),m.getString(4)),id),r.getLong(6)),id)
            .stream().findFirst().orElseThrow(ApiException::missing);
    }
    @PutMapping("/groups/{id}") @Transactional
    ManagedGroup update(Authentication a,@PathVariable String id,@Valid @RequestBody GroupDetails input){
        requireAdmin(a);
        if(db.sql.update("UPDATE event_groups SET name=?,description=? WHERE id=?",input.name().trim(),
            input.description()==null?"":input.description(),id)==0)throw ApiException.missing();
        audit(a,"UPDATE_GROUP","GROUP",id);
        return detail(id);
    }
    @PostMapping("/groups/{id}/members") @Transactional
    ManagedGroup addMember(Authentication a,@PathVariable String id,@Valid @RequestBody AddMember input){
        requireAdmin(a);detail(id);db.user(input.userId());
        if(db.sql.queryForObject("SELECT COUNT(*) FROM group_members WHERE group_id=? AND user_id=?",Long.class,id,input.userId())>0)
            throw new ApiException(HttpStatus.CONFLICT,"Already a group member");
        db.sql.update("INSERT INTO group_members(group_id,user_id,role) VALUES(?,?,'MEMBER')",id,input.userId());
        audit(a,"ADD_MEMBER","GROUP",id);
        return detail(id);
    }
    @PutMapping("/groups/{id}/members/{userId}/role") @Transactional
    ManagedGroup changeRole(Authentication a,@PathVariable String id,@PathVariable String userId,@Valid @RequestBody ChangeRole input){
        requireAdmin(a);
        if(!Set.of("ADMIN","MEMBER").contains(input.role())) throw ApiException.bad("Role must be ADMIN or MEMBER");
        ManagedGroup group=detail(id);
        if(group.ownerId().equals(userId))throw ApiException.bad("Cannot change group owner's role");
        if(db.sql.update("UPDATE group_members SET role=? WHERE group_id=? AND user_id=?",input.role(),id,userId)==0)throw ApiException.missing();
        audit(a,"CHANGE_MEMBER_ROLE","GROUP",id);
        return detail(id);
    }
    @DeleteMapping("/groups/{id}/members/{userId}") @Transactional
    ManagedGroup removeMember(Authentication a,@PathVariable String id,@PathVariable String userId){
        requireAdmin(a);
        ManagedGroup group=detail(id);
        if(group.ownerId().equals(userId))throw ApiException.bad("Cannot remove the group owner");
        if(db.sql.update("DELETE FROM group_members WHERE group_id=? AND user_id=?",id,userId)==0)throw ApiException.missing();
        audit(a,"REMOVE_MEMBER","GROUP",id);
        return detail(id);
    }
    @DeleteMapping("/groups/{id}") @Transactional
    Map<String,Boolean> deleteGroup(Authentication a,@PathVariable String id){
        requireAdmin(a);detail(id);
        // Preserve events; fk_event_group ON DELETE SET NULL in V2 migration.
        db.sql.update("DELETE FROM event_groups WHERE id=?",id);
        audit(a,"DELETE_GROUP","GROUP",id);
        return Map.of("ok",true);
    }
}
