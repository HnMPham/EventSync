# EventSync — v1.0.0 Release Candidate

A web app for coordinating events, comparing availability, and organizing scheduling through friends and groups.

**Status:** source release candidate; Java 21 application sources compile, but a complete React production build and live MySQL tests have not been completed for this archive. Treat this as **v1.0.0-rc.1**, not a production-security certification.

## Features

- Account registration and login, friend requests, and invitations.
- Create events for individual friends **or an entire group**; group events snapshot current members, allowing extra friend invitees.
- Group management with group-level admins, separate from global system administrators.
- Home calendar filtered by group, including group-scoped availability comparison and upcoming events.
- Outlook calendar import via Microsoft Graph (requires Entra configuration).
- Separate system admin interface: user/group overview, group editing, membership and role management, deletion and audit trail.
- MySQL persistence, Flyway migrations and a Java REST API.

## Requirements

- Docker Engine + Docker Compose on a Linux host.
- Node.js 22+ and npm to compile the included Figma React frontend.
- Optional: Tailscale for private access over HTTPS; Microsoft Entra credentials for Outlook.

## Initial deployment (private localhost Caddy)

```bash
cp .env.example .env
# Edit .env: DB_PASSWORD, MYSQL_ROOT_PASSWORD, TOKEN_ENCRYPTION_KEY.
# Never commit .env to GitHub.
bash scripts/build-figma-frontend.sh ./figma-source
docker compose -f compose.yaml -f compose.caddy.local.yaml up -d --build
curl http://127.0.0.1:8090/api/health
```

Caddy binds to **127.0.0.1:8090** on the VM; connect from a workstation using SSH port forwarding (`ssh -L 8090:127.0.0.1:8090 user@vm-ip`) or enable **Tailscale Serve** on the VM (`sudo tailscale serve --bg 8090`). Tailscale provides a tailnet-only HTTPS hostname. Update `.env`:

```dotenv
ALLOWED_ORIGINS=https://your-node.your-tailnet.ts.net,http://localhost:8090
FRONTEND_URL=https://your-node.your-tailnet.ts.net
MS_REDIRECT_URI=https://your-node.your-tailnet.ts.net/api/outlook/callback
```

After updating `.env`, recreate the API container with the same two Compose files. Microsoft OAuth still requires registering the exact redirect URI in Entra and using an account/app configuration Microsoft accepts.

## Upgrading an existing EventSync VM

**Back up your Proxmox VM and SQL database first.** This repository is a full source snapshot with *both* admin and group patches already integrated; **do not run either patch installer against it**.

1. Save your current `.env`, local Compose overrides, React/Java edits and MySQL volume. Compare changes before replacing files; this archive may not include fixes made only on your VM.
2. Keep your existing Docker Compose project name and `MYSQL_VOLUME_NAME` so the same database volume is reused.
3. Build the frontend: `bash scripts/build-figma-frontend.sh ./figma-source`.
4. Rebuild Java: `docker compose -f compose.yaml -f compose.caddy.local.yaml up -d --build`.
5. Check `curl http://127.0.0.1:8090/api/health`, account login, registration, admin permissions, group event invitations, group calendar filtering and Outlook integration.
6. **Never run `docker compose down -v`** during an upgrade.

The database migration `V3__system_administrators.sql` adds the system-wide admin role and audit log on first upgrade. To promote an **existing** registered account, run `bash scripts/promote-admin.sh user@example.com` from the VM with the running database. No public admin signup is exposed.

## Verification

```bash
# From a machine with Java 21 and Maven:
mvn -B verify
# From this repository root after Node/npm are installed:
bash scripts/build-figma-frontend.sh ./figma-source
# With Docker available and .env configured:
docker compose -f compose.yaml -f compose.caddy.local.yaml config --quiet
```

## Security / privacy

- Keep `.env` and database dumps private; do not publish client secrets, encryption keys or production SQL data.
- Tailscale restricts network access, **not** application permissions. Limit shared-device access to port 443 where practical.
- System admin elevation requires server access and backend authorizes admin routes against database state.
- Before a public release, perform a full auth/authorization review, update dependencies, test backup and recovery, and assess availability sharing privacy.

See `CHANGELOG.md`, `docs/`, and `README.md` for the rest of the project documentation. No software license is included: decide on one before advertising the repository as open source.
