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
class SchedulingWorkflowIntegrationTest {
    @Autowired MockMvc mvc;@Autowired ObjectMapper json;@Autowired Db db;
    record Person(String id,String token) {}
    JsonNode send(String method,String url,Person user,Object body,int code)throws Exception{
        var req=switch(method){case "GET"->get(url);case "PUT"->put(url);case "DELETE"->delete(url);default->post(url);};
        req.header("Authorization","Bearer "+user.token());
        if(body!=null)req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        var result=mvc.perform(req).andExpect(status().is(code)).andReturn();
        var output=result.getResponse().getContentAsString();return output.startsWith("{")||output.startsWith("[")?json.readTree(output):json.createObjectNode();
    }
    Person signup()throws Exception{
        var result=mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("email",UUID.randomUUID()+"@example.edu","name","User","password","secure-password-1","timeZone","UTC"))))
            .andExpect(status().isCreated()).andReturn();
        var row=json.readTree(result.getResponse().getContentAsString());return new Person(row.path("user").path("id").asText(),row.path("accessToken").asText());
    }
    @Test void groupPollAvailabilityOverrideAndFinalization()throws Exception{
        var alice=signup();var bob=signup();var outsider=signup();
        var group=send("POST","/api/groups",alice,Map.of("name","Capstone","description","Study group"),201);
        String groupId=group.path("id").asText();
        send("POST","/api/groups/"+groupId+"/members",alice,Map.of("userId",bob.id()),200);
        send("POST","/api/groups/"+groupId+"/members",bob,Map.of("userId",outsider.id()),403);
        Instant start=Instant.parse("2030-01-07T09:00:00Z");
        var input=Map.of("title","Team planning","description","Demo","location","Library","windowStart",start.toString(),
            "windowEnd",start.plusSeconds(10800).toString(),"durationMinutes",60,"timeZone","UTC","groupId",groupId,"inviteeIds",List.of(bob.id()));
        var created=send("POST","/api/scheduling-events",alice,input,201);
        String id=created.path("event").path("id").asText(),code=created.path("invitationCode").asText();
        send("GET","/api/scheduling-events/"+id,outsider,null,404);
        send("POST","/api/scheduling-events/"+id+"/join",outsider,Map.of("code","invalid"),403);
        send("POST","/api/scheduling-events/"+id+"/join",outsider,Map.of("code",code),200);
        var time=Map.of("start",start.toString(),"end",start.plusSeconds(7200).toString());
        send("PUT","/api/scheduling-events/"+id+"/availability",alice,Map.of("slots",List.of(time)),200);
        send("PUT","/api/scheduling-events/"+id+"/availability",bob,Map.of("slots",List.of(time)),200);
        var busyStart=start.plusSeconds(1800);var busyEnd=start.plusSeconds(3600);
        db.sql.update("INSERT INTO imported_busy(id,user_id,calendar_id,starts_at,ends_at) VALUES(?,?,?,?,?)",Db.id(),bob.id(),"default",Db.ts(busyStart),Db.ts(busyEnd));
        var results=send("GET","/api/scheduling-events/"+id+"/recommendations",alice,null,200);
        assertThat(results.path("suggestions").get(0).path("availableCount").asInt()).isEqualTo(2);
        send("POST","/api/availability/overrides",bob,Map.of("start",busyStart.toString(),"end",busyEnd.toString(),"status","AVAILABLE"),201);
        results=send("GET","/api/scheduling-events/"+id+"/recommendations",alice,null,200);
        assertThat(results.path("suggestions").get(0).path("availableCount").asInt()).isEqualTo(3-1); // Alice + Bob; outsider has not submitted
        var finalEvent=send("POST","/api/scheduling-events/"+id+"/finalize",alice,Map.of("start",start.toString()),200);
        assertThat(finalEvent.path("status").asText()).isEqualTo("FINALIZED");
        assertThat(finalEvent.path("finalizedStart").asText()).isEqualTo(start.toString());
        send("PUT","/api/scheduling-events/"+id+"/availability",bob,Map.of("slots",List.of(time)),400);
        assertThat(send("GET","/api/notifications",bob,null,200).size()).isGreaterThan(0);
        send("POST","/api/scheduling-events/"+id+"/reopen",alice,null,200);
        send("POST","/api/scheduling-events/"+id+"/cancel",alice,null,200);
    }
    @Test void draftPublishAndJoinGroup()throws Exception{
        var organizer=signup();var member=signup();
        String group=send("POST","/api/groups",organizer,Map.of("name","Group"),201).path("id").asText();
        send("POST","/api/groups/"+group+"/members",organizer,Map.of("userId",member.id()),200);
        String start="2030-02-01T09:00:00Z",end="2030-02-01T12:00:00Z";
        var draft=send("POST","/api/scheduling-events",organizer,Map.of("title","Meet","windowStart",start,"windowEnd",end,"durationMinutes",60,"timeZone","UTC","groupId",group,"draft",true),201);
        String id=draft.path("event").path("id").asText();
        send("GET","/api/scheduling-events/"+id,member,null,404);
        send("POST","/api/scheduling-events/"+id+"/publish",organizer,null,200);
        send("POST","/api/scheduling-events/"+id+"/join-group",member,null,200);
        send("PUT","/api/scheduling-events/"+id+"/availability",member,Map.of("slots",List.of()),200);
        assertThat(send("GET","/api/scheduling-events/"+id,organizer,null,200).path("participants").get(0).path("submitted").asBoolean()).isTrue();
    }
}
