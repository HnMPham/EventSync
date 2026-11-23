# EventSync — Figma Make React + Java + MySQL, integrated source

This release includes the **actual exported Figma Make React code** (in `figma-source/`), wired to the persistent Spring Boot API, and the backend from the previous release. It is no longer an adapter-only package. The original Figma-hosted project is not automatically edited by the download.

## Quick local development (recommended first)

1. Install Docker with Docker Compose, Node.js 22 or newer, and npm.
2. `cp .env.example .env` and set unique `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). Never rotate the encryption key casually if Outlook credentials exist.
3. Start the backend/MySQL:

   ```sh
   docker compose -f compose.yaml -f compose.prebuilt.yaml -f compose.figma.dev.yaml up -d --build
   curl http://127.0.0.1:8080/api/health
   ```

4. In another terminal:

   ```sh
   cd figma-source
   npm install
   npm run dev
   ```

5. Open **http://localhost:8443** (Vite/React, not the older server testing UI on port 8080). Register a new account or sign in with an existing one. The `vite.config.ts` proxy sends `/api` requests to Spring on port 8080.
6. Test two separate accounts (two browsers or profiles), friend requests, group membership, availability, creating a meeting, invitations, and reloads. Existing data survives normal container restarts because MySQL uses a named Docker volume.

> Microsoft OAuth is optional until you add `MS_CLIENT_ID` and `MS_CLIENT_SECRET`. In Microsoft Entra, register the exact **http://localhost:8443/api/outlook/callback** URI for local testing. Microsoft 365 work/school accounts may require admin approval. Do not expose secrets to Vite.

## Deploy the integrated frontend and backend with one domain

1. Point DNS for `eventsync.example.com` (replace with yours) to your server and allow ports 80 and 443. Configure `DOMAIN=eventsync.example.com` in `.env` and Microsoft OAuth credentials when ready.
2. Build the **real Figma React source** into Caddy's site directory:

   ```sh
   bash scripts/build-figma-frontend.sh ./figma-source
   ```

3. Start HTTPS, Java and MySQL together:

   ```sh
   docker compose -f compose.yaml -f compose.prebuilt.yaml -f compose.production.yaml -f compose.figma.yaml up -d --build
   ```

4. Visit `https://eventsync.example.com`. Caddy serves React and routes `/api/*` to Spring Boot, which uses MySQL for persistent records. Set the **exact** production Microsoft redirect URI: `https://eventsync.example.com/api/outlook/callback` in Entra.

Make a backup first when upgrading an existing deployment; keep `MYSQL_VOLUME_NAME` set to your existing named volume. **Never use `docker compose down -v` on a database you want to keep**. See `docs/deployment.md` for persistence checks and backup scripts.

## Connected Figma screens

| UI | Java endpoints | Storage |
|---|---|---|
| Login/signup/profile/password | `/api/auth/*`, `/api/me*` | MySQL users and sessions |
| Friends / invitations | `/api/friends*` | MySQL friendships |
| Weekly calendar, manual edits, overlap | `/api/availability*` | MySQL availability, manual overrides and busy slots |
| Outlook connect, sync, disconnect | `/api/outlook*` | Microsoft Graph + encrypted tokens and imported busy slots in MySQL |
| Create fixed-time events / accept / cancel | `/api/events*` | MySQL events and invitations |
| Group memberships, admin roles | `/api/groups*` | MySQL event_groups and group_members |
| Find Meeting Time: proposed event, join codes, rank, finalize, .ics | `/api/scheduling-events*` | MySQL event_availability, events, submissions and invitations |
| Notifications | `/api/notifications*` | MySQL notifications |

The original Figma sample/student and sample/admin accounts have been **removed**, and the fake administrative public-event dashboard is not shown. Group administrators can manage real groups from the Groups tab. Public-event feeds, Google sign-in, password-reset emails, and automatic outgoing emails are NOT implemented by this backend; no controls claim that they work.

## What has and hasn't been verified

- The modified React/TypeScript source was parsed with TypeScript and checked against minimal local React declaration stubs; those offline checks passed. The existing Java API client test suite also passed **6 of 6** tests using `cd frontend && npm test`.
- A real `npm install`, Vite production build, live MySQL browser test, and Microsoft OAuth test **could not be run in the current environment**. Run them on your own development host before production.
- The underlying precompiled Spring Boot `app.jar` came from the previous EventSync release; its database and Java tests were checked separately, but the Figma UI has not yet been tested end to end with that JAR.
- Your data is persisted by the MySQL Docker volume, not by React local state. Authentication token storage remains session-scoped: re-opening another browser session may require login again; saved data is not lost.

## Design / development details

- The Figma Make app's layout, colors and typography are retained. New screens (`LiveScheduling.tsx`, `LiveGroups.tsx`, `LiveProfile.tsx`) follow the same CSS variables.
- `figma-source/src/lib/eventsync-api.ts` contains the typed client. `figma-source/src/lib/api.ts` selects `/api` on a deployed same-origin site.
- For **Figma Make's hosted preview**, a private `localhost` API cannot be reached from Figma's servers. Use the deployed HTTPS API URL via `VITE_EVENTSYNC_API_BASE_URL` and configure a matching allowed CORS origin, or use the self-hosted frontend.
- Running the Figma preview does not rewrite your original Figma project; this is the **downloaded code export**, and you can keep designing separately in Figma.
