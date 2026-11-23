package com.eventsync;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class Crypto {
    private final SecretKeySpec key;
    private static final SecureRandom RANDOM = new SecureRandom();
    public Crypto(@Value("${app.token-encryption-key}") String encoded) {
        byte[] bytes=Base64.getDecoder().decode(encoded);
        if(bytes.length!=32) throw new IllegalArgumentException("TOKEN_ENCRYPTION_KEY must encode exactly 32 random bytes");
        key=new SecretKeySpec(bytes,"AES");
    }
    static String random() { byte[] b=new byte[32]; RANDOM.nextBytes(b); return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    static String hash(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8))); }
        catch(GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    static String challenge(String verifier) { return Base64.getUrlEncoder().withoutPadding().encodeToString(HexFormat.of().parseHex(hash(verifier))); }
    String encrypt(String plain) {
        try {
            byte[] iv=new byte[12]; RANDOM.nextBytes(iv);
            Cipher c=Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE,key,new GCMParameterSpec(128,iv));
            byte[] encrypted=c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] all=new byte[iv.length+encrypted.length]; System.arraycopy(iv,0,all,0,12); System.arraycopy(encrypted,0,all,12,encrypted.length);
            return Base64.getEncoder().encodeToString(all);
        } catch(GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    String decrypt(String encoded) {
        try {
            byte[] all=Base64.getDecoder().decode(encoded); Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOfRange(all,0,12)));
            return new String(c.doFinal(all,12,all.length-12),StandardCharsets.UTF_8);
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Cannot decrypt calendar credentials", e); }
    }
}
