import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ApiError, type User } from '../lib/eventsync-api';

/** One source of truth for the logged-in user. Use the user returned by Java, not demo data. */
export function useEventSyncSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api.me());
      setError(null);
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401)) {
        setError(e instanceof Error ? e.message : 'Unable to load account');
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setUser(result.user);
    setError(null);
    return result.user;
  };
  const signup = async (name: string, email: string, password: string) => {
    const result = await api.signup(name, email, password);
    setUser(result.user);
    setError(null);
    return result.user;
  };
  const logout = async () => {
    try { await api.logout(); }
    finally { setUser(null); }
  };
  return { user, loading, error, refresh, login, signup, logout };
}
