# EventSync deployment and data persistence

This project can run entirely on a Docker-capable machine (Ubuntu VM, a Linux server, or a development PC). It has a bundled browser UI served by Java on `/`, so a separate React deployment is not required to test EventSync. The Figma Make frontend can still call the same API using `frontend/eventsync-api.ts`.

## 1. Local Docker launch

Prerequisites: Docker Engine + Compose plugin, internet access for base images, and available host port 8080. Extract the ZIP and enter `eventsync-backend/`.

```bash
cp .env.example .env
openssl rand -base64 32
```

Edit `.env` and replace every `CHANGE_ME` with unique values. Copy the full output of the OpenSSL command into `TOKEN_ENCRYPTION_KEY`. Do not use the examples in production. Leave `MS_CLIENT_ID` / `MS_CLIENT_SECRET` blank until registering the Microsoft application. The default `FRONTEND_URL` is `http://localhost:8080`, which correctly returns to the bundled browser UI after the Microsoft OAuth callback.

```bash
docker compose up -d --build
# When Maven repositories are unavailable, use the bundled prebuilt app.jar instead:
# docker compose -f compose.yaml -f compose.prebuilt.yaml up -d --build

docker compose ps
curl -fsS http://localhost:8080/api/health
```

Expected response: `{"status":"ok","database":"connected"}`. Open `http://localhost:8080/` in a browser. Register two accounts, create a group, create a proposed meeting, invite the second account, submit availability, check recommendations and finalize.

## 2. Persistence across sessions and upgrades

* App sessions, events, groups, invitations, schedules, overrides and Outlook busy slots live in **MySQL**. They do not depend on Java process memory. Sessions expire after 12 hours by design, but all account and event data remain.
* The MySQL data directory mounts a named Docker volume, `eventsync_mysql_data` by default. The name does not depend on your ZIP extraction directory. If you're upgrading an earlier EventSync deployment, find its existing name with `docker volume ls` **before starting** this version and set `MYSQL_VOLUME_NAME` to that name in `.env`, or migrate the data into the new volume. Otherwise the new app can appear to have an empty database even when the old volume still exists.
* `docker compose stop`, `docker compose restart`, `docker compose up -d --build` and `docker compose down` preserve named volumes. **Never use `docker compose down -v` or `docker volume rm` on a database you need**; those commands delete persistent data.
* Keep the original `TOKEN_ENCRYPTION_KEY` when updating. Rotating it without re-encrypting existing Microsoft credentials makes them unreadable.
* Flyway V1/V2 migrations are automatically applied once to each database, tracked by `flyway_schema_history`. Do not manually drop tables or edit already-applied migration files.

### Verify actual persistence (development/test only)

```bash
python3 scripts/verify-persistence.py create
# Creates temporary test accounts and a finalized meeting and writes .eventsync-persistence-check.json.

docker compose restart mysql
# Wait for `docker compose ps` to show mysql healthy.
docker compose restart api

python3 scripts/verify-persistence.py verify
```

You can run `bash scripts/verify-after-restart.sh` for the full sequence automatically, but it temporarily interrupts active users. Do not run it during production traffic. The test verifies durable user accounts, login sessions, group membership, invitations, meeting status, finalized time and notifications.

### Backup

```bash
bash scripts/backup-db.sh
```

This creates a permission-restricted, consistent SQL dump in `backups/`. **Also back up `.env` securely**, especially `TOKEN_ENCRYPTION_KEY`. Store copies in a secure location away from the host, and periodically rehearse restoring onto a *separate test database*. Never put passwords, `.env`, SQL dumps or persistence checkpoints into GitHub.

## 3. Public HTTPS deployment with a domain

For a small capstone, use an Ubuntu VM on your Proxmox machine or another Docker-capable server. Do not expose MySQL's port to the internet. Create a DNS A/AAAA record for a hostname you control, e.g. `eventsync.example.com`, pointing to your public server; forward TCP ports 80 and 443 (and optionally UDP 443) from your router. If your ISP uses CGNAT or blocks inbound ports, use a trusted tunnel or managed hosting instead.

Add to `.env`:

```dotenv
DOMAIN=eventsync.example.com
ALLOWED_ORIGINS=https://eventsync.example.com
FRONTEND_URL=https://eventsync.example.com
MS_REDIRECT_URI=https://eventsync.example.com/api/outlook/callback
```

Bring up Compose with the HTTPS override:

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build
# Or use the prebuilt image variant:
# docker compose -f compose.yaml -f compose.production.yaml -f compose.prebuilt.yaml up -d --build

docker compose -f compose.yaml -f compose.production.yaml ps
curl -fsS https://eventsync.example.com/api/health
```

The production Compose file adds Caddy, which obtains and renews TLS certificates when DNS and inbound ports are configured correctly. The Java API still listens on the Docker network; port 8080 is only published on the host loopback for local diagnostics. Visit `https://eventsync.example.com/` for the bundled UI.

Note: for public exposure, add login abuse/rate limiting at your ingress/WAF, keep Spring/Java/Docker patched, maintain backups and monitor disk space. The included Caddyfile provides basic response headers and TLS, but does not implement an abuse-control service.

## 4. Microsoft Outlook configuration

1. Open Microsoft Entra admin center, create an app registration that allows the Microsoft account types you intend to support; university tenants may require administrator consent.
2. Register a **Web** redirect URI exactly equal to `MS_REDIRECT_URI`, e.g. `https://eventsync.example.com/api/outlook/callback`. For local testing use `http://localhost:8080/api/outlook/callback`.
3. Request delegated Microsoft Graph `Calendars.Read` permission and create a confidential client secret.
4. Set `MS_TENANT`, `MS_CLIENT_ID` and `MS_CLIENT_SECRET` in `.env`, keeping the secret server-side. Restart Java with `docker compose up -d --force-recreate api` (or the production Compose invocation).
5. Use **Connect Outlook** in the browser. Once authorized, choose an interval and click **Sync busy times**. Outlook imported intervals are cached in MySQL and used to filter out conflicts. Synchronization is on demand, not an automatic background job.

If you are using your original published **Figma Make** site instead of the bundled UI, set `FRONTEND_URL` to the Figma site's origin, allow that exact origin in `ALLOWED_ORIGINS`, and implement the `/outlook/callback` flow on Figma using `frontend/eventsync-api.ts`. The backend must remain accessible through public HTTPS. The Figma project is external and is not automatically edited by this ZIP.

## 5. Limits and realistic readiness

* The bundled UI covers accounts, groups, proposed events, invitations for registered users, event-specific and weekly manual availability, overrides, meeting recommendations/finalization, Outlook connection and on-demand import, notifications, and ICS export. The original reference React/Figma adapter is included but not hosted automatically.
* Email **delivery** to unregistered people, email verification/password recovery, scheduled notification delivery, automatic Graph webhook sync, and directly writing finalized events into Outlook are **not** implemented. In-app invites and notifications work using registered EventSync accounts.
* Source compilation, offline algorithm checks, static JS syntax, and TypeScript client tests can run without a database. Live MySQL/Flyway migrations, end-to-end UI behavior, and Microsoft authentication must be tested on the deployment host; they were not verified in the packaging environment.
* If your Microsoft tenant rejects user consent, a tenant administrator must approve the app. Do not collect or store users' Microsoft passwords.

## 6. Troubleshooting

```bash
docker compose ps
docker compose logs --tail=150 api
docker compose logs --tail=150 mysql
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SHOW TABLES"'
```

A database startup or migration failure normally appears in the `api` logs. `http://localhost:8080/api/health` should return 200 only when SQL is reachable. `503`/`500` means check connectivity, MySQL credentials, migrations or service health. If only Outlook connection fails, verify Microsoft client ID, secret, tenant, delegated scopes and the **exact** public callback URL registered in Entra.
