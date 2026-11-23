package com.eventsync;

import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me")
class ProfileController {
    private final Db db;private final PasswordEncoder passwords;
    ProfileController(Db db,PasswordEncoder passwords){this.db=db;this.passwords=passwords;}
    record Update(@NotBlank @Size(max=80) String name,@NotBlank String timeZone) {}
    record ChangePassword(@NotBlank String currentPassword,@NotNull @Size(min=10,max=72) String newPassword) {}
    record ChangeEmail(@NotBlank @Email @Size(max=254) String newEmail,@NotBlank String currentPassword) {}
    @PutMapping @Transactional
    Db.User update(Authentication a,@Valid @RequestBody Update input){
        ZoneId.of(input.timeZone());
        db.sql.update("UPDATE users SET name=?,time_zone=? WHERE id=?",input.name().trim(),input.timeZone(),a.getName());
        return db.user(a.getName());
    }
    @PutMapping("/email") @Transactional
    Db.User changeEmail(Authentication a,@Valid @RequestBody ChangeEmail input){
        String hash=db.sql.queryForObject("SELECT password_hash FROM users WHERE id=?",String.class,a.getName());
        if(!passwords.matches(input.currentPassword(),hash))throw new ApiException(HttpStatus.FORBIDDEN,"Incorrect current password");
        String email=input.newEmail().trim().toLowerCase(Locale.ROOT);
        if(db.sql.queryForList("SELECT id FROM users WHERE email=? AND id<>?",String.class,email,a.getName()).size()>0)
            throw new ApiException(HttpStatus.CONFLICT,"Email already registered");
        db.sql.update("UPDATE users SET email=? WHERE id=?",email,a.getName());
        return db.user(a.getName());
    }
    @PostMapping("/password") @Transactional
    Map<String,Boolean> changePassword(Authentication a,@Valid @RequestBody ChangePassword input){
        if(input.newPassword().getBytes(StandardCharsets.UTF_8).length>72)throw ApiException.bad("Password must fit in 72 UTF-8 bytes");
        String hash=db.sql.queryForObject("SELECT password_hash FROM users WHERE id=?",String.class,a.getName());
        if(!passwords.matches(input.currentPassword(),hash))throw new ApiException(HttpStatus.FORBIDDEN,"Incorrect current password");
        db.sql.update("UPDATE users SET password_hash=? WHERE id=?",passwords.encode(input.newPassword()),a.getName());
        // Revoke all other sessions. Current bearer token stays valid until logout/expiry.
        db.sql.update("DELETE FROM sessions WHERE user_id=? AND token_hash<>?",a.getName(),a.getDetails());
        return Map.of("ok",true);
    }
}
