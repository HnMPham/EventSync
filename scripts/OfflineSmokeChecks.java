package com.eventsync;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Dependency-independent checks runnable using the JAR's bundled Spring libraries. */
public class OfflineSmokeChecks {
    static int count=0;
    static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);count++;}
    static SchedulingService.Interval time(String a,String b){return new SchedulingService.Interval(Instant.parse(a),Instant.parse(b));}
    public static void main(String[] args) throws Exception {
        var slot=time("2030-01-01T10:00:00Z","2030-01-01T11:00:00Z");
        var halves=List.of(time("2030-01-01T10:00:00Z","2030-01-01T10:30:00Z"),time("2030-01-01T10:30:00Z","2030-01-01T11:00:00Z"));
        var gap=List.of(time("2030-01-01T10:00:00Z","2030-01-01T10:20:00Z"),time("2030-01-01T10:30:00Z","2030-01-01T11:00:00Z"));
        var busy=time("2030-01-01T10:15:00Z","2030-01-01T10:45:00Z");
        check(SchedulingService.isAvailable(slot,halves,List.of(),List.of()),"adjacent selections not merged");
        check(!SchedulingService.isAvailable(slot,gap,List.of(),List.of()),"gap incorrectly counted as available");
        check(!SchedulingService.isAvailable(slot,halves,List.of(busy),List.of()),"Outlook busy not blocked");
        check(SchedulingService.isAvailable(slot,halves,List.of(busy),List.of(new SchedulingService.Override(busy,"AVAILABLE"))),"manual free did not override imported busy");
        check(!SchedulingService.isAvailable(slot,halves,List.of(),List.of(new SchedulingService.Override(busy,"BUSY"))),"manual busy did not block meeting");
        check(!SchedulingService.isAvailable(slot,halves,List.of(busy),List.of(new SchedulingService.Override(busy,"AVAILABLE")),List.of(busy)),"manual free must not override another confirmed EventSync meeting");
        check(!SchedulingService.isAvailable(slot,List.of(),List.of(),List.of()),"no submission should never count as available");
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        Crypto crypto=new Crypto(key);String data="{\"refresh_token\":\"secret\"}";
        String enc=crypto.encrypt(data);
        check(!enc.contains("secret") && crypto.decrypt(enc).equals(data),"encrypted Microsoft tokens must survive database round trips");
        check(AvailabilityController.slots(LocalDate.parse("2026-10-26"),"America/Chicago").size()==169,"DST fallback must not drop the repeated hour");
        var mapper=new ObjectMapper();
        check(OutlookService.graphTime(mapper.readTree("{\"dateTime\":\"2030-01-07T10:00:00.0000000\",\"timeZone\":\"UTC\"}"))
              .equals(Instant.parse("2030-01-07T10:00:00Z")),"Graph UTC parse");
        MicrosoftClient.validateGraphUrl("https://graph.microsoft.com/v1.0/me/calendars");count++;
        boolean rejected=false;
        try{MicrosoftClient.validateGraphUrl("https://evil.example/v1.0/me/calendars");}catch(ApiException expected){rejected=true;}
        check(rejected,"Graph pagination should reject unknown hosts");
        System.out.println("PASS: "+count+" offline schedule, time zone, token encryption and URL checks.");
    }
}
