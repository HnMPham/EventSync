> **Integrated Figma frontend:** Start with [README_FIGMA_CONNECTION.md](README_FIGMA_CONNECTION.md). The actual exported React source now lives in `figma-source/`.

# EventSync — Java + MySQL + Microsoft Graph + bundled web UI

EventSync is a group scheduling application with a Spring Boot 3.5 / Java 21 REST API and a MySQL 8.4 relational database. It stores accounts, sessions, groups, event invitations, availability, overrides, calendar imports, notifications and finalized meeting times persistently. It includes a standalone browser UI served by Spring Boot and a separate TypeScript API client for the Figma Make React frontend.

## Quick start

```bash
cp .env.example .env
openssl rand -base64 32    # Copy this value into TOKEN_ENCRYPTION_KEY in .env
# Replace DB_PASSWORD and MYSQL_ROOT_PASSWORD with unique passwords.
docker compose up --build -d
curl http://localhost:8080/api/health
```

Visit **http://localhost:8080/** to use EventSync. The health response checks MySQL readiness. To skip building Java dependencies in the Docker image, use the `app.jar` included in this ZIP:

```bash
docker compose -f compose.yaml -f compose.prebuilt.yaml up --build -d
```

For HTTPS deployment, persistence testing, backups, Microsoft Entra registration, and integrating your published Figma frontend, **read [docs/deployment.md](docs/deployment.md)**.

## What is included

- `src/main/java/com/eventsync/`: controllers and Java logic for users, groups, proposed events, ranking, Microsoft Graph, authentication, and notifications.
- `src/main/resources/db/migration/`: V1 + V2 Flyway migrations, applied automatically to MySQL.
- `src/main/resources/static/`: bundled browser interface. Java serves it on `/` without another frontend server.
- `frontend/eventsync-api.ts`: API adapter for the existing Figma Make/React frontend; `examples/EventSyncDashboard.tsx` is the reference React dashboard.
- `compose.yaml`, `Dockerfile`: normal Java/SQL deployment; `compose.prebuilt.yaml` and `Dockerfile.prebuilt` use packaged `app.jar` instead of building with Maven.
- `compose.production.yaml`, `Caddyfile`: optional internet-facing HTTPS reverse proxy using your domain.
- `scripts/verify-persistence.py`, `scripts/verify-after-restart.sh`, `scripts/backup-db.sh`: live data consistency verification and database backup tooling.
- `docs/complete-implementation.md`, `docs/diagrams/`: API operations, schema mapping and Mermaid diagrams.

**Important:** Basic app data persists between sessions in a named MySQL Docker volume. Login tokens expire after 12 hours. Do not run `docker compose down -v`, remove Docker volumes or replace the existing `TOKEN_ENCRYPTION_KEY` if you need to preserve user/calendar data.

## Verification status

Java source compilation, Java scheduling/crypto offline checks, JavaScript syntax and the TypeScript client tests have been run. Docker, live MySQL 8.4 migrations, browser end-to-end workflows and Microsoft OAuth have **not been run** in this environment; verify them on your target host before a public launch. See [docs/deployment.md](docs/deployment.md).
