# Microsoft Graph → Java → MySQL → Figma Make integration

## What was already present

This backend already used Microsoft Graph `calendarView`, OAuth 2.0 authorization-code flow with PKCE, encrypted refresh tokens, Spring JDBC, MySQL/Flyway migrations, manual availability, and a React/TypeScript client. It does **not** need a second Microsoft API implementation. `calendarView` returns events and recurring instances; the backend stores only their busy intervals, not meeting titles.

## Changes in this revision

- `POST /api/outlook/sync-default`: authenticated convenience endpoint to sync the user's default Outlook calendar for an ISO-8601 UTC start/end range (maximum 90 days), reusing existing `OutlookService.sync` and its database transaction.
- `syncDefaultOutlook(start, end)` in `frontend/eventsync-api.ts`.
- `examples/OutlookCalendarPanel.tsx`: React example showing connect, OAuth callback completion, default-calendar sync, disconnect, and status.

## Setup

1. Copy `.env.example` to `.env`, choose unique MySQL passwords, and generate a 32-byte key (`openssl rand -base64 32`). Keep the key private and persistent.
2. Register a Microsoft Entra application supporting the intended account types. Add **Web** redirect `http://localhost:8080/api/outlook/callback`, delegated `Calendars.Read`, and a client secret. Set `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT`, `MS_REDIRECT_URI` in `.env`.
3. Set `FRONTEND_URL` and `ALLOWED_ORIGINS` to the actual React frontend origin. Microsoft returns to the Java backend, which redirects the browser to `${FRONTEND_URL}/outlook/callback`.
4. Start with `docker compose up --build -d` (requires Docker). Flyway creates MySQL tables automatically.
5. In the React project, copy `frontend/eventsync-api.ts` to `src/lib/eventsync-api.ts`. Adjust the example component import to `../lib/eventsync-api` when placing it in `src/components/`.
6. Configure `VITE_API_BASE_URL=http://localhost:8080/api` for a locally running frontend. For a deployed Figma Make frontend, use a publicly reachable **HTTPS** API URL, configure CORS for its exact origin, and update both Microsoft redirect and frontend callback URLs. `localhost` is not reachable from a remotely hosted frontend user's browser.
7. After login, click Connect Outlook, authorize, and click Sync. For the example component, ensure your frontend router serves it at `/outlook/callback` as well as the settings screen. Reload the weekly availability UI after sync (`onImported`).

## Data storage

- `users`: EventSync accounts.
- `sessions`: hashed EventSync bearer tokens.
- `outlook_connections`: encrypted Microsoft access/refresh token JSON, connection time and last sync time.
- `oauth_pending`: short-lived, session-bound authorization handshakes.
- `imported_busy`: Outlook busy time intervals (user/calendar/start/end).
- `calendar_syncs`: imported calendar and covered time range.
- `availability`: manually selected available intervals.
- `events`, `invitations`: EventSync meetings and invitation responses.

The existing matching logic requires explicit manual availability **and** no conflicting imported busy period. A manual 'available' selection does NOT override an Outlook conflict in the current design. If you want explicit user overrides to win over Outlook, that is a separate feature requiring a new override status table, priority rules, and UI controls.

## API examples (requires an EventSync bearer token)

```http
GET /api/outlook/status
POST /api/outlook/connect
GET /api/outlook/calendars
POST /api/outlook/sync-default
Content-Type: application/json

{"start":"2026-11-01T00:00:00Z","end":"2026-11-15T00:00:00Z"}
```

Manual selection uses `PUT /api/availability` with `{ "weekStart": "2026-11-02", "timeZone": "America/Chicago", "slots": ["2026-11-02T15:00:00Z"] }`. Compare schedules with `POST /api/availability/matches`.

## Verification / limitations

The existing archive documents 13 Java tests and 4 TypeScript tests from an earlier environment; this revision has not been tested against a real Microsoft tenant or MySQL server. A live Entra app registration and authorized account are required for an end-to-end test. The supplied hosted Figma Make project has not been edited: the React example must be integrated into its source. `getSchedule` is not used; `calendarView` is the existing and retained API operation.
