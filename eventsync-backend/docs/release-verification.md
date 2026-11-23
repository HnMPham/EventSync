# November 22, 2026 release verification

## Executed successfully in packaging environment

- Java 21 `javac` source compilation against the original Spring Boot 3.5.7 JAR's dependency libraries.
- 12 Java offline checks: overlapping/gapped/adjacent intervals; external busy; manual free/busy precedence; committed EventSync meetings; DST fallback; Microsoft token encryption; Microsoft Graph time parsing; and URL validation.
- 6 existing TypeScript client tests (`cd frontend && npm test`).
- `node --check` on the bundled browser UI's JavaScript.
- Python syntax check for the persistence test; shell syntax check for backup/restart scripts.
- Repacked executable Spring Boot `app.jar` using the prior compiled application's dependency libraries and the updated Java classes and resources. `java -jar app.jar` reached Flyway/MySQL initialization, where it failed as expected with connection refused (no MySQL available here). This proves the JAR's launcher and application classes load; it does **not** prove the SQL migrations execute.

## Not executable in packaging environment

- Docker Compose build, actual MySQL schema creation, V1/V2 Flyway migration, and all real CRUD workflows after restart.
- Microsoft OAuth with a real account and the `calendarView` import.
- Public HTTPS issuance, reverse proxy, firewall and DNS configuration.
- Real browser end-to-end tests. Browser runtime was blocked by the execution environment's administrator policy; the browser UI syntax is checked but its live interactions remain unverified.
- Full `mvn verify`, because Maven and the external test-scoped JUnit/H2 dependencies are unavailable locally; the source includes tests and a GitHub Actions workflow configured for MySQL.

## Required host-side validation before calling the app fully operational

1. Follow `docs/deployment.md` to start Docker Compose and verify `/api/health` returns `database=connected`.
2. Run `docker compose logs --tail=150 api`, check Flyway shows no migration failures, and `docker compose exec mysql ... SHOW TABLES` lists both V1 and V2 tables.
3. Register two real browser accounts; create a group; invite one user; submit both availabilities; obtain and finalize a suggested time; check notifications and export the `.ics` file.
4. Run `bash scripts/verify-after-restart.sh` on a development instance and confirm the script prints PASS. Keep `.eventsync-persistence-check.json` private and delete it after testing.
5. Connect a Microsoft calendar, import a range, verify Outlook conflicts in recommendations, and verify data survives a Java/MySQL restart.
6. Test the bundled UI at the HTTPS domain or connect `frontend/eventsync-api.ts` in the Figma Make project. Test the OAuth redirect from the actual public origin.

## Known functional scope limitations

- In-app notifications and invitations to *registered* EventSync accounts work; outbound email/SMS notifications are not included.
- Outlook sync is initiated explicitly, not run by a scheduler/webhook. Finalizing an EventSync meeting returns an ICS file; it does not automatically write an event to Outlook.
- The Figma Make project itself has not been edited or deployed from this package. A standalone browser interface is included for direct use with this backend.
