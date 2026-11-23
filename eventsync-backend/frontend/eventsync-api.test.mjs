import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEventSyncApi, ApiError } from './.test-build/eventsync-api.js';

let store, calls, queue, navigated, cleaned;
beforeEach(() => {
  store = new Map(); calls = []; queue = []; navigated = undefined; cleaned = false;
  globalThis.sessionStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };
  globalThis.window = {
    location: { search: '', pathname: '/outlook/callback', assign: url => { navigated = url; } },
    history: { replaceState: () => { cleaned = true; } },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    if (!next) throw new Error('Unexpected request');
    return { ok: next.status < 400, status: next.status, json: async () => next.body };
  };
});
function respond(body, status = 200) { queue.push({ body, status }); }

test('login persists opaque app token, requests authenticate, 401 clears it', async () => {
  const api = createEventSyncApi('https://api.example/api/');
  respond({ accessToken: 'opaque-token', user: { id: 'alice' } });
  await api.login('alice@example.edu', 'password');
  assert.equal(calls[0].url, 'https://api.example/api/auth/login');
  respond({ id: 'alice' }); await api.me();
  assert.equal(calls[1].options.headers.Authorization, 'Bearer opaque-token');
  respond({ error: 'Expired' }, 401);
  await assert.rejects(api.me(), error => error instanceof ApiError && error.status === 401);
  assert.equal(store.size, 0);
});

test('Outlook same-tab completion survives rebuilding the client without exposing Microsoft tokens', async () => {
  let api = createEventSyncApi('https://api.example/api');
  respond({ accessToken: 'app-token' }); await api.login('alice@example.edu', 'password');
  respond({ authorizationUrl: 'https://login.microsoftonline.com/authorize', state: 'state1', completionSecret: 'completion1' });
  await api.connectOutlook();
  assert.equal(navigated, 'https://login.microsoftonline.com/authorize');
  window.location.search = '?state=state1';
  api = createEventSyncApi('https://api.example/api');
  respond({ connected: true });
  assert.equal(await api.finishOutlookConnection(), true);
  const completion = calls.at(-1);
  assert.equal(completion.options.headers.Authorization, 'Bearer app-token');
  assert.deepEqual(JSON.parse(completion.options.body), { state: 'state1', completionSecret: 'completion1' });
  assert.equal(cleaned, true);
  assert.equal(store.size, 1);
});

test('forged callback state sends no completion request', async () => {
  const api = createEventSyncApi('https://api.example/api');
  window.location.search = '?state=forged';
  await assert.rejects(api.finishOutlookConnection(), /tab where it started/);
  assert.equal(calls.length, 0);
});

test('matches and event invitations use backend IDs and expected request shapes', async () => {
  const api = createEventSyncApi('https://api.example/api');
  respond({ slots: [], highestCount: 0 });
  await api.matches('2030-01-07', 'America/Chicago', ['friend-id']);
  assert.deepEqual(JSON.parse(calls[0].options.body), { weekStart: '2030-01-07', timeZone: 'America/Chicago', friendIds: ['friend-id'] });
  respond({ id: 'event-id' }); await api.respondToEvent('event-id', false);
  assert.deepEqual(JSON.parse(calls[1].options.body), { response: 'DECLINED' });
});

test('proposed-event creation, availability, ranking and finalization use the Java API routes', async () => {
  const api = createEventSyncApi('https://api.example/api');
  const draft = { title: 'Meeting', windowStart: '2030-01-01T09:00:00Z', windowEnd: '2030-01-01T12:00:00Z', durationMinutes: 60, timeZone: 'UTC' };
  respond({ event: { id: 'poll-1' }, invitationCode: 'secret' });
  const created = await api.createPoll(draft);
  assert.equal(created.invitationCode, 'secret');
  assert.equal(calls[0].url, 'https://api.example/api/scheduling-events');
  assert.deepEqual(JSON.parse(calls[0].options.body), draft);
  const intervals = [{ start: draft.windowStart, end: draft.windowEnd }];
  respond({ id: 'poll-1' }); await api.submitPollAvailability('poll-1', intervals);
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].options.body), { slots: intervals });
  respond({ suggestions: [] }); await api.recommendPollTimes('poll-1');
  assert.equal(calls[2].url, 'https://api.example/api/scheduling-events/poll-1/recommendations');
  respond({ status: 'FINALIZED' }); await api.finalizePoll('poll-1', draft.windowStart);
  assert.deepEqual(JSON.parse(calls[3].options.body), { start: draft.windowStart });
});

test('group management, calendar overrides and weekly slots use expected routes', async () => {
  const api = createEventSyncApi('https://api.example/api');
  respond({ id: 'group-1' }); await api.createGroup('Study group');
  assert.equal(calls[0].url, 'https://api.example/api/groups');
  respond({}); await api.addGroupMember('group-1', 'user-2');
  assert.deepEqual(JSON.parse(calls[1].options.body), { userId: 'user-2' });
  respond([]); await api.weekSlots('2030-01-07', 'America/Chicago');
  assert.match(calls[2].url, /timeZone=America%2FChicago/);
  respond({ id: 'override-1' }); await api.addManualOverride('2030-01-07T09:00:00Z', '2030-01-07T10:00:00Z', 'BUSY');
  assert.deepEqual(JSON.parse(calls[3].options.body).status, 'BUSY');
});
