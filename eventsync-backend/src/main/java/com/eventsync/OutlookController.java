package com.eventsync;

import java.net.URI;
import java.time.Instant;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/outlook")
class OutlookController {
    private final OutlookService outlook;
    OutlookController(OutlookService outlook){this.outlook=outlook;}
    record Complete(@NotBlank @Size(max=128) String state,@NotBlank @Size(max=128) String completionSecret) {}
    record Sync(@NotBlank @Size(max=512) String calendarId,@NotNull Instant start,@NotNull Instant end) {}
    record SyncDefault(@NotNull Instant start,@NotNull Instant end) {}
    @PostMapping("/connect") OutlookService.Start start(Authentication a){return outlook.start(a.getName(),(String)a.getDetails());}
    @GetMapping("/callback") ResponseEntity<Void> callback(@RequestParam String state,@RequestParam(required=false) String code,@RequestParam(required=false) String error){
        String redirect=outlook.frontendUrl.replaceAll("/+$","")+"/outlook/callback";
        if(state.length()>128||(code!=null&&code.length()>8192))throw ApiException.bad("Invalid Microsoft callback");
        if(error!=null)return ResponseEntity.status(303).location(URI.create(redirect+"?outlook=cancelled")).header("Referrer-Policy","no-referrer").header("Cache-Control","no-store").build();
        if(code==null||code.isBlank())throw ApiException.bad("Missing Microsoft authorization code");
        outlook.callback(state,code);
        return ResponseEntity.status(303).location(URI.create(redirect+"?state="+MicrosoftClient.enc(state))).header("Referrer-Policy","no-referrer").header("Cache-Control","no-store").build();
    }
    @PostMapping("/complete") Map<String,Boolean> complete(Authentication a,@Valid @RequestBody Complete r){outlook.complete(a.getName(),(String)a.getDetails(),r.state(),r.completionSecret());return Map.of("connected",true);}
    @GetMapping("/status") Map<String,Object> status(Authentication a){return outlook.status(a.getName());}
    @GetMapping("/calendars") List<OutlookService.Calendar> calendars(Authentication a){return outlook.calendars(a.getName());}
    @PostMapping("/sync") OutlookService.SyncResult sync(Authentication a,@Valid @RequestBody Sync r){return outlook.sync(a.getName(),r.calendarId(),r.start(),r.end());}
    @PostMapping("/sync-default") OutlookService.SyncResult syncDefault(Authentication a,@Valid @RequestBody SyncDefault r){return outlook.syncDefault(a.getName(),r.start(),r.end());}
    @DeleteMapping Map<String,Boolean> disconnect(Authentication a){outlook.disconnect(a.getName());return Map.of("connected",false);}
}
