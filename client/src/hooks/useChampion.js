import { useState, useEffect } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// Simple module-level cache shared across all consumers
let _cache    = null;
let _cacheTs  = 0;
const TTL_MS  = 60 * 1000; // refresh at most once per minute

/**
 * Returns { champion, happyHourActive, happyHourEndsAt } from the server.
 * champion = { username, displayName, startedAt } or null.
 */
export function useChampion() {
  const [data, setData] = useState(_cache);

  useEffect(() => {
    const now = Date.now();
    if (_cache && now - _cacheTs < TTL_MS) {
      setData(_cache);
      return;
    }
    fetch(SERVER_URL + '/api/champion')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          _cache   = d;
          _cacheTs = Date.now();
          setData(d);
        }
      })
      .catch(() => {});
  }, []);

  return data || { champion: null, happyHourActive: false, happyHourEndsAt: null };
}

/** Invalidate the cache so next useChampion() re-fetches. */
export function invalidateChampionCache() {
  _cache   = null;
  _cacheTs = 0;
}
