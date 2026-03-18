import { useState, useEffect } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// Per-slug cache so switching games doesn't re-fetch unnecessarily
const boostCache = {};
const boostCacheExpiry = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Returns the current payout boost multiplier for a casino game.
 * Boost is set by admins and combines per-game override + wildcard daily boost.
 * Returns 1.0 if no boost is set (no change to payouts).
 */
export function useGameBoost(slug) {
  const [boost, setBoost] = useState(() => boostCache[slug] ?? 1.0);

  useEffect(() => {
    if (!slug) return;
    if (boostCache[slug] && Date.now() < (boostCacheExpiry[slug] || 0)) {
      setBoost(boostCache[slug]);
      return;
    }
    fetch(`${SERVER_URL}/api/game-config/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const val = typeof d.boost === 'number' ? d.boost : 1.0;
          boostCache[slug] = val;
          boostCacheExpiry[slug] = Date.now() + CACHE_TTL;
          setBoost(val);
        }
      })
      .catch(() => {});
  }, [slug]);

  return boost;
}
