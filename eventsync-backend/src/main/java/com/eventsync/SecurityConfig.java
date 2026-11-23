package com.eventsync;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.*;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
    @Bean PasswordEncoder passwords() { return new BCryptPasswordEncoder(12); }
    @Bean SecurityFilterChain security(HttpSecurity http, Db db, @Value("${app.allowed-origins}") String origins) throws Exception {
        var cors=new CorsConfiguration(); cors.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).toList());
        cors.setAllowedMethods(List.of("GET","POST","PUT","DELETE","OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization","Content-Type")); cors.setMaxAge(3600L);
        var source=new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**",cors);
        return http.cors(c->c.configurationSource(source))
            // API accepts only explicit bearer tokens, never cookies; browser cannot attach credentials implicitly.
            .csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).formLogin(c->c.disable()).httpBasic(c->c.disable())
            .authorizeHttpRequests(a->a.requestMatchers(HttpMethod.OPTIONS,"/**").permitAll()
                .requestMatchers("/api/health","/api/auth/signup","/api/auth/login","/api/outlook/callback").permitAll()
                // The bundled SPA must be reachable before a user has a login token.
                .requestMatchers("/", "/index.html", "/app.js", "/style.css", "/outlook/callback", "/favicon.ico").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(e->e.authenticationEntryPoint((req,res,ex)->{
                res.setStatus(401); res.setContentType("application/json"); res.getWriter().write("{\"error\":\"Authentication required\"}");
            }))
            .addFilterBefore(new BearerFilter(db),UsernamePasswordAuthenticationFilter.class).build();
    }
    static class BearerFilter extends OncePerRequestFilter {
        private final Db db; BearerFilter(Db db){this.db=db;}
        protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
            String auth=req.getHeader("Authorization");
            if(auth!=null && auth.startsWith("Bearer ") && auth.length()<512) {
                String hash=Crypto.hash(auth.substring(7));
                var ids=db.sql.queryForList("SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",String.class,hash,Db.ts(Instant.now()));
                if(!ids.isEmpty()) {
                    var token=new UsernamePasswordAuthenticationToken(ids.getFirst(),null,List.of());
                    token.setDetails(hash); SecurityContextHolder.getContext().setAuthentication(token);
                }
            }
            chain.doFilter(req,res);
        }
    }
}
