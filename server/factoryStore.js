'use strict';
/**
 * 🏭 Chip Factory — Idle/Tycoon passive income.
 *
 *  Users buy factories. Each factory produces chips per hour.
 *  Factories can be upgraded (level 1 → 10), each level boosts yield ×1.5.
 *  Collection accumulates up to 24h offline — collect anytime.
 *
 *  Data model:
 *    users[username] = {
 *      factories: { [factoryType]: { level, lastCollectAt } },
 *      totalCollected: number,
 *    }
 *
 *  Caller verifies + deducts purchase / upgrade costs.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'factories.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const MAX_LEVEL       = 10;
const MAX_COLLECT_HRS = 24;

const FACTORIES = {
  'slot-stand': {
    id: 'slot-stand', name: 'Slot Stand',  emoji: '🎰',
    description: 'Old-school one-armed bandits churning out coins.',
    baseCost:   10_000, baseYield: 400,   // chips per hour at lvl 1
    rarity: 'common',
  },
  'card-table': {
    id: 'card-table', name: 'Card Table', emoji: '🃏',
    description: 'Smoke-filled poker room with a steady rake.',
    baseCost:   35_000, baseYield: 1_400,
    rarity: 'uncommon',
  },
  'dice-den': {
    id: 'dice-den', name: 'Dice Den',    emoji: '🎲',
    description: 'Backroom craps hustle with reliable turnover.',
    baseCost:  100_000, baseYield: 4_000,
    rarity: 'rare',
  },
  'roulette-wheel': {
    id: 'roulette-wheel', name: 'Roulette Wheel', emoji: '🎡',
    description: 'Classic wheel, classic edge, classic profit.',
    baseCost:  300_000, baseYield: 12_000,
    rarity: 'epic',
  },
  'vip-lounge': {
    id: 'vip-lounge', name: 'VIP Lounge', emoji: '🥂',
    description: 'High rollers drop 6-figure bets here hourly.',
    baseCost: 1_000_000, baseYield: 42_000,
    rarity: 'legendary',
  },
};

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { users: {} }; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8'); } catch {}
}
let state = load();

function getUser(username) {
  const u = (username || '').toLowerCase();
  if (!state.users[u]) state.users[u] = { factories: {}, totalCollected: 0 };
  return state.users[u];
}

/* ── Pricing ───────────────────────────────────────────────────────────── */
// Level-up cost: base × (2 ^ (currentLevel)) — exponential scaling
function upgradeCost(factoryId, currentLevel) {
  const f = FACTORIES[factoryId];
  if (!f) return 0;
  if (currentLevel >= MAX_LEVEL) return 0;
  return Math.floor(f.baseCost * Math.pow(2, currentLevel));
}

/** Chips-per-hour for a factory at given level. */
function yieldPerHour(factoryId, level) {
  const f = FACTORIES[factoryId];
  if (!f) return 0;
  return Math.floor(f.baseYield * Math.pow(1.5, level - 1));
}

/** Accumulated uncollected chips for a single factory entry. */
function pendingFor(factoryId, entry) {
  if (!entry) return 0;
  const now = Date.now();
  const elapsedMs = now - (entry.lastCollectAt || now);
  const hours = Math.min(MAX_COLLECT_HRS, elapsedMs / 3_600_000);
  return Math.floor(yieldPerHour(factoryId, entry.level) * hours);
}

/* ── Public API ────────────────────────────────────────────────────────── */

function listFactories() {
  return Object.values(FACTORIES).map(f => ({
    ...f,
    nextLevelCost: f.baseCost,
    yieldLvl1: f.baseYield,
  }));
}

function getStatus(username) {
  const u = username ? getUser(username) : null;
  const owned = {};
  if (u) {
    for (const [id, entry] of Object.entries(u.factories)) {
      owned[id] = {
        level: entry.level,
        lastCollectAt: entry.lastCollectAt,
        yieldPerHour: yieldPerHour(id, entry.level),
        upgradeCost: upgradeCost(id, entry.level),
        pending: pendingFor(id, entry),
        atMax: entry.level >= MAX_LEVEL,
      };
    }
  }
  const totalYield = Object.entries(owned)
    .reduce((s, [, o]) => s + o.yieldPerHour, 0);
  const totalPending = Object.values(owned).reduce((s, o) => s + o.pending, 0);
  return {
    catalog: listFactories(),
    owned,
    totalYieldPerHour: totalYield,
    totalPending,
    totalCollected: u?.totalCollected || 0,
    maxCollectHours: MAX_COLLECT_HRS,
  };
}

/** Buy a new factory. Caller deducts baseCost. */
function buy(username, factoryId) {
  const f = FACTORIES[factoryId];
  if (!f) return { ok: false, error: 'Unknown factory' };
  const user = getUser(username);
  if (user.factories[factoryId]) return { ok: false, error: 'Already owned' };
  user.factories[factoryId] = { level: 1, lastCollectAt: Date.now() };
  save();
  return { ok: true, cost: f.baseCost, factory: f };
}

/** Upgrade a factory. Caller deducts the returned cost. */
function upgrade(username, factoryId) {
  const user = getUser(username);
  const entry = user.factories[factoryId];
  if (!entry) return { ok: false, error: 'Not owned' };
  if (entry.level >= MAX_LEVEL) return { ok: false, error: 'Already max level' };
  const cost = upgradeCost(factoryId, entry.level);
  // Auto-collect pending on upgrade so upgrade doesn't gift extra retroactive yield
  const pending = pendingFor(factoryId, entry);
  entry.level += 1;
  entry.lastCollectAt = Date.now();
  save();
  return { ok: true, cost, newLevel: entry.level, pending };
}

/** Collect all pending chips across all factories. Caller credits returned amount. */
function collect(username) {
  const user = getUser(username);
  let total = 0;
  for (const [id, entry] of Object.entries(user.factories)) {
    total += pendingFor(id, entry);
    entry.lastCollectAt = Date.now();
  }
  if (total > 0) user.totalCollected = (user.totalCollected || 0) + total;
  save();
  return { ok: true, amount: total };
}

module.exports = {
  FACTORIES, MAX_LEVEL,
  listFactories, getStatus, buy, upgrade, collect,
  upgradeCost, yieldPerHour,
};
