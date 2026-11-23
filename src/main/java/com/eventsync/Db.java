package com.eventsync;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

@Component
public class Db {
    final JdbcTemplate sql;
    public Db(JdbcTemplate sql) { this.sql=sql; }
    static Timestamp ts(Instant value) { return Timestamp.from(value); }
    static String id() { return UUID.randomUUID().toString(); }
    static final RowMapper<User> USER = (r,n) -> new User(r.getString("id"),r.getString("name"),r.getString("email"),r.getString("time_zone"),r.getBoolean("system_admin"));
    User user(String id) { return sql.query("SELECT * FROM users WHERE id=?", USER, id).stream().findFirst().orElseThrow(ApiException::missing); }
    void lockUser(String id) { sql.queryForObject("SELECT id FROM users WHERE id=? FOR UPDATE", String.class, id); }
    record User(String id, String name, String email, String timeZone, boolean systemAdmin) {}
    record PublicUser(String id, String name) {}
}
