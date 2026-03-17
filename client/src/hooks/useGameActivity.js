import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const HEARTBEAT_MS = 30_000; // report every 30 seconds to keep activity alive

/**
 * Reports the current game the user is playing to the server.
 * Admin can then see live activity per-user.
 * - Sends { gameSlug } on mount + every 30s heartbeat
 * - Sends { gameSlug: null } on unmount (player left the game)
 * Only fires when the user is logged in.
 */
export default function useGameActivity(gameSlug) {
  const { token } = useAuth();

  useEffect(() => {
    if (!token || !gameSlug) return;

    function report(slug) {
      fetch(`${SERVER_URL}/api/accounts/activity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ gameSlug: slug }),
      }).catch(() => {});
    }

    report(gameSlug); // announce on mount
    const interval = setInterval(() => report(gameSlug), HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      report(null); // clear activity on unmount
    };
  }, [token, gameSlug]);
}
