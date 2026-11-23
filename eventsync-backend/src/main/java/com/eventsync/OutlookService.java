package com.eventsync;

import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutlookService {
    private final Db db;private final Crypto crypto;private final MicrosoftClient ms;private final ObjectMapper json;
    final String frontendUrl;
    OutlookService(Db db,Crypto crypto,MicrosoftClient ms,ObjectMapper json,@Value("${app.frontend-url}") String frontendUrl){
        this.db=db;this.crypto=crypto;this.ms=ms;this.json=json;this.frontendUrl=frontendUrl;
    }
    record Start(String authorizationUrl,String state,String completionSecret) {}
    record Calendar(String id,String name,boolean isDefaultCalendar) {}
    record SyncResult(int importedBusyIntervals,Instant start,Instant end,Instant syncedAt) {}
    @Transactional
    public Start start(String user,String session){
        ms.configured();String state=Crypto.random(),verifier=Crypto.random(),secret=Crypto.random();
        db.sql.update("DELETE FROM oauth_pending WHERE expires_at<?",Db.ts(Instant.now()));
        db.sql.update("INSERT INTO oauth_pending(state_hash,user_id,session_hash,completion_hash,verifier_blob,expires_at) VALUES(?,?,?,?,?,?)",Crypto.hash(state),user,session,Crypto.hash(secret),crypto.encrypt(verifier),Db.ts(Instant.now().plusSeconds(600)));
        return new Start(ms.authorize(state,Crypto.challenge(verifier)),state,secret);
    }
    @Transactional
    public void callback(String state,String code){
        var rows=db.sql.queryForList("SELECT verifier_blob,token_blob FROM oauth_pending WHERE state_hash=? AND expires_at>? FOR UPDATE",Crypto.hash(state),Db.ts(Instant.now()));
        if(rows.isEmpty()||rows.getFirst().get("token_blob")!=null)throw ApiException.bad("Invalid or expired authorization state");
        var tokens=withExpiry(ms.redeem(code,crypto.decrypt((String)rows.getFirst().get("verifier_blob"))),null);
        db.sql.update("UPDATE oauth_pending SET token_blob=? WHERE state_hash=?",crypto.encrypt(tokens.toString()),Crypto.hash(state));
    }
    @Transactional
    public void complete(String user,String session,String state,String secret){
        var rows=db.sql.queryForList("SELECT token_blob FROM oauth_pending WHERE state_hash=? AND user_id=? AND session_hash=? AND completion_hash=? AND expires_at>? FOR UPDATE",Crypto.hash(state),user,session,Crypto.hash(secret),Db.ts(Instant.now()));
        if(rows.isEmpty()||rows.getFirst().get("token_blob")==null)throw ApiException.bad("Authorization has not completed, has expired, or belongs to another login");
        db.lockUser(user);
        // Reconnecting can select a different Microsoft account; discard the previous account's busy data.
        db.sql.update("DELETE FROM imported_busy WHERE user_id=?",user);
        db.sql.update("DELETE FROM calendar_syncs WHERE user_id=?",user);
        db.sql.update("DELETE FROM outlook_connections WHERE user_id=?",user);
        db.sql.update("INSERT INTO outlook_connections(user_id,token_blob,connected_at) VALUES(?,?,?)",user,rows.getFirst().get("token_blob"),Db.ts(Instant.now()));
        db.sql.update("DELETE FROM oauth_pending WHERE user_id=?",user);
    }
    @Transactional(readOnly=true)
    public Map<String,Object> status(String user){
        var rows=db.sql.query("SELECT connected_at,last_synced_at FROM outlook_connections WHERE user_id=?",(r,n)->{
            Map<String,Object> m=new LinkedHashMap<>();m.put("connected",true);m.put("connectedAt",r.getTimestamp(1).toInstant());m.put("lastSyncedAt",r.getTimestamp(2)==null?null:r.getTimestamp(2).toInstant());return m;
        },user);
        return rows.isEmpty()?Map.of("connected",false):rows.getFirst();
    }
    @Transactional
    public List<Calendar> calendars(String user){
        db.lockUser(user);String token=accessToken(user);
        return ms.pages(MicrosoftClient.GRAPH+"/me/calendars?$select=id,name,isDefaultCalendar&$top=100",token).stream()
            .map(n->new Calendar(n.path("id").asText(),n.path("name").asText(),n.path("isDefaultCalendar").asBoolean())).toList();
    }
    /** Convenience operation for the common case: import the primary Outlook calendar. */
    @Transactional
    public SyncResult syncDefault(String user,Instant start,Instant end){
        String defaultCalendar=calendars(user).stream()
            .filter(Calendar::isDefaultCalendar)
            .map(Calendar::id)
            .findFirst()
            .orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"No default Outlook calendar found"));
        return sync(user,defaultCalendar,start,end);
    }
    @Transactional
    public SyncResult sync(String user,String calendar,Instant start,Instant end){
        if(calendar.isBlank()||calendar.length()>512||!start.isBefore(end)||Duration.between(start,end).compareTo(Duration.ofDays(90))>0)throw ApiException.bad("Choose a calendar and a date range of at most 90 days");
        db.lockUser(user);String token=accessToken(user);
        String url=MicrosoftClient.GRAPH+"/me/calendars/"+MicrosoftClient.enc(calendar)+"/calendarView?startDateTime="+MicrosoftClient.enc(start.toString())+"&endDateTime="+MicrosoftClient.enc(end.toString())+"&$select=id,start,end,isCancelled,showAs,responseStatus&$top=1000";
        var fetched=ms.pages(url,token); // Finish every page before modifying the cached intervals.
        List<AvailabilityController.Range> incoming=new ArrayList<>();
        for(JsonNode event:fetched){
            if(event.path("isCancelled").asBoolean()||"free".equalsIgnoreCase(event.path("showAs").asText())||"declined".equalsIgnoreCase(event.path("responseStatus").path("response").asText()))continue;
            Instant a=graphTime(event.path("start")),b=graphTime(event.path("end"));
            a=a.isBefore(start)?start:a;b=b.isAfter(end)?end:b;
            if(a.isBefore(b))incoming.add(new AvailabilityController.Range(a,b));
        }
        var previous=db.sql.query("SELECT starts_at,ends_at FROM imported_busy WHERE user_id=? AND calendar_id=? AND starts_at<? AND ends_at>?",(r,n)->new AvailabilityController.Range(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant()),user,calendar,Db.ts(end),Db.ts(start));
        db.sql.update("DELETE FROM imported_busy WHERE user_id=? AND calendar_id=? AND starts_at<? AND ends_at>?",user,calendar,Db.ts(end),Db.ts(start));
        // Preserve cached portions outside a smaller refresh window.
        for(var old:previous){if(old.start().isBefore(start))insert(user,calendar,old.start(),start);if(old.end().isAfter(end))insert(user,calendar,end,old.end());}
        for(var r:incoming)insert(user,calendar,r.start(),r.end());
        Instant now=Instant.now();
        // Overlapping sync coverage must be replaced as one transaction, preserving
        // only the portions outside this refresh. Otherwise a smaller refresh can
        // leave stale overlapping coverage and suggest the cache is newer than it is.
        var oldCoverage=db.sql.query("SELECT range_start,range_end,synced_at FROM calendar_syncs WHERE user_id=? AND calendar_id=? AND range_start<? AND range_end>?",
            (r,n)->new Coverage(r.getTimestamp(1).toInstant(),r.getTimestamp(2).toInstant(),r.getTimestamp(3).toInstant()),
            user,calendar,Db.ts(end),Db.ts(start));
        db.sql.update("DELETE FROM calendar_syncs WHERE user_id=? AND calendar_id=? AND range_start<? AND range_end>?",user,calendar,Db.ts(end),Db.ts(start));
        for(var old:oldCoverage){
            if(old.start().isBefore(start))insertCoverage(user,calendar,old.start(),start,old.syncedAt());
            if(old.end().isAfter(end))insertCoverage(user,calendar,end,old.end(),old.syncedAt());
        }
        insertCoverage(user,calendar,start,end,now);
        db.sql.update("UPDATE outlook_connections SET last_synced_at=? WHERE user_id=?",Db.ts(now),user);
        return new SyncResult(incoming.size(),start,end,now);
    }
    private record Coverage(Instant start,Instant end,Instant syncedAt) {}
    private void insertCoverage(String user,String calendar,Instant start,Instant end,Instant syncedAt){
        db.sql.update("INSERT INTO calendar_syncs(user_id,calendar_id,range_start,range_end,synced_at) VALUES(?,?,?,?,?)",
            user,calendar,Db.ts(start),Db.ts(end),Db.ts(syncedAt));
    }
    private void insert(String user,String calendar,Instant start,Instant end){db.sql.update("INSERT INTO imported_busy(id,user_id,calendar_id,starts_at,ends_at) VALUES(?,?,?,?,?)",Db.id(),user,calendar,Db.ts(start),Db.ts(end));}
    static Instant graphTime(JsonNode node){
        String value=node.path("dateTime").asText(),zone=node.path("timeZone").asText();
        try{return OffsetDateTime.parse(value).toInstant();}
        catch(java.time.format.DateTimeParseException e){
            if(!zone.equals("UTC")&&!zone.equals("Etc/UTC"))throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft returned a non-UTC time despite the UTC preference");
            return LocalDateTime.parse(value).toInstant(ZoneOffset.UTC);
        }
    }
    private String accessToken(String user){
        var rows=db.sql.queryForList("SELECT token_blob FROM outlook_connections WHERE user_id=? FOR UPDATE",user);
        if(rows.isEmpty())throw new ApiException(HttpStatus.CONFLICT,"Connect Outlook first");
        ObjectNode tokens=parse(crypto.decrypt((String)rows.getFirst().get("token_blob")));
        if(tokens.path("expires_at").asLong()<=Instant.now().plusSeconds(60).getEpochSecond()){
            String refresh=tokens.path("refresh_token").asText();if(refresh.isBlank())throw new ApiException(HttpStatus.CONFLICT,"Connect Outlook again to renew access");
            tokens=withExpiry(ms.refresh(refresh),tokens);
            db.sql.update("UPDATE outlook_connections SET token_blob=? WHERE user_id=?",crypto.encrypt(tokens.toString()),user);
        }
        return tokens.path("access_token").asText();
    }
    private ObjectNode withExpiry(JsonNode fresh,ObjectNode previous){
        ObjectNode tokens=fresh.deepCopy();
        if(!tokens.hasNonNull("refresh_token")&&previous!=null&&previous.hasNonNull("refresh_token"))tokens.set("refresh_token",previous.get("refresh_token"));
        tokens.put("expires_at",Instant.now().plusSeconds(tokens.path("expires_in").asLong(3600)).getEpochSecond());
        return tokens;
    }
    private ObjectNode parse(String raw){try{return (ObjectNode)json.readTree(raw);}catch(Exception e){throw new IllegalStateException("Invalid encrypted token data",e);}}
    @Transactional
    public void disconnect(String user){
        db.lockUser(user);db.sql.update("DELETE FROM imported_busy WHERE user_id=?",user);db.sql.update("DELETE FROM calendar_syncs WHERE user_id=?",user);
        db.sql.update("DELETE FROM outlook_connections WHERE user_id=?",user);db.sql.update("DELETE FROM oauth_pending WHERE user_id=?",user);
    }
}
