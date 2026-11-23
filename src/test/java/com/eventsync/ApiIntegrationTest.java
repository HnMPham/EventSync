package com.eventsync;

import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class ApiIntegrationTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper json;
    record Account(String token,String id) {}
    Account signup(String name)throws Exception{
        var node=read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("name",name,"email",UUID.randomUUID()+"@example.edu","password","correct-horse-123","timeZone","America/Chicago")))).andExpect(status().isCreated()).andReturn());
        return new Account(node.path("accessToken").asText(),node.path("user").path("id").asText());
    }
    JsonNode read(MvcResult r)throws Exception{return json.readTree(r.getResponse().getContentAsString());}
    JsonNode send(String method,String url,Account a,Object body,int status)throws Exception{
        var request=switch(method){case "PUT"->put(url);case "DELETE"->delete(url);case "GET"->get(url);default->post(url);};
        request.header("Authorization","Bearer "+a.token());
        if(body!=null)request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return read(mvc.perform(request).andExpect(status().is(status)).andReturn());
    }
    void befriend(Account a,Account b)throws Exception{
        send("POST","/api/friends/requests",a,Map.of("userId",b.id()),200);
        send("POST","/api/friends/requests/"+a.id()+"/respond",b,Map.of("accept",true),200);
    }
    @Test void completeWorkflowAndAccessControl()throws Exception{
        var a=signup("Alice");var b=signup("Bob");var outsider=signup("Outsider");
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        send("POST","/api/friends/requests",a,Map.of("userId",b.id()),200);
        send("POST","/api/friends/requests/"+b.id()+"/respond",a,Map.of("accept",true),404);
        send("POST","/api/friends/requests/"+a.id()+"/respond",b,Map.of("accept",true),200);
        assertThat(send("GET","/api/friends",a,null,200).get(0).path("status").asText()).isEqualTo("ACCEPTED");
        Instant first=Instant.parse("2030-01-07T15:00:00Z"),second=first.plusSeconds(3600);
        var week=Map.of("weekStart","2030-01-07","timeZone","America/Chicago","slots",List.of(first.toString(),second.toString()));
        send("PUT","/api/availability",a,week,200);send("PUT","/api/availability",b,week,200);
        var query=Map.of("weekStart","2030-01-07","timeZone","America/Chicago","friendIds",List.of(b.id()));
        var matches=send("POST","/api/availability/matches",a,query,200);
        assertThat(matches.path("highestCount").asInt()).isEqualTo(1);
        assertThat(matches.path("slots").findValues("best").stream().filter(JsonNode::asBoolean).count()).isEqualTo(2);
        send("POST","/api/availability/matches",outsider,query,403);
        var input=Map.of("title","Study session","description","Capstone","location","Library","start",first.toString(),"end",second.toString(),"timeZone","America/Chicago","inviteeIds",List.of(b.id()));
        var event=send("POST","/api/events",a,input,201);String id=event.path("id").asText();
        send("GET","/api/events/"+id,outsider,null,404);
        send("PUT","/api/events/"+id,b,input,403);
        send("POST","/api/events/"+id+"/respond",outsider,Map.of("response","ACCEPTED"),404);
        send("POST","/api/events/"+id+"/respond",b,Map.of("response","ACCEPTED"),200);
        matches=send("POST","/api/availability/matches",a,query,200);
        assertThat(matches.path("slots").findValues("best").stream().filter(JsonNode::asBoolean).count()).isEqualTo(1);
        assertThat(send("GET","/api/events?view=upcoming",b,null,200)).hasSize(1);
        send("DELETE","/api/events/"+id,a,null,200);
        send("POST","/api/events/"+id+"/respond",b,Map.of("response","ACCEPTED"),400);
        assertThat(send("POST","/api/availability/matches",a,query,200).path("slots").findValues("best").stream().filter(JsonNode::asBoolean).count()).isEqualTo(2);
        send("POST","/api/auth/logout",a,null,200);
        send("GET","/api/me",a,null,401);
    }
    @Test void invalidDatesAndNoPositiveMatches()throws Exception{
        var a=signup("CalendarUser");
        send("PUT","/api/availability",a,Map.of("weekStart","2030-01-08","timeZone","UTC","slots",List.of()),400);
        send("PUT","/api/availability",a,Map.of("weekStart","2030-01-07","timeZone","UTC","slots",List.of("2030-01-07T00:30:00Z")),400);
        var matches=send("POST","/api/availability/matches",a,Map.of("weekStart","2030-01-07","timeZone","UTC","friendIds",List.of()),200);
        assertThat(matches.path("highestCount").asInt()).isZero();
        assertThat(matches.path("slots").findValues("best").stream().anyMatch(JsonNode::asBoolean)).isFalse();
        send("POST","/api/outlook/sync",a,Map.of("calendarId","default","start","2030-01-01T00:00:00Z","end","2031-01-01T00:00:00Z"),400);
        send("POST","/api/outlook/complete",a,Map.of("state","forged","completionSecret","forged"),400);
    }
    @Test void loginAndCors()throws Exception{
        String email=UUID.randomUUID()+"@example.edu";
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("name","Login User","email",email,"password","safe-password-123","timeZone","UTC")))).andExpect(status().isCreated());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("email",email,"password","wrong-password")))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("email",email,"password","safe-password-123")))).andExpect(status().isOk());
        mvc.perform(options("/api/me").header("Origin","http://localhost:5173").header("Access-Control-Request-Method","GET").header("Access-Control-Request-Headers","Authorization")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173"));
        mvc.perform(options("/api/me").header("Origin","https://evil.example").header("Access-Control-Request-Method","GET")).andExpect(status().isForbidden());
    }
}
