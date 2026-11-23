package com.eventsync;

import java.util.Set;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/me/theme")
class ThemePreferencesController {
    private static final Set<String> PRESETS = Set.of("indigo","ocean","forest","rose","midnight","plum","ember","slate");
    private final Db db;
    ThemePreferencesController(Db db) { this.db = db; }
    record Theme(String themeId,String customColor) {}
    record Update(@NotBlank String themeId,String customColor) {}

    @GetMapping
    Theme get(Authentication auth) {
        return db.sql.queryForObject("SELECT theme_id,theme_custom_color FROM users WHERE id=?",
            (rs,n) -> new Theme(rs.getString(1),rs.getString(2)), auth.getName());
    }

    @PutMapping
    @Transactional
    Theme put(Authentication auth, @Valid @RequestBody Update input) {
        String id = input.themeId();
        String color = null;
        if ("custom".equals(id)) {
            color = input.customColor();
            if (color == null || !color.matches("#[0-9a-fA-F]{6}"))
                throw new ApiException(HttpStatus.BAD_REQUEST,"Custom theme color must be a six-digit hex value");
            color = color.toUpperCase(java.util.Locale.ROOT);
        } else if (!PRESETS.contains(id)) {
            throw new ApiException(HttpStatus.BAD_REQUEST,"Unknown theme preset");
        }
        db.sql.update("UPDATE users SET theme_id=?,theme_custom_color=? WHERE id=?",id,color,auth.getName());
        return new Theme(id,color);
    }
}
