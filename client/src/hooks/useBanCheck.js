import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

/**
 * Checks if the current user is banned from a specific game.
 * Returns { banned, reason, expiresAt, loading }
 * - banned: true if user is banned from this game
 * - reason: ban reason string (may be empty)
 * - expiresAt: timestamp (ms) when ban expires, or null for permanent
 * - loading: true while the check is in flight
 *
 * Only fires when the user is logged in (token present).
 * If not logged in, returns { banned: false, loading: false }.
 */
export default function useBanCheck(gameSlug) {
  const { token } = useAuth();
  const [state, setState] = useState({ banned: false, reason: '', expiresAt: null, loading: true });

  useEffect(() => {
    if (!token) {
      setState({ banned: false, reason: '', expiresAt: null, loading: false });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true }));

    fetch(`${SERVER_URL}/api/ban-check?game=${encodeURIComponent(gameSlug)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.banned) {
          setState({ banned: true, reason: data.reason || '', expiresAt: data.expiresAt || null, loading: false });
        } else {
          setState({ banned: false, reason: '', expiresAt: null, loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ banned: false, reason: '', expiresAt: null, loading: false });
      });

    return () => { cancelled = true; };
  }, [token, gameSlug]);

  return state;
}
