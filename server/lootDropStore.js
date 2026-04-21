'use strict';
/**
 * 🎁 Loot Drops — global "first-to-click" chip drops.
 *
 *  Server periodically spawns a loot drop (random amount, limited lifespan).
 *  All online clients see a floating chip (via socket event). First user to
 *  hit /api/loot/grab/:id wins the whole amount. Drop immediately closes.
 *
 *  Drops are stored in-memory only (ephemeral, <5 min lifespan each).
 *  Amount tiers: common / rare / epic / legendary (weighted RNG).
 */

const TIERS = [
  { tier: 'common',    min:   500, max:  2_000, weight: 55, emoji: '💰', ttl:  75 },
  { tier: 'rare',      min: 3_000, max: 10_000, weight: 30, emoji: '💎', ttl:  60 },
  { tier: 'epic',      min: 15_000, max: 50_000, weight: 12, emoji: '💥', ttl:  45 },
  { tier: 'legendary', min: 100_000, max: 500_000, weight: 3, emoji: '👑', ttl:  30 },
];

const TOTAL_WEIGHT = TIERS.reduce((s, t) => s + t.weight, 0);

let current = null;        // at most one active drop at a time
let history = [];          // recent settlements (for UI display)
const HISTORY_KEEP = 20;

function pickTier() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const t of TIERS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TIERS[0];
}

function randBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Spawn a new drop. Returns the drop object, or null if one is already active. */
function spawn() {
  if (current) return null;
  const t = pickTier();
  // Round to nearest 100 for cleaner display
  const rawAmount = randBetween(t.min, t.max);
  const amount = Math.round(rawAmount / 100) * 100;
  current = {
    id: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    amount,
    tier: t.tier,
    emoji: t.emoji,
    spawnedAt: Date.now(),
    expiresAt: Date.now() + t.ttl * 1000,
    ttl: t.ttl,
  };
  return current;
}

/** Claim the active drop. Returns {ok, amount, winner} or {ok: false, error}. */
function claim(username) {
  if (!current) return { ok: false, error: 'No active drop' };
  if (Date.now() > current.expiresAt) {
    // Expired — clear it and emit nothing
    const expired = current;
    current = null;
    history.unshift({ ...expired, winner: null, claimedAt: Date.now(), expired: true });
    if (history.length > HISTORY_KEEP) history.length = HISTORY_KEEP;
    return { ok: false, error: 'Drop expired' };
  }
  const won = { ...current, winner: username.toLowerCase(), claimedAt: Date.now() };
  current = null;
  history.unshift(won);
  if (history.length > HISTORY_KEEP) history.length = HISTORY_KEEP;
  return { ok: true, drop: won };
}

function getCurrent() { return current; }
function getHistory(n = 10) { return history.slice(0, Math.min(HISTORY_KEEP, Math.max(1, n))); }

/** Sweep any expired drop. Returns true if one was swept. */
function tick() {
  if (current && Date.now() > current.expiresAt) {
    const expired = current;
    current = null;
    history.unshift({ ...expired, winner: null, claimedAt: Date.now(), expired: true });
    if (history.length > HISTORY_KEEP) history.length = HISTORY_KEEP;
    return expired;
  }
  return null;
}

module.exports = { spawn, claim, getCurrent, getHistory, tick, TIERS };
