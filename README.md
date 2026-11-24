# EventSync — group scheduling and shared availability

**Release candidate:** `v1.0.0-rc.3` · Java 21 / Spring Boot 3.5 · React / TypeScript · MySQL 8.4 · Docker Compose / Caddy

EventSync helps friends and groups coordinate meetings. Participants share availability, explore ranked meeting-time suggestions, respond to invitations, and view finalized meetings on their EventSync calendars. Outlook calendar import is optional and requires Microsoft Entra credentials.

## Quick local demo (recommended)

Download the **complete source ZIP** and extract it. You need a running Docker Desktop (Windows) or Docker Engine plus the Docker Compose v2 plugin (Linux). The first launch needs internet access to build and download dependencies.

**Windows:** double-click `Launch-EventSync.bat` from the extracted folder.

**Linux:** open a terminal in the extracted folder and run:

```bash
bash Launch-EventSync.sh
```

Open **http://localhost:8090**. The launcher creates a private `.env.local-demo` with randomized credentials, builds the React frontend in a temporary Node.js container, and starts the MySQL, Java API, and Caddy containers. It uses a **separate local-demo database volume** and does not require Microsoft credentials to use normal scheduling.

**Stop without deleting accounts or events:** use `Stop-EventSync.bat` on Windows or `bash Stop-EventSync.sh` on Linux. Do **not** run `docker compose down -v` if you want to keep data. The launcher is a Docker-based setup script, not a standalone executable. See [README_LOCAL_DEMO.md](README_LOCAL_DEMO.md) for requirements, ports, and troubleshooting.

## Development / direct backend setup

To run just the Spring Boot backend and its bundled fallback UI on **http://localhost:8080**:

```bash
cp .env.example .env
# Edit .env: replace CHANGE_ME values with unique passwords and a fresh key:
# openssl rand -base64 32
# Start only after configuring .env.
docker compose up -d --build
curl http://localhost:8080/api/health
```

For the integrated React/Caddy experience, use the quick launcher above or follow [README_FIGMA_CONNECTION.md](README_FIGMA_CONNECTION.md). Do not run the direct backend and local demo together when they both bind port 8080.

## Release highlights

- Friends, tagged user handles, groups, meeting invitations, and availability painting
- Ranked meeting-time recommendations across invitees and groups
- Finalized scheduling events appear in EventSync calendars for the organizer and accepted participants
- Organizer deletion of cancelled or past scheduling events; cancelled events do not present stale finalized times as active
- Public events, organization publishers, group attendance insights, and administrative support tickets
- Persisted account theme colors and optional Microsoft Graph Outlook integration

**Not included:** Ticketmaster integration. No Microsoft Graph meeting creation is implied by EventSync calendar finalization.

## Project layout

- `figma-source/` — integrated React/TypeScript frontend
- `src/main/java/com/eventsync/` — Java API, business rules, security and scheduling
- `src/main/resources/db/migration/` — Flyway schema migrations V1 through V6
- `frontend/` — standalone API adapter and client tests
- `compose.yaml`, `compose.caddy.local.yaml`, `Caddyfile.local` — Docker and reverse proxy configuration
- `Launch-EventSync.{bat,ps1,sh}`, `Stop-EventSync.{bat,ps1,sh}` — local-demo scripts
- `docs/` — deployment, persistence, diagrams and integration notes

## Testing before publishing

```bash
mvn -B verify
(cd frontend && npm ci && npm test)
(cd figma-source && npm install && npm run build)
bash -n Launch-EventSync.sh Stop-EventSync.sh
```

The [GitHub Actions workflow](.github/workflows/test.yml) runs Java verification, frontend adapter tests and a React production build. Verify that GitHub Actions succeeds and test the Docker quick launch in a real environment; an archive check alone does **not** guarantee a working deployment.

## Security and persistence

- **Never commit** `.env`, `.env.local-demo`, OAuth credentials, encryption keys, database exports, or production backups. `.gitignore` excludes typical local secret files, but review `git status` before pushing.
- Never run `docker compose down -v` or remove the MySQL named volume unless you intend to delete the database.
- Preserve an existing deployment's `TOKEN_ENCRYPTION_KEY` and MySQL volume during updates. The demo scripts use their own isolated database.
- This is a **release candidate** and has not been certified for production/security use.

For HTTPS, persistence and Microsoft Entra details, see [docs/deployment.md](docs/deployment.md). Release-specific details are in [RELEASE_NOTES_v1.0.0-rc.3.md](RELEASE_NOTES_v1.0.0-rc.3.md).
