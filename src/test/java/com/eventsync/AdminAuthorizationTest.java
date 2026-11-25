package com.eventsync;

import java.util.*;
import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")
class AdminAuthorizationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired Db db;
    record Account(String id,String token) {}
    Account register() throws Exception {
        var r=mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
          .content(mapper.writeValueAsString(Map.of("email",UUID.randomUUID()+"@example.test", "name","Capstone Tester", "password","test-password-123", "timeZone","UTC"))))
          .andExpect(status().isCreated()).andReturn();
        var j=mapper.readTree(r.getResponse().getContentAsString());
        assertThat(j.path("user").path("systemAdmin").asBoolean()).isFalse();
        return new Account(j.path("user").path("id").asText(),j.path("accessToken").asText());
    }
    @Test void onlySystemAdminsManageAllGroups() throws Exception {
        Account owner=register(),admin=register(),outsider=register();
        var created=mvc.perform(post("/api/groups").header("Authorization","Bearer "+owner.token())
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"University\"}"))
            .andExpect(status().isCreated()).andReturn();
        String id=mapper.readTree(created.getResponse().getContentAsString()).path("id").asText();
        mvc.perform(get("/api/admin/groups").header("Authorization","Bearer "+owner.token())).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+outsider.token())).andExpect(status().isForbidden());
        db.sql.update("UPDATE users SET system_admin=TRUE WHERE id=?",admin.id());
        var result=mvc.perform(get("/api/admin/groups").header("Authorization","Bearer "+admin.token()))
            .andExpect(status().isOk()).andReturn();
        assertThat(result.getResponse().getContentAsString()).contains("University");
        mvc.perform(put("/api/admin/groups/"+id).header("Authorization","Bearer "+admin.token())
          .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Updated University\",\"description\":\"New\"}"))
          .andExpect(status().isOk());
        mvc.perform(put("/api/admin/groups/"+id).header("Authorization","Bearer "+outsider.token())
          .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Denied\"}"))
          .andExpect(status().isForbidden());
        db.sql.update("UPDATE users SET system_admin=FALSE WHERE id=?",admin.id());
        mvc.perform(get("/api/admin/groups").header("Authorization","Bearer "+admin.token())).andExpect(status().isForbidden());
    }
    @Test void administratorsCanChangePublicNumberAndDeleteOtherAccounts() throws Exception {
        Account admin=register(),victim=register(),other=register();
        db.sql.update("UPDATE users SET system_admin=TRUE WHERE id=?",admin.id());
        String adminBearer="Bearer "+admin.token(), otherBearer="Bearer "+other.token();
        var number=db.sql.queryForObject("SELECT discriminator FROM user_handles WHERE user_id=?",Long.class,other.id());
        mvc.perform(put("/api/admin/users/"+victim.id()+"/discriminator")
            .header("Authorization",otherBearer).contentType(MediaType.APPLICATION_JSON)
            .content("{\"discriminator\":400001}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/users/"+victim.id()+"/discriminator")
            .header("Authorization",adminBearer).contentType(MediaType.APPLICATION_JSON)
            .content("{\"discriminator\":400001}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.discriminator").value(400001));
        // Public numbers must be globally unique, even when usernames differ.
        mvc.perform(put("/api/admin/users/"+victim.id()+"/discriminator")
            .header("Authorization",adminBearer).contentType(MediaType.APPLICATION_JSON)
            .content("{\"discriminator\":"+number+"}"))
            .andExpect(status().isConflict());
        mvc.perform(put("/api/admin/users/"+victim.id()+"/discriminator")
            .header("Authorization",adminBearer).contentType(MediaType.APPLICATION_JSON)
            .content("{\"discriminator\":0}"))
            .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/admin/users/"+admin.id()).header("Authorization",adminBearer))
            .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/admin/users/"+victim.id()).header("Authorization",otherBearer))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/users/"+victim.id()).header("Authorization",adminBearer))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM users WHERE id=?",Long.class,victim.id())).isZero();
        assertThat(db.sql.queryForObject("SELECT COUNT(*) FROM user_handles WHERE user_id=?",Long.class,victim.id())).isZero();
        mvc.perform(delete("/api/admin/users/"+victim.id()).header("Authorization",adminBearer))
            .andExpect(status().isNotFound());
    }
}
