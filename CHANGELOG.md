## v1.0.0-rc.4 (2026-11-25)
- Optional default-available calendar with unavailable-time eraser; per-browser preference per account.
- System administrator delete-account and public username discriminator editing APIs and dashboard controls.
- Add Flyway V7 to preserve audit and attendance history while allowing deletions.
- Carry forward rc.3 CI fixes.

# Changelog

## [1.0.0-rc.1] - 2026-11-23

### Included
- React/TypeScript Figma frontend, Java 21/Spring Boot REST API, and MySQL 8.4 migrations.
- Account sign-in and registration; friend invitations; groups, events, RSVP, calendar availability and meeting time recommendations.
- System administrator role with database authorization, administrative user/group overview, group membership management, and audit log. Privilege assignment is server-only; no public admin signup.
- Group event creation: invite current group members with optional additional friends (no duplicates); group-scoped calendar availability and upcoming events.
- Private Caddy reverse proxy deployment suitable for Tailscale Serve, plus existing development/public deployment configurations.

### Important limitations
- Not independently verified end-to-end with a running MySQL service in this build environment.
- Java 21 main application sources compiled; frontend production build blocked by unavailable npm dependencies here. Verify both builds in CI or the Proxmox VM before tagging a stable v1.0.0.
- Group events invite a one-time snapshot of members; membership changes do not retroactively change invitations.
- Group calendar shows a short upcoming-event list, not a full event-overlay calendar.
- Outlook requires Microsoft Entra configuration and a valid HTTPS callback to function.
