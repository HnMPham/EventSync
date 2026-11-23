# REST API

Base path `/api`. JSON request and response bodies. All routes require `Authorization: Bearer <accessToken>` except health, signup, login, and the Microsoft redirect callback. IDs are server-generated UUIDs; Outlook calendar IDs are opaque strings.

| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/health` | — | `{status:"ok"}` |
| POST | `/auth/signup` | `{name,email,password,timeZone}` | 201 `{accessToken,expiresAt,user}` |
| POST | `/auth/login` | `{email,password}` | `{accessToken,expiresAt,user}` |
| POST | `/auth/logout` | — | Revokes current token |
| GET | `/me` | — | `{id,name,email,timeZone}` |
| GET | `/friends/search` | `?query=Alex` (3–80 chars) | Up to 20 `{id,name}` results |
| GET | `/friends` | — | `[{user:{id,name},status,incoming}]` |
| POST | `/friends/requests` | `{userId}` | Creates pending request |
| POST | `/friends/requests/{userId}/respond` | `{accept:true}` or `{accept:false}` | Incoming recipient only |
| DELETE | `/friends/{userId}` | — | Removes friendship/request |
| GET | `/availability` | `?weekStart=2030-01-07&timeZone=America%2FChicago` | Manual selected starts, own busy intervals, Outlook coverage |
| PUT | `/availability` | `{weekStart,timeZone,slots:[ISO instant,...]}` | Replaces own week, returns updated availability |
| POST | `/availability/matches` | `{weekStart,timeZone,friendIds:[...]}` | `{slots:[...],highestCount}` |
| GET | `/events` | `?view=upcoming` / `invitations` / `organized` | Event list |
| GET | `/events/{id}` | — | Event visible to organizer/invitees |
| POST | `/events` | Event input below | 201 Event |
| PUT | `/events/{id}` | Event input below | Organizer edit; resets invitations |
| DELETE | `/events/{id}` | — | Organizer cancels |
| POST | `/events/{id}/respond` | `{response:"ACCEPTED"}` or `"DECLINED"` | Invitee response |
| POST | `/outlook/connect` | — | `{authorizationUrl,state,completionSecret}` |
| GET | `/outlook/callback` | Microsoft-supplied `code,state` or `error,state` | Exchanges code, then redirects frontend |
| POST | `/outlook/complete` | `{state,completionSecret}` | Authenticated final connection |
| GET | `/outlook/status` | — | `{connected,connectedAt?,lastSyncedAt?}` |
| GET | `/outlook/calendars` | — | `[{id,name,isDefaultCalendar}]` |
| POST | `/outlook/sync` | `{calendarId,start,end}` | `{importedBusyIntervals,start,end,syncedAt}` |
| DELETE | `/outlook` | — | Disconnects; removes tokens and imported intervals |

Password minimum 10 characters and maximum 72 UTF-8 bytes. App tokens expire after 12 hours. Dates in examples are illustrative; create events in the future. Events last at most seven days and invite at most 50 accepted friends. Availability matches accept at most 50 selected friends.

## Example event input

```json
{
  "title": "Capstone study group",
  "description": "Review our EventSync demo",
  "location": "Library, room 204",
  "start": "2030-01-07T16:00:00Z",
  "end": "2030-01-07T17:00:00Z",
  "timeZone": "America/Chicago",
  "inviteeIds": ["REPLACE_WITH_ACCEPTED_FRIEND_USER_ID"]
}
```

Event response includes those details plus `id`, `organizerId`, `cancelled`, `myResponse`, and `guests:[{user:{id,name},response}]`. It does not include `inviteeIds` separately. Upcoming means organized or accepted events whose end is in the future; invitations means unresponded future invitations; organized includes cancelled/history records. Lists return at most 500 records.

## Example matching slot

```json
{
  "start": "2030-01-07T16:00:00Z",
  "end": "2030-01-07T17:00:00Z",
  "localTime": "2030-01-07T10:00-06:00[America/Chicago]",
  "youAvailable": true,
  "availableCount": 2,
  "availableFriends": [
    {"id":"friend-1","name":"Alex Chen"},
    {"id":"friend-2","name":"Jordan Lee"}
  ],
  "best": true
}
```

All slots in the local week are returned. Friends' private busy intervals are never returned. The `GET /availability` busy list is for the current user only and combines imported Outlook intervals with organized/accepted EventSync events. Use `outlookCoverage` to show what ranges have been imported and when; absence of coverage is not confirmation of an empty Outlook calendar.

## OAuth request sequence

1. Authenticated `POST /outlook/connect`. Store `state` and `completionSecret` in same-tab frontend storage.
2. Navigate browser to `authorizationUrl`.
3. Microsoft returns to the Java `MS_REDIRECT_URI`. Backend checks state, uses its encrypted verifier to redeem the code, and stores encrypted pending tokens.
4. Backend redirects to `FRONTEND_URL/outlook/callback?state=...`; access tokens and codes are absent from that redirect.
5. Frontend calls authenticated `POST /outlook/complete` with original state/secret in the original app login. State is consumed once. A new login session cannot complete an old pending authorization.
6. List calendars and sync a selected calendar/range. Save no Outlook credentials in the browser.

On 503 throttling, wait before retrying; there is no automatic retry loop. On invalid/revoked Microsoft authorization (409), reconnect. A failed import preserves existing cached intervals.
