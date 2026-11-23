import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Microsoft redirects to Java at /api/outlook/callback, then Java redirects here.
// Share a single promise across React StrictMode effect re-runs to avoid double completion.
let inFlight: Promise<boolean> | null = null;
function finishOnce(): Promise<boolean> {
  if (!inFlight) {
    inFlight = api.finishOutlookConnection().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Render this when window.location.pathname === '/outlook/callback'. */
export function OutlookCallback() {
  const [message, setMessage] = useState('Connecting your Outlook calendar…');
  useEffect(() => {
    let active = true;
    finishOnce().then(connected => {
      if (active) setMessage(connected ? 'Outlook connected. You can return to EventSync.' : 'Connection cancelled.');
    }).catch(error => {
      if (active) setMessage(error instanceof Error ? error.message : 'Outlook connection failed');
    });
    return () => { active = false; };
  }, []);
  return <main style={{maxWidth: 520, margin: '5rem auto', padding: '1.5rem'}}>
    <h1>Microsoft Outlook</h1><p role="status">{message}</p><a href="/">Return to EventSync</a>
  </main>;
}
