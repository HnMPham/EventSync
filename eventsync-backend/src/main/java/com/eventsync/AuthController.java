package com.eventsync;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class AuthController {
    private final Db db; private final PasswordEncoder passwords;
    AuthController(Db db,PasswordEncoder passwords){this.db=db; this.passwords=passwords;}
    record Signup(@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(max=80) String name,
                  @NotNull @Size(min=10,max=72) String password,@NotBlank String timeZone) {}
    record Login(@NotBlank @Email @Size(max=254) String email,@NotNull @Size(max=72) String password) {}
    record LoginResult(String accessToken,Instant expiresAt,Db.User user) {}
    @GetMapping("/health") Map<String,String> health(){
        // Readiness means the database is reachable, not merely that HTTP started.
        // A DB outage should return 5xx so a reverse proxy does not advertise health.
        db.sql.queryForObject("SELECT 1",Integer.class);
        return Map.of("status","ok","database","connected");
    }
    @PostMapping("/auth/signup") @ResponseStatus(HttpStatus.CREATED) @Transactional
    LoginResult signup(@Valid @RequestBody Signup r) {
        ZoneId.of(r.timeZone());
        if(r.password().getBytes(StandardCharsets.UTF_8).length>72) throw ApiException.bad("Password must fit within 72 UTF-8 bytes");
        String email=r.email().trim().toLowerCase(Locale.ROOT);
        if(!db.sql.queryForList("SELECT id FROM users WHERE email=?",String.class,email).isEmpty())
            throw new ApiException(HttpStatus.CONFLICT,"Email already registered");
        String id=Db.id(); db.sql.update("INSERT INTO users(id,email,name,password_hash,time_zone) VALUES(?,?,?,?,?)",id,email,r.name().trim(),passwords.encode(r.password()),r.timeZone());
        return issue(id);
    }
    @PostMapping("/auth/login") @Transactional
    LoginResult login(@Valid @RequestBody Login r) {
        var rows=db.sql.queryForList("SELECT id,password_hash FROM users WHERE email=?",r.email().trim().toLowerCase(Locale.ROOT));
        String stored=rows.isEmpty()?DUMMY_HASH:(String)rows.getFirst().get("password_hash");
        boolean matches=passwords.matches(r.password(),stored);
        if(rows.isEmpty()||!matches) throw new ApiException(HttpStatus.UNAUTHORIZED,"Invalid email or password");
        return issue((String)rows.getFirst().get("id"));
    }
    private static final String DUMMY_HASH=new BCryptPasswordEncoderHolder().hash;
    private static class BCryptPasswordEncoderHolder { final String hash=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(Crypto.random()); }
    private LoginResult issue(String id) {
        String token=Crypto.random(); Instant expiry=Instant.now().plus(Duration.ofHours(12));
        db.sql.update("DELETE FROM sessions WHERE expires_at<?",Db.ts(Instant.now()));
        db.sql.update("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",Crypto.hash(token),id,Db.ts(expiry));
        return new LoginResult(token,expiry,db.user(id));
    }
    @GetMapping("/me") Db.User me(Authentication a){return db.user(a.getName());}
    @PostMapping("/auth/logout") Map<String,Boolean> logout(Authentication a){
        db.sql.update("DELETE FROM sessions WHERE token_hash=?",a.getDetails());return Map.of("ok",true);
    }
}
