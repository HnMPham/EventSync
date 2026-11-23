package com.eventsync;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CryptoTest {
    @Test void encryptionAndPkce(){
        var c=new Crypto("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");String blob=c.encrypt("secret-refresh-token");
        assertThat(blob).doesNotContain("secret-refresh-token");assertThat(c.decrypt(blob)).isEqualTo("secret-refresh-token");
        assertThat(c.encrypt("secret-refresh-token")).isNotEqualTo(blob);
        assertThat(Crypto.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assertThatThrownBy(()->new Crypto("YWJj")).isInstanceOf(IllegalArgumentException.class);
    }
}
