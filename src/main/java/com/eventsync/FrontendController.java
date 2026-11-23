package com.eventsync;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** The bundled UI uses a dedicated Microsoft OAuth completion URL. */
@Controller
class FrontendController {
    @GetMapping("/outlook/callback")
    String oauthFrontendCallback() { return "forward:/index.html"; }
}
