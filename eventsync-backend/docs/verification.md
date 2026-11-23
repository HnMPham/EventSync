# Verification

Verified locally with Java 21.0.10, Maven 3.9.11, Spring Boot 3.5.7, and Node.js/TypeScript 5.9.3.

`mvn package` passed: **13 Java tests, 0 failures**. It produced an executable Spring Boot JAR.

The integration tests load the actual Spring application, run the Flyway migration, use H2 in MySQL compatibility mode, and exercise the HTTP controllers through MockMvc. They cover signup/login/logout, bearer authentication, CORS, friendship request ownership, event permissions and invitation responses, cancellation, full-week availability replacement/validation, all tied best slots, no-positive-match handling, busy overlap boundaries, and DST weeks with 167/169 hours.

Outlook tests use mocked HTTP responses or a mocked Microsoft client. They cover PKCE request fields, pagination with authenticated UTC requests, refusal of unexpected pagination hosts, throttling errors, OAuth completion tied to the original login/secret and consumed once, encrypted credential storage, refresh-token rotation, UTC timestamp parsing, idempotent imports, cancelled/free entries, smaller-window preservation, failed-import preservation, and disconnect cleanup.

`cd frontend && npm ci --ignore-scripts && npm test` passed: strict TypeScript compilation and **4 adapter tests, 0 failures**. Tests verify app token handling, login expiration, same-tab OAuth redirect recovery, forged state rejection, and frontend request shapes.

Not verified live here:

- MySQL 8.4 execution or the Docker Compose build, because no Docker/MySQL server was available. A MySQL service CI workflow is included to run the same integration suite against MySQL once the source is in a repository.
- A real Microsoft account's consent/token exchange or calendar import, because no Microsoft app registration, credentials, or authorized calendar account was supplied.
- Deployment to an HTTPS server or code changes to the hosted Figma Make frontend. The demo was inspected read-only; the TypeScript integration client and instructions are supplied for that project.

Before relying on a public deployment, run the MySQL CI suite, configure the Microsoft registration, and verify one real calendar import from the published frontend with its exact production origin and redirects.
