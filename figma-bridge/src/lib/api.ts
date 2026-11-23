/** EventSync API singleton. Keep Microsoft secrets and database credentials on the backend. */
import { createEventSyncApi } from './eventsync-api';

// On the deployed site, React and Java share https://YOUR_DOMAIN and use /api.
// In a Figma Make preview, set VITE_EVENTSYNC_API_BASE_URL to an HTTPS server
// and add the preview's real origin to ALLOWED_ORIGINS on the server.
const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;
export const API_BASE_URL = env?.VITE_EVENTSYNC_API_BASE_URL?.trim() || '/api';
export const api = createEventSyncApi(API_BASE_URL);
