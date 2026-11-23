/** Example React UI to copy into a Figma Make React export. Adjust styling to your design. */
import { useEffect, useState } from 'react';
import { createEventSyncApi, type OutlookStatus } from '../frontend/eventsync-api';

const api = createEventSyncApi(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api');

export function OutlookCalendarPanel({ onImported }: { onImported?: () => void }) {
  const [status, setStatus] = useState<OutlookStatus>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function reload() { setStatus(await api.outlookStatus()); }
  useEffect(() => { void (async () => {
    try {
      if (window.location.pathname === '/outlook/callback') {
        await api.finishOutlookConnection();
        window.history.replaceState({}, '', '/settings');
      }
      await reload();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not load Outlook connection'); }
  })(); }, []);
  async function sync() {
    setBusy(true); setMessage('');
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 14 * 86400000);
      const result = await api.syncDefaultOutlook(start.toISOString(), end.toISOString());
      setMessage(`Imported ${result.importedBusyIntervals} busy periods.`);
      await reload(); onImported?.();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Import failed'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Outlook calendar integration">
    <h2>Outlook Calendar</h2>
    <p>{status.connected ? 'Connected to Microsoft' : 'Not connected'}</p>
    {status.connected ? <>
      <button disabled={busy} onClick={() => void sync()}>Sync next 14 days</button>
      <button disabled={busy} onClick={() => void api.disconnectOutlook().then(reload)}>Disconnect</button>
    </> : <button onClick={() => void api.connectOutlook()}>Connect Outlook</button>}
    {status.lastSyncedAt && <p>Last synced: {new Date(status.lastSyncedAt).toLocaleString()}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
