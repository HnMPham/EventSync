#!/usr/bin/env python3
"""Verify durable EventSync state across actual app/database restarts.

Create phase:  python3 scripts/verify-persistence.py create
Restart phase: docker compose restart mysql; docker compose restart api
Verify phase:  python3 scripts/verify-persistence.py verify

Creates test accounts and a meeting; stores a private, gitignored checkpoint on disk.
No external Python packages are required.
"""
import json
import os
import pathlib
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.getenv('EVENTSYNC_TEST_URL', 'http://localhost:8080').rstrip('/')
STATE = pathlib.Path(os.getenv('EVENTSYNC_TEST_STATE', '.eventsync-persistence-check.json'))


def call(path, token=None, method='GET', payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {'Accept': 'application/json'}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(BASE + '/api' + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')
        raise RuntimeError(f'{method} {path}: HTTP {e.code}: {detail[:500]}') from e


def create():
    assert call('/health')['database'] == 'connected', 'MySQL is not connected'
    postfix = secrets.token_hex(7)
    def signup(label):
        return call('/auth/signup', method='POST', payload={
            'email': f'verification-{postfix}-{label}@example.invalid',
            'name': f'Persistence {label}', 'password': secrets.token_urlsafe(20), 'timeZone': 'UTC'
        })
    a, b = signup('organizer'), signup('participant')
    ta, tb = a['accessToken'], b['accessToken']
    group = call('/groups', ta, 'POST', {'name': 'Persistence smoke group ' + postfix})
    call(f'/groups/{group["id"]}/members', ta, 'POST', {'userId': b['user']['id']})
    t = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(days=2)
    start = t.isoformat().replace('+00:00', 'Z')
    end = (t + timedelta(hours=4)).isoformat().replace('+00:00', 'Z')
    created = call('/scheduling-events', ta, 'POST', {
        'title': 'Persistence smoke meeting ' + postfix, 'description': 'Testing MySQL persistence',
        'location': 'Online', 'windowStart': start, 'windowEnd': end, 'durationMinutes': 60,
        'timeZone': 'UTC', 'groupId': group['id'], 'inviteeIds': [b['user']['id']]
    })
    event_id = created['event']['id']
    slot = {'start': (t + timedelta(hours=1)).isoformat().replace('+00:00', 'Z'),
            'end': (t + timedelta(hours=3)).isoformat().replace('+00:00', 'Z')}
    for token in (ta, tb):
        call(f'/scheduling-events/{event_id}/availability', token, 'PUT', {'slots': [slot]})
    recommendations = call(f'/scheduling-events/{event_id}/recommendations', ta)
    assert max(x['availableCount'] for x in recommendations['suggestions']) == 2
    chosen = next(x for x in recommendations['suggestions'] if x['availableCount'] == 2)
    finalized = call(f'/scheduling-events/{event_id}/finalize', ta, 'POST', {'start': chosen['start']})
    assert finalized['status'] == 'FINALIZED'
    state = {'a': {'token': ta, 'id': a['user']['id']},
             'b': {'token': tb, 'id': b['user']['id']},
             'group': group['id'], 'event': event_id, 'start': chosen['start'],
             'created_at': datetime.now(timezone.utc).isoformat()}
    STATE.write_text(json.dumps(state, indent=2))
    os.chmod(STATE, 0o600)
    print(f'CREATED: group {group["id"]}, finalized meeting {event_id}.')
    print(f'Checkpoint saved to {STATE} (contains login tokens; keep it private).')


def verify():
    checkpoint = json.loads(STATE.read_text())
    assert call('/health')['database'] == 'connected'
    a, b = checkpoint['a'], checkpoint['b']
    assert call('/me', a['token'])['id'] == a['id'], 'Organizer session did not survive restart'
    assert call('/me', b['token'])['id'] == b['id'], 'Participant session did not survive restart'
    group_ids = {g['id'] for g in call('/groups', a['token'])}
    assert checkpoint['group'] in group_ids, 'Group disappeared after restart'
    member_ids = {m['user']['id'] for m in call('/groups/' + checkpoint['group'], a['token'])['members']}
    assert b['id'] in member_ids, 'Group member disappeared after restart'
    event = call('/scheduling-events/' + checkpoint['event'], a['token'])
    assert event['status'] == 'FINALIZED', 'Event state disappeared after restart'
    assert event['finalizedStart'] == checkpoint['start'], 'Finalized meeting time changed'
    assert len(event['participants']) == 1, 'Invitation disappeared after restart'
    assert len(call('/notifications', b['token'])) >= 1, 'Notification disappeared after restart'
    print('PASS: MySQL user accounts, login sessions, groups, membership, invitations,')
    print('      finalized event, meeting time, and notifications survived the restart.')


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in ('create', 'verify'):
        sys.exit('Usage: python3 scripts/verify-persistence.py [create|verify]')
    try:
        (create if sys.argv[1] == 'create' else verify)()
    except (AssertionError, OSError, RuntimeError) as exc:
        sys.exit('FAILED: ' + str(exc))
