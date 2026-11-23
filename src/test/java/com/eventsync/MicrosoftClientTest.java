package com.eventsync;

import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.assertj.core.api.Assertions.*;

class MicrosoftClientTest {
    MockRestServiceServer server;MicrosoftClient client;
    @BeforeEach void setup(){var builder=RestClient.builder();server=MockRestServiceServer.bindTo(builder).build();client=new MicrosoftClient(builder.build(),"common","id","secret","http://localhost/callback");}
    @Test void followsPaginationWithBearerAndUtc(){
        server.expect(requestTo("https://graph.microsoft.com/v1.0/me/calendars"))
            .andExpect(header("Authorization","Bearer access")).andExpect(header("Prefer","outlook.timezone=\"UTC\""))
            .andRespond(withSuccess("{\"value\":[{\"id\":\"a\"}],\"@odata.nextLink\":\"https://graph.microsoft.com/v1.0/me/calendars?page=2\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.microsoft.com/v1.0/me/calendars?page=2")).andRespond(withSuccess("{\"value\":[{\"id\":\"b\"}]}",MediaType.APPLICATION_JSON));
        assertThat(client.pages("https://graph.microsoft.com/v1.0/me/calendars","access")).hasSize(2);server.verify();
    }
    @Test void rejectsTokenExfiltrationAndMapsThrottling(){
        assertThatThrownBy(()->client.pages("https://evil.example/v1.0/me/calendars","access")).isInstanceOf(ApiException.class);
        server.expect(requestTo("https://graph.microsoft.com/v1.0/me/calendars")).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        assertThatThrownBy(()->client.pages("https://graph.microsoft.com/v1.0/me/calendars","access")).isInstanceOf(ApiException.class).hasMessageContaining("throttling");server.verify();
    }
    @Test void sendsAuthorizationCodeWithPkce(){
        server.expect(requestTo("https://login.microsoftonline.com/common/oauth2/v2.0/token")).andExpect(method(HttpMethod.POST))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("code_verifier=verifier")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("client_secret=secret")))
            .andRespond(withSuccess("{\"access_token\":\"access\",\"refresh_token\":\"refresh\",\"expires_in\":3600}",MediaType.APPLICATION_JSON));
        assertThat(client.redeem("code","verifier").path("access_token").asText()).isEqualTo("access");server.verify();
    }
}
