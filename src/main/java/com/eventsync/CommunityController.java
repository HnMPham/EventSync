package com.eventsync;

import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Account handles, moderation and support requests. All elevated permissions are checked server-side. */
@RestController
@RequestMapping("/api/community")
class CommunityController {
    private final Db db;
    CommunityController(Db db) {this.db=db;}
    record Identity(String username,long discriminator,String tag,boolean organizationPublisher,String organizationName) {}
    record Rename(@NotBlank @Size(min=3,max=32) String username) {}
    record SupportInput(@NotBlank String kind,@NotBlank @Size(max=160) String subject,@NotBlank @Size(max=5000) String description) {}
    record SupportRow(String id,String userId,String email,String kind,String subject,String description,String status,String adminReply,Instant createdAt) {}
    record Review(@NotBlank String status,@Size(max=5000) String reply) {}
    record PublisherInput(boolean approved,@Size(max=160) String organizationName) {}
    record Publisher(String id,String name,String email,boolean approved,String organizationName) {}
    private static final Pattern HANDLE=Pattern.compile("[a-z0-9_]{3,32}");
    private void admin(Authentication a) {if(!db.user(a.getName()).systemAdmin())throw ApiException.forbidden();}
    private Identity identity(String id) {
        return db.sql.query("SELECT h.username,h.discriminator,u.organization_publisher,u.organization_name FROM user_handles h JOIN users u ON u.id=h.user_id WHERE h.user_id=?",
            (r,n)->{String username=r.getString(1);long d=r.getLong(2);return new Identity(username,d,username+"#"+String.format(Locale.ROOT,"%06d",d),r.getBoolean(3),r.getString(4));},id).stream().findFirst().orElseThrow(ApiException::missing);
    }
    @GetMapping("/identity") Identity me(Authentication a){return identity(a.getName());}
    @PutMapping("/identity") @Transactional Identity rename(Authentication a,@Valid @RequestBody Rename input){
        String username=input.username().trim().toLowerCase(Locale.ROOT);
        if(!HANDLE.matcher(username).matches())throw ApiException.bad("Username must use 3–32 lowercase letters, numbers or underscores");
        db.sql.update("UPDATE user_handles SET username=? WHERE user_id=?",username,a.getName());
        return identity(a.getName());
    }
    @PostMapping("/support") @ResponseStatus(HttpStatus.CREATED) @Transactional
    SupportRow submit(Authentication a,@Valid @RequestBody SupportInput input){
        if(!Set.of("ISSUE","REQUEST").contains(input.kind()))throw ApiException.bad("Type must be ISSUE or REQUEST");
        var count=db.sql.queryForObject("SELECT COUNT(*) FROM support_requests WHERE user_id=? AND created_at>?",Integer.class,a.getName(),Db.ts(Instant.now().minusSeconds(3600)));
        if(count!=null&&count>=5)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"Maximum five submissions per hour");
        String id=Db.id();db.sql.update("INSERT INTO support_requests(id,user_id,kind,subject,description,created_at) VALUES(?,?,?,?,?,?)",id,a.getName(),input.kind(),input.subject().trim(),input.description().trim(),Db.ts(Instant.now()));
        return getSupport(id);
    }
    private SupportRow getSupport(String id) {
        return db.sql.query("SELECT s.id,s.user_id,u.email,s.kind,s.subject,s.description,s.status,s.admin_reply,s.created_at FROM support_requests s JOIN users u ON u.id=s.user_id WHERE s.id=?",
            (r,n)->new SupportRow(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),r.getString(6),r.getString(7),r.getString(8),r.getTimestamp(9).toInstant()),id).stream().findFirst().orElseThrow(ApiException::missing);
    }
    @GetMapping("/support/mine") List<SupportRow> mine(Authentication a){return db.sql.queryForList("SELECT id FROM support_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100",String.class,a.getName()).stream().map(this::getSupport).toList();}
    @GetMapping("/admin/support") List<SupportRow> inbox(Authentication a){admin(a);return db.sql.queryForList("SELECT id FROM support_requests ORDER BY created_at DESC LIMIT 300",String.class).stream().map(this::getSupport).toList();}
    @PutMapping("/admin/support/{id}") @Transactional SupportRow review(Authentication a,@PathVariable String id,@Valid @RequestBody Review r){
        admin(a);if(!Set.of("OPEN","IN_PROGRESS","RESOLVED","REJECTED").contains(r.status()))throw ApiException.bad("Invalid status");
        if(db.sql.update("UPDATE support_requests SET status=?,admin_reply=?,resolved_at=? WHERE id=?",r.status(),r.reply(),Set.of("RESOLVED","REJECTED").contains(r.status())?Db.ts(Instant.now()):null,id)==0)throw ApiException.missing();
        return getSupport(id);
    }
    @GetMapping("/admin/publishers") List<Publisher> publishers(Authentication a){admin(a);
        return db.sql.query("SELECT id,name,email,organization_publisher,organization_name FROM users ORDER BY name",(r,n)->new Publisher(r.getString(1),r.getString(2),r.getString(3),r.getBoolean(4),r.getString(5)));
    }
    @PutMapping("/admin/publishers/{id}") @Transactional Publisher publisher(Authentication a,@PathVariable String id,@Valid @RequestBody PublisherInput in){
        admin(a);if(in.approved()&&(in.organizationName()==null||in.organizationName().isBlank()))throw ApiException.bad("Organization name is required");
        if(db.sql.update("UPDATE users SET organization_publisher=?,organization_name=? WHERE id=?",in.approved(),in.approved()?in.organizationName().trim():null,id)==0)throw ApiException.missing();
        db.sql.update("INSERT INTO admin_audit_log(id,admin_id,action,target_type,target_id,occurred_at) VALUES(?,?,?,?,?,?)",Db.id(),a.getName(),in.approved()?"APPROVE_PUBLISHER":"REVOKE_PUBLISHER","USER",id,Db.ts(Instant.now()));
        return publishers(a).stream().filter(x->x.id().equals(id)).findFirst().orElseThrow(ApiException::missing);
    }
}
