# Connect the **original** Figma Make EventSync UI to Java + MySQL

This package provides an API adapter, session hook, Outlook OAuth return component, and a Caddy deployment overlay. The original Figma Make component code was **not provided** with the uploaded backend ZIP; there is no safe way to edit its specific existing screens or control handlers from a link alone. To finish the visual integration, export and provide your Figma Make code ZIP (or connect an account with read/write access). Do not claim the original interface is connected before its actual source is modified and tested.

## Export your actual Figma Make code

1. Open `https://www.figma.com/make/2mbRWHdJR1UsmgbnqP7LWk/EventSync-CAPSTONE` in Figma.
2. Open the **Code** or **Files** tab. Choose **File actions → Download code** (Figma says Full/Dev seats can download code).
3. Extract the ZIP to a folder, such as `~/eventsync-figma/`, with `package.json` in the root.
4. Keep a backup of the original Figma ZIP before editing.

## Install the API bridge in the exported React code

From the EventSync backend directory:

```bash
bash scripts/prepare-figma-export.sh ~/eventsync-figma
```

This copies these TypeScript files into your Figma React source:

- `src/lib/eventsync-api.ts` — calls all existing Spring Boot REST routes and stores the opaque login token within the current browser tab.
- `src/lib/api.ts` — configures a shared API client, defaulting to `/api` when deployed behind the same hostname.
- `src/hooks/useEventSyncSession.ts` — replaces demo login/signup and current-user state.
- `src/components/OutlookCallback.tsx` — completes Microsoft OAuth in the tab that initiated it.

**These source files alone do not replace mocked UI behavior:** wire the buttons/forms/routes in the original Figma files. See mapping below.

## Mapping existing Figma screens to real API operations

| Figma interface | Java API call(s) | Data source |
|---|---|---|
| Register, sign in, sign out | `api.signup`, `api.login`, `api.me`, `api.logout` | `users`, `sessions` |
| Home/dashboard upcoming events | `api.polls('all')`, `api.events('upcoming')` | `events`, invitations |
| Create scheduling meeting | `api.createPoll`, `api.publishPoll` | `events` |
| Meeting details and invites | `api.poll`, `api.inviteEmailToPoll`, `api.joinPoll` | event participants |
| Manual event availability | `api.submitPollAvailability`, `api.prefillPollWeekly` | `event_availability` |
| Weekly availability grid | `api.weekSlots`, `api.week`, `api.saveAvailability` | `availability` |
| Override Outlook blocks | `api.addManualOverride`, `api.removeManualOverride` | manual override table |
| Find best meeting times | `api.recommendPollTimes` | Java `SchedulingService` |
| Finalize meeting | `api.finalizePoll` | `events` |
| Friends | `api.searchUsers`, `api.friends`, `api.addFriend`, `api.respondToFriend` | users, friendships |
| Groups | `api.groups`, `api.createGroup`, `api.addGroupMember`, `api.setGroupMemberRole` | groups and memberships |
| Microsoft Outlook connection | `api.connectOutlook`, `api.finishOutlookConnection` | Graph OAuth |
| Outlook sync and status | `api.outlookStatus`, `api.outlookCalendars`, `api.syncDefaultOutlook` | Graph + imported busy |
| In-app notifications | `api.notifications`, `api.markNotificationRead` | notification records |

**Critical behavior:** `api.saveAvailability(weekStart, timeZone, slots)` **replaces all saved selections for that week**. Send the whole selection set; do not save one time cell at a time. Event-specific availability and weekly availability are separate operations. Use real backend user/event IDs, never mock IDs. Do not confuse fixed-time `/events` endpoints with proposed scheduling `/scheduling-events` endpoints. The app's public invitation code must only be shown to intended invitees.

### Minimal React hookup

```tsx
import { api } from './lib/api';
import { useEventSyncSession } from './hooks/useEventSyncSession';
import { OutlookCallback } from './components/OutlookCallback';

export function App() {
  // The callback MUST use the same browser tab and the same API root.
  if (window.location.pathname === '/outlook/callback') {
    return <OutlookCallback />;
  }
  return <EventSyncApp />;
}

function EventSyncApp() {
  const { user, loading, login, signup, logout } = useEventSyncSession();
  if (loading) return <p>Loading account…</p>;
  if (!user) {
    // Connect your EXISTING Figma login form to `login(email, password)`;
    // signup form to `signup(name,email,password)`.
    return <YourOriginalFigmaLogin onLogin={login} onSignup={signup} />;
  }
  // Wire your existing Figma dashboard's view and action handlers to `api.*`.
  return <YourOriginalFigmaDashboard user={user} api={api} onLogout={logout} />;
}
```

`YourOriginalFigmaLogin` and `YourOriginalFigmaDashboard` are placeholders representing components in the **unavailable** Figma export; do not paste this as compiling code until you replace those names with your actual components.

### Scheduling workflow sample

```ts
const created = await api.createPoll({
  title: 'Team meeting',
  windowStart: '2026-12-01T14:00:00Z',
  windowEnd: '2026-12-03T23:00:00Z',
  durationMinutes: 60,
  timeZone: 'America/Chicago',
  inviteeIds: []
});
await api.publishPoll(created.event.id);
// Other users submit their slots through api.submitPollAvailability(...)
const matches = await api.recommendPollTimes(created.event.id);
// Only organizer may finalize a suggested start:
if (matches.suggestions.length) await api.finalizePoll(created.event.id, matches.suggestions[0].start);
```

### Outlook redirect behavior

1. Call `await api.connectOutlook()` **in the browser** from a user click in the same tab; it redirects to Microsoft.
2. Microsoft redirects to the **Java** callback, `https://YOUR_DOMAIN/api/outlook/callback` (this exact URL must be registered in Microsoft Entra).
3. Java redirects the user to the **React** route `https://YOUR_DOMAIN/outlook/callback?state=...`.
4. Render `<OutlookCallback />`, which invokes `api.finishOutlookConnection()` once, then shows the result.
5. In Calendar, call `api.outlookStatus()` then `api.syncDefaultOutlook(startISO,endISO)`. Refresh the displayed grid from `api.week(...)`.

The Graph client secret and OAuth access/refresh tokens must remain on the Java server. Outlook sync is an explicit snapshot; no automatic background polling is included.

## Host exported Figma and Java on one HTTPS domain (recommended)

Build the exported React project into `figma-dist`:

```bash
bash scripts/build-figma-frontend.sh ~/eventsync-figma
```

The script runs `npm ci` (or `npm install` without a lockfile), builds with `VITE_EVENTSYNC_API_BASE_URL=/api`, then copies the resulting `dist` assets to `figma-dist`.

In the backend `.env` set `DOMAIN=eventsync.yourdomain.com`, suitable MySQL passwords and `TOKEN_ENCRYPTION_KEY`, and Microsoft credentials if Outlook is enabled. Point the domain's DNS at the Docker host. Open ports 80/443.

```bash
docker compose -f compose.yaml -f compose.production.yaml -f compose.figma.yaml up -d --build
```

This serves both Figma React and Java under `https://eventsync.yourdomain.com`:

- `/` — the Figma-built React app (with SPA fallback)
- `/outlook/callback` — React OAuth completion route
- `/api/...` — Spring Boot Java routes

No cross-origin browser API calls are required. The Caddy configuration allows inline CSS (for generated React styling) and HTTPS image/font sources; review the Content Security Policy for your actual exported dependencies and reduce permissions where possible.

**Do not delete the named MySQL Docker volume.** Rebuilding the frontend or Java image does not normally delete MySQL data; `docker compose down -v` would. Make backups before database migrations.

### Alternate: Keep Figma Make-hosted preview

Instead of `/api`, set `VITE_EVENTSYNC_API_BASE_URL=https://eventsync.yourdomain.com/api` in the **actual Figma Make build settings** and configure `ALLOWED_ORIGINS` on Java with the **real browser origin of the hosted preview**, not the editor's `www.figma.com` address. Figma-hosted preview URLs may change, which complicates CORS and OAuth. `FRONTEND_URL` must use a stable frontend origin. For this reason, exporting and self-hosting the frontend on the Java domain is more predictable.

## Verification checklist

1. Visit `https://YOUR_DOMAIN/api/health` and confirm MySQL is healthy.
2. Create two real accounts in separate browsers; refresh both browsers and confirm each account can call `api.me()`.
3. Create a proposed meeting; invite the other account; reload and verify that it persists.
4. Submit availability from both accounts, compare recommendations, finalize, and reload.
5. Connect Outlook, return through `/outlook/callback`, sync calendar events, verify busy time conflicts.
6. Restart containers **without deleting volumes** and confirm users, meetings, availability, and sessions are unchanged.
7. Check developer tools: no JS errors, no failed CORS preflights, no API endpoints pointed at the Figma editor, and no credentials in client bundles.

The original Figma source ZIP is required for exact component-by-component modifications and a genuine end-to-end UI test.
