# EventSync: relational database, backend operations and Figma integration

This revision builds on the user's original Spring Boot 3.5 / Java 21 / MySQL 8.4 backend. It retains the original endpoints and adds a migration named `V2__groups_and_scheduling.sql`. **Do not edit or re-run V1 on an existing database.** Flyway will apply V2 automatically at startup. Back up MySQL first.

## Database mapping to the capstone ERD

| Capstone ERD entity | Actual MySQL table | Notes |
|---|---|---|
| USERS | `users` | Original schema; UUID string keys |
| GROUPS | `event_groups` | Name avoids the MySQL reserved keyword `GROUPS` |
| GROUP_MEMBERS | `group_members` | Composite key; `ADMIN` or `MEMBER` |
| EVENTS | `events` | Existing fixed events plus proposed events; `DRAFT`, `COLLECTING`, `FINALIZED`, `CANCELLED` |
| EVENT_PARTICIPANTS | `invitations` | Existing composite-key association table with response status |
| AVAILABILITY | `event_availability` | Per-event manual availability; existing `availability` remains reusable weekly selections |
| CALENDAR_BUSY_SLOTS | `imported_busy` | Busy intervals fetched through Microsoft Graph `calendarView` |

Additional storage: `manual_overrides` for explicit free/busy changes; `notifications` for in-app updates; `event_submissions` so an empty but valid response counts as submitted; `outlook_connections`, `calendar_syncs`, `oauth_pending`, `sessions`, `friendships` inherited from the original project.

All timestamps exchanged with the REST API are ISO 8601 instants in UTC; the user's IANA time zone is saved separately for display. Group, event, invitation and availability records persist in MySQL. The Java service performs the recommendation algorithm.

## Main backend operations

| Feature | Request | Database operation |
|---|---|---|
| Sign up, log in | `POST /api/auth/signup`, `/api/auth/login` | `users`, `sessions` |
| Edit profile / email / password | `PUT /api/me`, `PUT /api/me/email`, `POST /api/me/password` | `users`, `sessions` |
| Groups | `GET/POST /api/groups`, `GET/PUT/DELETE /api/groups/{id}` | `event_groups`, `group_members` |
| Manage group membership | `POST /api/groups/{id}/members`, `PUT /api/groups/{id}/members/{userId}/role`, `DELETE /api/groups/{id}/members/{userId}` | `group_members` |
| Create proposed event | `POST /api/scheduling-events` | `events`, `invitations`, `notifications` |
| Search/list/view/edit proposed events | `GET/PUT /api/scheduling-events[/{id}]` | `events`, participant and availability joins |
| Publish draft | `POST /api/scheduling-events/{id}/publish` | `events.status`, notifications |
| Invite by user ID/email | `POST /api/scheduling-events/{id}/invite`, `/invite-email` | `invitations`, `notifications` |
| Share a link/code | Code from creation; `POST /{id}/rotate-code`, `POST /{id}/join` | `events.invite_code_hash`, `invitations` |
| Join a group event | `POST /api/scheduling-events/{id}/join-group` | `group_members`, `invitations` |
| Decline invitation | `POST /api/scheduling-events/{id}/respond` with `{ "accept": false }` | `invitations`, `event_availability` |
| Enter/edit event availability | `PUT /api/scheduling-events/{id}/availability` | Replace current user's `event_availability`, update `event_submissions` |
| Copy reusable weekly availability | `POST /api/scheduling-events/{id}/prefill-my-weekly` | Read `availability` and populate `event_availability` |
| Connect/sync Outlook and Teams calendar | Existing `/api/outlook/connect`, `/callback`, `/complete`, `/sync-default` | `outlook_connections`, `calendar_syncs`, `imported_busy` |
| View/edit weekly available hours | `GET /api/availability/slots`, `GET/PUT /api/availability` | `availability` |
| Edit a manually blocked or free interval | `POST/DELETE /api/availability/overrides` | `manual_overrides` |
| Rank recommendations | `GET /api/scheduling-events/{id}/recommendations` | Read `event_availability`, `imported_busy`, `manual_overrides`, finalized events |
| Finalize / reopen / cancel / delete event | `POST /{id}/finalize`, `/reopen`, `/cancel` and `DELETE /{id}` | `events`, `notifications` |
| Calendar export | `GET /api/scheduling-events/{id}/calendar.ics` | Read finalized event; returns downloadable iCalendar |
| In-app notifications | `GET /api/notifications`, `POST /api/notifications/{id}/read` | `notifications` |

All endpoints except signup, login, health and Microsoft's OAuth callback require the existing EventSync bearer token. Organizer-only edits and group-admin actions are checked server-side; the React app must never connect directly to MySQL.

## Proposed event JSON

```json
{
  "title": "Capstone team meeting",
  "description": "Discuss project milestones",
  "location": "Microsoft Teams",
  "windowStart": "2030-01-07T09:00:00Z",
  "windowEnd": "2030-01-08T22:00:00Z",
  "durationMinutes": 60,
  "timeZone": "America/Chicago",
  "groupId": null,
  "inviteeIds": [],
  "draft": false
}
```

The response contains `{ "event": ..., "invitationCode": "..." }`. Treat that code as a bearer secret: share it only with intended invitees, do not log it, and rotate it if exposed. The backend stores only its SHA-256 digest, not the plaintext. Participants must register/log in before joining. Organization administrators can add existing EventSync accounts to groups, and organizers can invite registered users by email.

### Availability JSON

```json
{"slots":[
  {"start":"2030-01-07T09:00:00Z","end":"2030-01-07T12:00:00Z"},
  {"start":"2030-01-07T14:00:00Z","end":"2030-01-07T17:00:00Z"}
]}
```

`PUT` replaces the participant's earlier selection for that event. Submitting an empty array means "I cannot attend any proposed time" and counts as a response. Event recommendations use 30-minute increments with organizer-chosen durations of 30–480 minutes. Maximum scheduling window is 31 days, with up to 150 participants and 20 returned suggestions. The organizer can choose a time inside the scheduling window even when it is not the top-ranked option.

**Availability precedence:** the participant must choose an interval for the event (or prefill from weekly availability). External Outlook events and finalized meetings then block that interval. An explicit manual `AVAILABLE` override can lift an overlapping **Outlook** block but cannot override another confirmed EventSync meeting; explicit `BUSY` blocks the proposed time. Manual overrides do not automatically mark an event participant available. Changes to the scheduling window clear event-specific submissions because previously selected times are no longer reliable.

## Figma Make / React wiring

1. In the Figma Make code editor, copy `frontend/eventsync-api.ts` into `src/lib/eventsync-api.ts`. Import `createEventSyncApi` and initialize once with the **public HTTPS backend URL ending in `/api`**, for example `https://api.example.edu/api`.
2. Use the frontend API methods for login, group management, proposed event creation, join links, availability form submission, recommendations and finalization. The project root includes a reference React UI component at `examples/EventSyncDashboard.tsx`.
3. Store the EventSync access token with the existing client (currently tab-scoped `sessionStorage`). The backend validates the bearer token on each request. NEVER put MySQL passwords, Microsoft's client secret, or Graph refresh/access tokens in the frontend.
4. Add the exact Figma deployment origin to `ALLOWED_ORIGINS`, and set `FRONTEND_URL` to the actual React application origin. Also register the matching `MS_REDIRECT_URI` in Microsoft Entra; the callback is routed to the backend.
5. Show Outlook's "Connect" and "Sync" controls using existing `api.connectOutlook()`, `api.finishOutlookConnection()` and `api.syncDefaultOutlook(start,end)`. A user must separately grant Microsoft permission. The backend calls Graph's `calendarView`, not an undocumented scraping interface.
6. Make the joining page parse the event ID and invitation code from its URL. Call `api.joinPoll(id,code)` after login, then show the availability controls. Organizer-only finalization should be based on `poll.organizerId === api.me().id`, with server access enforced independently.
7. When the organizer finalizes, call `api.finalizePoll(id,start)` and offer `api.downloadPollCalendar(id)` to download the `.ics`. In-app notifications are available from `api.notifications()`.

The supplied Figma URL alone does not give write access to the Figma Make project. The backend ZIP does **not** edit or deploy that hosted frontend; you must add the provided client and React components to your Figma code and deploy the backend to a reachable host.

## Running and deployment

1. Back up an existing database. Keep your existing `.env` secrets, especially `TOKEN_ENCRYPTION_KEY` (changing it makes previously encrypted Microsoft OAuth tokens unreadable).
2. Set `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `TOKEN_ENCRYPTION_KEY`, `ALLOWED_ORIGINS`, `FRONTEND_URL`, `MS_TENANT`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI` in `.env`.
3. Run `docker compose up --build -d` in this project's root. MySQL will start, and Flyway will run V1 then V2 on a new database or only V2 on an existing V1 database.
4. Use `curl http://localhost:8080/api/health` on the backend machine to check startup. The Docker Compose API port is bound to 127.0.0.1 deliberately; put it behind a TLS reverse proxy for public Figma Make access.
5. Run `mvn verify` and `cd frontend && npm ci && npm test` to execute the project's tests. Integration testing of Outlook requires a Microsoft Entra app and a consented account; tests mock Microsoft HTTP responses.

## Limitations / further work

- Email invitations resolve existing EventSync users by email and create **in-app notifications**. Outbound SMTP email invitations and password reset email are not implemented because a mail provider/configuration was not supplied.
- Recommendations use event-specific manual availability. Graph imports only busy intervals; this is designed for privacy but is not a complete calendar mirror.
- One-to-many authorization and isolation are enforced by backend checks, but the project still needs real MySQL and live Microsoft end-to-end tests before a production launch.
- The supplied Figma Make frontend must be connected manually; there is no deployed frontend included.

## Diagrams

- `docs/diagrams/relational-core.mmd`: core ERD
- `docs/diagrams/auth-and-sync.mmd`: authentication and integration tables
- `docs/diagrams/java-flow.mmd`: Java class/service call flow
- `docs/diagrams/java-classes.mmd`: Java class diagram
