# Connect the existing Figma Make app

The supplied URL is a **Figma Make** project. Its preview was readable and showed a demo login, Calendar, Events, Friends, and an extra Groups tab. The Java project implements the nine requested functions. It does not alter the hosted Figma project. Groups, Google sign-in, admin tools, notifications, and password-reset email are outside the requested implementation; remove their demo controls or implement them separately before presenting them as working features.

## Install the API client

1. Copy `frontend/eventsync-api.ts` into your Make source as `src/lib/eventsync-api.ts`.
2. Create `src/lib/api.ts`:

```ts
import { createEventSyncApi } from './eventsync-api';
export const api = createEventSyncApi('https://YOUR-BACKEND-HOST/api');
```

Use an HTTPS backend reachable by the browser for a published Make frontend. `localhost` works only on the computer running the backend, and a hosted HTTPS preview may block HTTP requests. Add the **actual frontend origin** to `ALLOWED_ORIGINS`, for example `https://YOUR-PUBLISHED-HOST`; the `www.figma.com/make/...` editor URL is not necessarily the application's origin. Inspect `window.location.origin` inside the app's own preview and your browser's Network panel. Comma-separated origins are accepted. Do not allow arbitrary origins.

3. Replace demo authentication with `await api.signup(name, email, password)` and `await api.login(email, password)`. Set your React current-user state from `result.user`. On app startup call `api.me()`; a 401 means show login. Logout calls `api.logout()`.
4. Replace hardcoded friends with `api.friends()`. Split the result by `status` and `incoming`. Search starts after at least three characters. Save actual user IDs returned by the API. Existing demo users do not exist in MySQL: create real accounts first.
5. Load `api.week(mondayDate, timeZone)` and `api.matches(mondayDate, timeZone, selectedFriendIds)`. `mondayDate` is a local `YYYY-MM-DD`. The API returns slots with absolute ISO instants and display labels. Do not hardcode 168 slots: a DST week can have 167 or 169 hours. Use `start` as the cell key, and display the offset when a local hour repeats. Fractional DST transitions can produce a shorter final slot.
6. Mark manual selections using `selectedStarts`. When saving, call `api.saveAvailability(mondayDate, timeZone, allSelectedStarts)`. This **replaces the whole selected week**; serialize saves or debounce and wait for the last request to finish so rapid clicks do not overwrite newer changes. A selected hour can remain selected while a busy event makes it unavailable. Refetch matches after saves.
7. For each grid block, use `best` to highlight **all** tied best times. Use `availableCount` and `availableFriends` for the selected-time panel. The API counts invited/selected friends only, and requires the organizer to be free for a block to be marked best. A zero count has no best highlight.
8. Map event tabs to `api.events('upcoming')`, `api.events('invitations')`, and `api.events('organized')`. Accept/Decline calls `api.respondToEvent(id, boolean)`. New event forms call `api.createEvent({ title, description, location, start, end, timeZone, inviteeIds })`. Editing resets invitees to pending so they can approve the revised details. Cancel with `api.cancelEvent(id)`.

## Outlook connect button and callback

Add a **Connect Outlook** button calling `api.connectOutlook()`. It saves a tab-scoped completion secret and navigates the same tab to Microsoft. It does not require third-party cookies.

Add a React route **`/outlook/callback`**, served by your frontend host's SPA fallback. This route must load the same API client, with the same `baseUrl` and origin used before the redirect. If using a custom domain, use that exact origin in `FRONTEND_URL`. A changing Make preview address is unsuitable as a stable OAuth return address.

On that route:

```ts
try {
  const connected = await api.finishOutlookConnection();
  // Show success or cancellation, then navigate to the Calendar screen.
} catch (error) {
  // Show the error; allow the user to restart Connect Outlook.
}
```

Run completion once, outside duplicate React StrictMode effects or behind a shared promise/ref. Refreshing the callback after successful completion is harmless because the URL state is removed.

After connection:

```ts
const calendars = await api.outlookCalendars();
// Present calendar names in a selector. Let the user choose which to import.
const result = await api.syncOutlook(calendarId, firstSlot.start, lastSlot.end);
const week = await api.week(mondayDate, timeZone);
const matches = await api.matches(mondayDate, timeZone, selectedFriendIds);
```

For multiple calendars, sync each selected calendar. Imported calendars accumulate until disconnected; this version has no per-calendar removal endpoint. Use Disconnect and reconnect to clear old selections. Show `outlookStatus().lastSyncedAt` and coverage metadata to avoid implying the whole Outlook calendar is continuously current. Provide a **Refresh Outlook** button. Imports are snapshots, not live subscriptions or a scheduled background job.

## Prompt to paste into Figma Make after adding the client

> Connect this existing EventSync UI to the Java REST API using the supplied eventsync-api.ts client and the api singleton. Preserve the current design. Replace demo login, fake users, fake friends, random availability, and local-only events with the client methods described in frontend-integration.md. Use backend IDs and ISO instants. Render every matching slot returned by the API; highlight every slot whose best flag is true. Persist a full week's explicit manual selections with serialized saves and reload matches after changes. Wire friend requests and event invitation responses. Add Connect Outlook, calendar selection, Import/Refresh, Last Synced, and Disconnect controls. Implement the /outlook/callback route to finish authorization once in the same tab, then return to Calendar. Show loading, empty, validation, session-expired, and API-failure states. Never put database credentials, Microsoft client secrets, or Microsoft tokens in frontend code. Hide unsupported demo features such as Google sign-in and password reset until implemented.

## Browser authentication scope

The adapter stores an opaque 12-hour app token in `sessionStorage` to survive the full-page Microsoft redirect. Microsoft tokens stay encrypted on the server. A frontend XSS flaw can read an app token, so keep dependencies and CSP maintained. For a hardened public deployment, consider serving frontend/backend on one origin using HttpOnly sessions and CSRF protection; that requires changing this adapter and authentication scheme together.
