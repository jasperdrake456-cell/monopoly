'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'gameOdds.json');

// Known casino game slugs
const CASINO_SLUGS = [
  'crash','plinko','dice','roulette','blackjack','baccarat',
  'mines','ride-the-bus','slots','chicken-cross','hilo','tower',
  'wheel','video-poker','keno','dragon-tiger',
];

/**
 * Catalog of probabilistic events that admins can rig per-game.
 * Each entry has:
 *   - key:        string used in the API + storage
 *   - label:      display name in admin UI
 *   - hint:       what the multiplier scales (described from house's view)
 *   - default:    the natural baseline probability (informational only)
 *
 * The admin tunes a MULTIPLIER (1.0 = default natural odds). The client
 * applies it to the natural rate when running RNG. >1.0 = event happens
 * more often, <1.0 = less often.
 */
const EVENT_CATALOG = {
  slots: [
    { key: 'jackpot',         label: 'Jackpot (7️⃣7️⃣7️⃣) chance',  hint: 'multiplier on natural rate (~0.07%)', default: 0.0007 },
    { key: 'diamond-jackpot', label: 'Diamond (💎💎💎) chance',     hint: 'multiplier on natural rate (~0.015%)', default: 0.00015 },
    { key: 'force-loss',      label: 'Force loss (any spin)',         hint: '0.0 = off; 0.5 = half of all spins forced losers', default: 0 },
  ],
  mines: [
    { key: 'mine-rate',  label: 'Mine count multiplier',  hint: '×N applied to declared mine count for placement (player still sees declared count). 2.0 = double mines secretly.', default: 1.0 },
    { key: 'force-loss', label: 'Force loss (per round)', hint: '0.0 = off; 0.5 = half of rounds force first click to be a mine', default: 0 },
  ],
  crash: [
    { key: 'instant-crash', label: 'Instant-crash chance',      hint: 'multiplier on the natural 15% rate', default: 0.15 },
    { key: 'house-edge',    label: 'House-edge multiplier',     hint: 'multiplier on the 15% house edge (changes the formula constant)', default: 0.15 },
  ],
  plinko: [
    { key: 'edge-bias',  label: 'Edge-bias',     hint: '0.0 = neutral; 0.5 = 50% bias toward center (low payout)', default: 0 },
  ],
  dice: [
    { key: 'force-loss', label: 'Force loss (per roll)', hint: '0.0 = off; 0.5 = half of rolls forced losers', default: 0 },
  ],
  'chicken-cross': [
    { key: 'force-loss', label: 'Force loss (per click)', hint: '0.0 = off; X = X% chance any clicked tile is a car', default: 0 },
  ],
  tower: [
    { key: 'force-loss', label: 'Force loss (per click)', hint: '0.0 = off; X = X% chance any climb step is a bomb', default: 0 },
  ],
  wheel: [
    { key: 'force-loss', label: 'Force loss', hint: '0.0 = off; X = X% chance the wheel lands on the lowest segment', default: 0 },
  ],
  hilo: [
    { key: 'force-loss', label: 'Force loss', hint: '0.0 = off; X = X% chance the next card forces a loss', default: 0 },
  ],
};

let _cache = null;
function read() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = { overrides: {}, wildcardOverride: null, wildcardBoost: 1.5 }; }
  return _cache;
}
function write(data) {
  _cache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data));
}

// Returns "YYYY-MM-DD" in server local time
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Deterministic daily wildcard — picks based on date unless admin/champion overrides
// Champion overrides are auto-expired at midnight (wildcardOverrideDate must match today)
function getDailyWildcard() {
  const data = read();
  // Admin overrides are permanent; champion GOTD overrides expire at midnight
  if (data.wildcardOverride) {
    if (data.wildcardOverridePermanent || data.wildcardOverrideDate === todayStr()) {
      return data.wildcardOverride;
    }
  }
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return CASINO_SLUGS[seed % CASINO_SLUGS.length];
}

function getWildcardBoost() { return read().wildcardBoost ?? 1.5; }

function getGameBoost(slug) {
  const data = read();
  const wildcard = getDailyWildcard();
  const wildcardBoost = data.wildcardBoost ?? 1.5;
  const adminBoost = data.overrides?.[slug] ?? 1.0;
  // If it's the wildcard, apply wildcard boost on top of admin boost
  return slug === wildcard ? adminBoost * wildcardBoost : adminBoost;
}

function setGameBoost(slug, multiplier) {
  const data = read();
  if (!data.overrides) data.overrides = {};
  data.overrides[slug] = Math.max(0.1, Math.min(5.0, Number(multiplier)));
  write(data);
  return { ok: true };
}

function resetGameBoost(slug) {
  const data = read();
  if (data.overrides) delete data.overrides[slug];
  write(data);
  return { ok: true };
}

// permanent = true for admin overrides (never auto-expires); false for champion GOTD (expires at midnight)
function setWildcardOverride(slug, permanent = false) {
  const data = read();
  data.wildcardOverride = slug || null;
  data.wildcardOverridePermanent = slug ? permanent : false;
  data.wildcardOverrideDate = (slug && !permanent) ? todayStr() : null;
  write(data);
  return { ok: true };
}

function setWildcardBoost(multiplier) {
  const data = read();
  data.wildcardBoost = Math.max(1.0, Math.min(5.0, Number(multiplier)));
  write(data);
  return { ok: true };
}

function getAllBoosts() {
  const data = read();
  return { overrides: data.overrides || {}, wildcardOverride: data.wildcardOverride, wildcardBoost: data.wildcardBoost ?? 1.5, wildcard: getDailyWildcard() };
}

// ── Per-game probabilistic event odds ─────────────────────────────────────────

function getEventOdds(slug, eventKey) {
  const data = read();
  return data.eventOdds?.[slug]?.[eventKey];
}

/** Returns the merged event odds map for a given game (defaults + overrides). */
function getEventOddsForGame(slug) {
  const data = read();
  const overrides = data.eventOdds?.[slug] || {};
  const catalog   = EVENT_CATALOG[slug] || [];
  const merged    = {};
  for (const entry of catalog) {
    merged[entry.key] = (overrides[entry.key] !== undefined)
      ? overrides[entry.key]
      : null; // null means "use the game's hardcoded baseline"
  }
  return merged;
}

function setEventOdds(slug, eventKey, value) {
  const data = read();
  if (!data.eventOdds) data.eventOdds = {};
  if (!data.eventOdds[slug]) data.eventOdds[slug] = {};
  // Sanitize: clamp to [0, 25]
  const clean = Math.max(0, Math.min(25, Number(value)));
  if (!Number.isFinite(clean)) return { ok: false, error: 'invalid value' };
  data.eventOdds[slug][eventKey] = clean;
  write(data);
  return { ok: true };
}

function resetEventOdds(slug, eventKey) {
  const data = read();
  if (data.eventOdds?.[slug]) {
    delete data.eventOdds[slug][eventKey];
    if (Object.keys(data.eventOdds[slug]).length === 0) delete data.eventOdds[slug];
  }
  write(data);
  return { ok: true };
}

function getAllEventOdds() {
  const data = read();
  return { catalog: EVENT_CATALOG, overrides: data.eventOdds || {} };
}

module.exports = {
  getDailyWildcard, getWildcardBoost, getGameBoost, setGameBoost, resetGameBoost,
  setWildcardOverride, setWildcardBoost, getAllBoosts,
  getEventOdds, getEventOddsForGame, setEventOdds, resetEventOdds, getAllEventOdds,
  EVENT_CATALOG, CASINO_SLUGS,
};
