package com.eventsync;

import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest @ActiveProfiles("test")
class OutlookIntegrationTest {
    @Autowired OutlookService outlook;@Autowired Db db;@Autowired Crypto crypto;@Autowired ObjectMapper json;
    @MockitoBean MicrosoftClient ms;
    String user,session;
    @BeforeEach void setup(){
        user=Db.id();session=Crypto.hash(Crypto.random());
        db.sql.update("INSERT INTO users(id,email,name,password_hash,time_zone) VALUES(?,?,?,?,?)",user,user+"@example.edu","Calendar User","unused","UTC");
        when(ms.authorize(anyString(),anyString())).thenReturn("https://login.microsoftonline.com/test");
    }
    void connect()throws Exception{
        when(ms.redeem(anyString(),anyString())).thenReturn(json.readTree("{\"access_token\":\"access\",\"refresh_token\":\"refresh\",\"expires_in\":3600}"));
        var start=outlook.start(user,session);outlook.callback(start.state(),"code");
        assertThatThrownBy(()->outlook.complete(user,"different-session",start.state(),start.completionSecret())).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->outlook.complete(user,session,start.state(),"wrong-secret")).isInstanceOf(ApiException.class);
        outlook.complete(user,session,start.state(),start.completionSecret());
        assertThatThrownBy(()->outlook.complete(user,session,start.state(),start.completionSecret())).isInstanceOf(ApiException.class);
    }
    JsonNode event(String start,String end,String showAs,boolean cancelled)throws Exception{
        return json.valueToTree(Map.of("start",Map.of("dateTime",start,"timeZone","UTC"),"end",Map.of("dateTime",end,"timeZone","UTC"),"showAs",showAs,"isCancelled",cancelled));
    }
    @Test void oauthBindingEncryptedStorageAndRangeReplacement()throws Exception{
        connect();assertThat(outlook.status(user).get("connected")).isEqualTo(true);
        String blob=db.sql.queryForObject("SELECT token_blob FROM outlook_connections WHERE user_id=?",String.class,user);
        assertThat(blob).doesNotContain("refresh");assertThat(crypto.decrypt(blob)).contains("refresh");
        when(ms.pages(anyString(),eq("access"))).thenReturn(List.of(event("2030-01-07T09:00:00","2030-01-07T12:00:00","busy",false),event("2030-01-07T13:00:00","2030-01-07T14:00:00","free",false),event("2030-01-07T14:00:00","2030-01-07T15:00:00","busy",true)));
        Instant start=Instant.parse("2030-01-07T00:00:00Z"),end=start.plusSeconds(86400);
        assertThat(outlook.sync(user,"cal",start,end).importedBusyIntervals()).isEqualTo(1);
        outlook.sync(user,"cal",start,end);
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM imported_busy WHERE user_id=?",Integer.class,user)).isEqualTo(1);
        when(ms.pages(anyString(),eq("access"))).thenReturn(List.of());
        outlook.sync(user,"cal",start.plusSeconds(10*3600),start.plusSeconds(11*3600));
        // One large historical coverage range must split into three nonoverlapping
        // intervals rather than retaining stale overlapping sync metadata.
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM calendar_syncs WHERE user_id=?",Integer.class,user)).isEqualTo(3);
        var rows=db.sql.queryForList("SELECT starts_at,ends_at FROM imported_busy WHERE user_id=?",user);
        assertThat(rows).hasSize(2); // 09–10 and 11–12 survive the smaller refresh.
        doThrow(new ApiException(HttpStatus.BAD_GATEWAY,"Network failed")).when(ms).pages(anyString(),eq("access"));
        assertThatThrownBy(()->outlook.sync(user,"cal",start,end)).isInstanceOf(ApiException.class);
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM imported_busy WHERE user_id=?",Integer.class,user)).isEqualTo(2);
        outlook.disconnect(user);assertThat(outlook.status(user).get("connected")).isEqualTo(false);
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM imported_busy WHERE user_id=?",Integer.class,user)).isZero();
    }
    @Test void defaultCalendarSyncIsTransactional()throws Exception{
        connect();
        when(ms.pages(anyString(),eq("access"))).thenAnswer(invocation -> {
            String url=invocation.getArgument(0,String.class);
            // Both Graph requests should be made while the default import's
            // transaction is active; otherwise a failed write can lose cached data.
            assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
            if(url.contains("/me/calendars?"))return List.of(json.readTree("{\"id\":\"default-cal\",\"name\":\"Calendar\",\"isDefaultCalendar\":true}"));
            return List.of();
        });
        Instant start=Instant.parse("2030-03-07T00:00:00Z");
        outlook.syncDefault(user,start,start.plusSeconds(3600));
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM calendar_syncs WHERE user_id=?",Integer.class,user)).isEqualTo(1);
    }
    @Test void refreshRotatesTokens()throws Exception{
        connect();
        db.sql.update("UPDATE outlook_connections SET token_blob=? WHERE user_id=?",crypto.encrypt("{\"access_token\":\"old\",\"refresh_token\":\"old-refresh\",\"expires_at\":0}"),user);
        when(ms.refresh("old-refresh")).thenReturn(json.readTree("{\"access_token\":\"new-access\",\"refresh_token\":\"new-refresh\",\"expires_in\":3600}"));
        when(ms.pages(anyString(),eq("new-access"))).thenReturn(List.of());
        outlook.calendars(user);verify(ms).refresh("old-refresh");
        String blob=db.sql.queryForObject("SELECT token_blob FROM outlook_connections WHERE user_id=?",String.class,user);
        assertThat(crypto.decrypt(blob)).contains("new-refresh");
    }
    @Test void parsesUtcFractionalAndOffsetTimes()throws Exception{
        assertThat(OutlookService.graphTime(json.readTree("{\"dateTime\":\"2030-01-07T10:00:00.0000000\",\"timeZone\":\"UTC\"}"))).isEqualTo(Instant.parse("2030-01-07T10:00:00Z"));
        assertThat(OutlookService.graphTime(json.readTree("{\"dateTime\":\"2030-01-07T10:00:00-06:00\"}"))).isEqualTo(Instant.parse("2030-01-07T16:00:00Z"));
    }
}
