'use strict';
/**
 * Flash Events — random site-wide bonus events that last 60-120 seconds.
 * Types:
 *   slots-boost      — slots payouts +50%
 *   roulette-boost   — roulette payouts +25%
 *   crash-boost      — crash max cash-out +20%
 *   mines-boost      — mines multiplier +30%
 *   dice-boost       — dice payout +25%
 *   xp-double        — all XP gains x2
 *   happy-hour       — 10% cashback on all losses
 *   lucky-spin       — free daily spin available
 *
 * Triggered randomly every 1-3 hours.
 */

const TYPES = {
  'slots-boost':    { emoji: '🎰', name: 'Slots Frenzy!',    desc: 'Slots payouts +50%',    color: '#ef4444', gameTag: 'slots',    multiplier: 1.5 },
  'roulette-boost': { emoji: '🎡', name: 'Roulette Rush!',   desc: 'Roulette wins +25%',    color: '#10b981', gameTag: 'roulette', multiplier: 1.25 },
  'crash-boost':    { emoji: '🚀', name: 'Crash Overdrive!', desc: 'Crash max cash-out +20%', color: '#f59e0b', gameTag: 'crash',    multiplier: 1.2 },
  'mines-boost':    { emoji: '💣', name: 'Mines Mayhem!',    desc: 'Mines multipliers +30%',  color: '#8b5cf6', gameTag: 'mines',    multiplier: 1.3 },
  'dice-boost':     { emoji: '🎲', name: 'Dice Storm!',      desc: 'Dice payouts +25%',       color: '#06b6d4', gameTag: 'dice',     multiplier: 1.25 },
  'xp-double':      { emoji: '⭐', name: 'Double XP!',        desc: 'All XP gains x2',         color: '#fbbf24', gameTag: '*',        multiplier: 2.0 },
  'happy-hour':     { emoji: '🍺', name: 'Happy Hour!',       desc: '10% cashback on losses',  color: '#ec4899', gameTag: '*',        multiplier: 1.1 },
  'lucky-spin':     { emoji: '🍀', name: 'Lucky Strike!',     desc: 'All games pay 15% more',  color: '#22c55e', gameTag: '*',        multiplier: 1.15 },
};

let current = null; // { id, type, startedAt, endsAt }
let lastEndedAt = Date.now();

function randomType() {
  const keys = Object.keys(TYPES);
  return keys[Math.floor(Math.random() * keys.length)];
}

function trigger(forcedType = null) {
  const type = forcedType && TYPES[forcedType] ? forcedType : randomType();
  const now = Date.now();
  const duration = 60_000 + Math.floor(Math.random() * 60_000); // 60-120s
  current = {
    id: `flash_${now}`,
    type,
    info: TYPES[type],
    startedAt: now,
    endsAt: now + duration,
  };
  return current;
}

function getCurrent() {
  if (current && Date.now() >= current.endsAt) {
    lastEndedAt = current.endsAt;
    current = null;
  }
  return current;
}

function tick() {
  // Called periodically; triggers random events.
  const active = getCurrent();
  if (active) return null;

  // Not active → decide whether to trigger. Rough goal: one every ~1-3 hours.
  // Check every 2 min → ~1.5% chance per check = ~once every ~2.2h on average.
  if (Math.random() < 0.015) {
    return trigger();
  }
  return null;
}

function getTypes() {
  return TYPES;
}

/** Get the boost multiplier for a given gameTag if any flash event matches. Returns 1.0 if none. */
function getBoostMultiplier(gameTag) {
  const active = getCurrent();
  if (!active) return 1.0;
  if (active.info.gameTag === '*' || active.info.gameTag === gameTag) {
    return active.info.multiplier;
  }
  return 1.0;
}

module.exports = { trigger, getCurrent, tick, getTypes, getBoostMultiplier };
