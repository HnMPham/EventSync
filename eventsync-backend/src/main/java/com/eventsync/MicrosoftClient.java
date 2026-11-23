package com.eventsync;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.*;

@Component
public class MicrosoftClient {
    static final String GRAPH="https://graph.microsoft.com/v1.0";
    static final String SCOPES="offline_access https://graph.microsoft.com/Calendars.Read";
    private final RestClient http;
    private final String tenant,clientId,clientSecret,redirectUri;
    @Autowired public MicrosoftClient(RestClient.Builder builder,@Value("${app.microsoft.tenant}") String tenant,
        @Value("${app.microsoft.client-id}") String clientId,@Value("${app.microsoft.client-secret}") String clientSecret,
        @Value("${app.microsoft.redirect-uri}") String redirectUri){
        this(builder.requestFactory(factory()).build(),tenant,clientId,clientSecret,redirectUri);
    }
    MicrosoftClient(RestClient http,String tenant,String clientId,String clientSecret,String redirectUri){
        if(!tenant.matches("[A-Za-z0-9.-]+"))throw new IllegalArgumentException("Invalid Microsoft tenant");
        this.tenant=tenant;this.clientId=clientId;this.clientSecret=clientSecret;this.redirectUri=redirectUri;this.http=http;
    }
    private static SimpleClientHttpRequestFactory factory(){var f=new SimpleClientHttpRequestFactory();f.setConnectTimeout(Duration.ofSeconds(10));f.setReadTimeout(Duration.ofSeconds(20));return f;}
    void configured(){if(clientId.isBlank()||clientSecret.isBlank())throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Microsoft calendar connection has not been configured on the server");}
    static String enc(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8).replace("+","%20");}
    String authorize(String state,String challenge){
        configured();return "https://login.microsoftonline.com/"+tenant+"/oauth2/v2.0/authorize?client_id="+enc(clientId)+"&response_type=code&response_mode=query&redirect_uri="+enc(redirectUri)+"&scope="+enc(SCOPES)+"&state="+enc(state)+"&code_challenge="+enc(challenge)+"&code_challenge_method=S256&prompt=select_account";
    }
    JsonNode redeem(String code,String verifier){return token(Map.of("grant_type","authorization_code","code",code,"code_verifier",verifier,"redirect_uri",redirectUri));}
    JsonNode refresh(String refresh){return token(Map.of("grant_type","refresh_token","refresh_token",refresh));}
    private JsonNode token(Map<String,String> values){
        configured();var form=new LinkedMultiValueMap<String,String>();values.forEach(form::add);
        form.add("client_id",clientId);form.add("client_secret",clientSecret);form.add("scope",SCOPES);
        try {
            JsonNode body=http.post().uri("https://login.microsoftonline.com/"+tenant+"/oauth2/v2.0/token").contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
            if(body==null||body.path("access_token").asText().isBlank())throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft returned an invalid token response");
            return body;
        }catch(RestClientResponseException e){
            if(e.getStatusCode().value()==400||e.getStatusCode().value()==401)throw new ApiException(HttpStatus.CONFLICT,"Microsoft authorization expired or was rejected; connect Outlook again");
            throw upstream(e);
        }catch(ResourceAccessException e){throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft did not respond; try again later");}
    }
    List<JsonNode> pages(String url,String token){
        List<JsonNode> result=new ArrayList<>();Set<String> visited=new HashSet<>();
        while(url!=null){
            validateGraphUrl(url);
            if(!visited.add(url)||visited.size()>100)throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft pagination exceeded the safety limit; import a shorter date range");
            JsonNode page;
            try {page=http.get().uri(URI.create(url)).header(HttpHeaders.AUTHORIZATION,"Bearer "+token).header("Prefer","outlook.timezone=\"UTC\"").retrieve().body(JsonNode.class);}
            catch(RestClientResponseException e){if(e.getStatusCode().value()==401)throw new ApiException(HttpStatus.CONFLICT,"Microsoft authorization was revoked; connect Outlook again");throw upstream(e);}
            catch(ResourceAccessException e){throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft did not respond; existing imported data was preserved");}
            if(page==null||!page.path("value").isArray())throw new ApiException(HttpStatus.BAD_GATEWAY,"Microsoft returned an invalid calendar response");
            page.path("value").forEach(result::add);
            if(result.size()>10000)throw new ApiException(HttpStatus.BAD_GATEWAY,"Too many calendar entries; import a shorter date range");
            url=page.path("@odata.nextLink").isTextual()?page.path("@odata.nextLink").asText():null;
        }
        return result;
    }
    static void validateGraphUrl(String url){
        URI u=URI.create(url);
        if(!"https".equals(u.getScheme())||!"graph.microsoft.com".equals(u.getHost())||(u.getPort()!=-1&&u.getPort()!=443)||u.getUserInfo()!=null||u.getFragment()!=null||!u.getPath().startsWith("/v1.0/me/"))
            throw new ApiException(HttpStatus.BAD_GATEWAY,"Rejected unexpected Microsoft pagination URL");
    }
    private ApiException upstream(RestClientResponseException e){
        return new ApiException(e.getStatusCode().value()==429?HttpStatus.SERVICE_UNAVAILABLE:HttpStatus.BAD_GATEWAY,
            e.getStatusCode().value()==429?"Microsoft is throttling requests; wait before retrying":"Microsoft calendar request failed; existing imported data was preserved");
    }
}
