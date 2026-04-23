'use strict';
/**
 * Jokers — collectible items with passive abilities.
 *
 * - Each user owns a collection of unique Joker instances (each has its own id).
 * - Users can equip up to MAX_EQUIPPED Jokers; only equipped ones fire abilities.
 * - Jokers are pulled from the Joker Crate ($1M per open) with weighted rarity.
 * - Each Joker has a baseValue (floor) + marketValue (dynamic, updated by auctions).
 *
 * Abilities (applied via applyJokerBonuses in index.js payout paths):
 *   - payoutMultiplier:  adds to win payouts (e.g., 0.05 = +5%)
 *   - luckBoost:         adds to RNG favourable outcomes
 *   - cashbackPct:       refunds a % of losing bets
 *   - freeSpinsPerHour:  grants free daily-spin-style pulls
 *   - crateDiscountPct:  discount on paid cases
 *   - xpMultiplier:      multiplies XP earned from bets
 *   - jackpotChance:     flat chance per bet to double payout
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const INV_FILE = path.join(DATA_DIR, 'jokerInventory.json');

const MAX_EQUIPPED = 3;
const CRATE_PRICE  = 1_000_000;

// Rarity tiers (shared with cases conceptually, but simpler struct here)
const RARITY = {
  common:    { label: 'Common',    color: '#94a3b8', glow: 'rgba(148,163,184,0.45)' },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', glow: 'rgba(74,222,128,0.55)'  },
  rare:      { label: 'Rare',      color: '#60a5fa', glow: 'rgba(96,165,250,0.7)'   },
  epic:      { label: 'Epic',      color: '#c084fc', glow: 'rgba(192,132,252,0.8)'  },
  legendary: { label: 'Legendary', color: '#fbbf24', glow: 'rgba(251,191,36,0.95)'  },
  mythic:    { label: 'MYTHIC',    color: '#f472b6', glow: 'rgba(244,114,182,1)'    },
};

// Helper: J(id, name, emoji, rarity, weight, baseValue, abilities, desc)
const J = (id, name, emoji, rarity, weight, baseValue, abilities, description) =>
  ({ id, name, emoji, rarity, weight, baseValue, abilities, description });

// ── Joker catalog ─────────────────────────────────────────────────────────
const JOKERS = [
  // COMMON (cheap, small bonuses)
  J('lucky_clover',   'Lucky Clover',    '🍀', 'common', 30, 500_000,
    { luckBoost: 0.02 },
    '+2% luck on all games'),
  J('brass_coin',     'Brass Coin',      '🟫', 'common', 28, 400_000,
    { payoutMultiplier: 0.02 },
    '+2% to all payouts'),
  J('rabbit_foot',    'Rabbit Foot',     '🐇', 'common', 25, 600_000,
    { cashbackPct: 0.02 },
    '2% cashback on losses'),

  // UNCOMMON
  J('silver_joker',   'Silver Joker',    '🃏', 'uncommon', 15, 1_500_000,
    { payoutMultiplier: 0.04 },
    '+4% to all payouts'),
  J('horseshoe',      'Horseshoe',       '🧲', 'uncommon', 13, 1_400_000,
    { luckBoost: 0.05 },
    '+5% luck on all games'),
  J('xp_crystal',     'XP Crystal',      '💠', 'uncommon', 12, 1_200_000,
    { xpMultiplier: 0.25 },
    '+25% XP from every bet'),
  J('piggy_bank',     'Piggy Bank',      '🐷', 'uncommon', 11, 1_800_000,
    { cashbackPct: 0.05 },
    '5% cashback on losses'),

  // RARE
  J('golden_joker',   'Golden Joker',    '🤡', 'rare', 7, 4_000_000,
    { payoutMultiplier: 0.08 },
    '+8% to all payouts'),
  J('four_leaf',      'Four Leaf Clover','☘️', 'rare', 6, 4_200_000,
    { luckBoost: 0.10 },
    '+10% luck on all games'),
  J('crate_key',      'Crate Key',       '🗝️', 'rare', 6, 3_500_000,
    { crateDiscountPct: 0.15 },
    '15% off all paid cases'),
  J('magic_dice',     'Magic Dice',      '🎲', 'rare', 5, 4_500_000,
    { jackpotChance: 0.01 },
    '1% chance per bet to 2× payout'),

  // EPIC
  J('diamond_joker',  'Diamond Joker',   '💎', 'epic', 3, 12_000_000,
    { payoutMultiplier: 0.12, luckBoost: 0.05 },
    '+12% payouts, +5% luck'),
  J('cash_cannon',    'Cash Cannon',     '💸', 'epic', 2.5, 11_000_000,
    { cashbackPct: 0.10, payoutMultiplier: 0.03 },
    '10% cashback, +3% payouts'),
  J('crown_joker',    'Crown Joker',     '👑', 'epic', 2, 15_000_000,
    { xpMultiplier: 1.0, payoutMultiplier: 0.05 },
    '2× XP, +5% payouts'),

  // LEGENDARY
  J('phoenix',        'Phoenix',         '🔥', 'legendary', 0.8, 50_000_000,
    { payoutMultiplier: 0.20, cashbackPct: 0.05 },
    '+20% payouts, 5% cashback'),
  J('midas_touch',    'Midas Touch',     '🏆', 'legendary', 0.6, 60_000_000,
    { payoutMultiplier: 0.25, luckBoost: 0.10 },
    '+25% payouts, +10% luck'),
  J('rainbow_joker',  'Rainbow Joker',   '🌈', 'legendary', 0.5, 70_000_000,
    { payoutMultiplier: 0.15, luckBoost: 0.15, xpMultiplier: 0.5 },
    '+15% payouts, +15% luck, +50% XP'),

  // MYTHIC (extremely rare, game-breaking)
  J('god_hand',       'God Hand',        '🫴', 'mythic', 0.08, 250_000_000,
    { payoutMultiplier: 0.40, luckBoost: 0.20, cashbackPct: 0.10 },
    '+40% payouts, +20% luck, 10% cashback — broken tier'),
  J('infinity_joker', 'Infinity Joker',  '♾️', 'mythic', 0.04, 400_000_000,
    { payoutMultiplier: 0.50, luckBoost: 0.25, jackpotChance: 0.03 },
    '+50% payouts, +25% luck, 3% jackpot chance — legendary'),
  J('multiverse',     'Multiverse',      '🌌', 'mythic', 0.02, 666_000_000,
    { payoutMultiplier: 0.75, luckBoost: 0.30, cashbackPct: 0.15, xpMultiplier: 2.0, jackpotChance: 0.05 },
    'All bonuses maxed — the rarest card in existence'),

  // ── NEW COMMON ─────────────────────────────────────────────────────────
  J('penny_jar',      'Penny Jar',       '🏺', 'common', 24, 450_000,
    { cashbackPct: 0.015 },
    '1.5% cashback on losses'),
  J('wild_card',      'Wild Card',       '🎴', 'common', 22, 500_000,
    { luckBoost: 0.015, payoutMultiplier: 0.01 },
    '+1.5% luck, +1% payouts'),

  // ── NEW UNCOMMON ───────────────────────────────────────────────────────
  J('fortune_cookie', 'Fortune Cookie',  '🥠', 'uncommon', 12, 1_600_000,
    { luckBoost: 0.04, jackpotChance: 0.005 },
    '+4% luck, 0.5% jackpot chance'),
  J('tipped_scale',   'Tipped Scale',    '⚖️', 'uncommon', 10, 2_000_000,
    { payoutMultiplier: 0.05 },
    '+5% to all payouts'),

  // ── NEW RARE ───────────────────────────────────────────────────────────
  J('moneybags',      'Moneybags',       '💰', 'rare', 5, 5_000_000,
    { payoutMultiplier: 0.06, cashbackPct: 0.04 },
    '+6% payouts, 4% cashback'),
  J('gambler_hat',    'Gambler\u2019s Hat',   '🎩', 'rare', 4, 6_000_000,
    { jackpotChance: 0.02, luckBoost: 0.03 },
    '2% jackpot chance, +3% luck'),

  // ── NEW EPIC ───────────────────────────────────────────────────────────
  J('jester_hat',     'Jester\u2019s Hat',    '🃏', 'epic', 2, 18_000_000,
    { luckBoost: 0.12, jackpotChance: 0.015, payoutMultiplier: 0.04 },
    '+12% luck, 1.5% jackpot, +4% payouts'),

  // ── NEW LEGENDARY ──────────────────────────────────────────────────────
  J('dragon_coin',    'Dragon Coin',     '🐉', 'legendary', 0.4, 85_000_000,
    { payoutMultiplier: 0.30, cashbackPct: 0.08, xpMultiplier: 0.5 },
    '+30% payouts, 8% cashback, +50% XP'),

  // ── NEW MYTHIC (EVENT-TIER) ────────────────────────────────────────────
  J('black_diamond',  'Black Diamond',   '◆',  'mythic', 0.05, 300_000_000,
    { payoutMultiplier: 0.50, cashbackPct: 0.15 },
    '+50% payouts, 15% cashback — limited edition'),
];

const JOKER_MAP = Object.fromEntries(JOKERS.map(j => [j.id, j]));

// ── Persistence ───────────────────────────────────────────────────────────
// Structure: { byUser: { username: { owned: [{ instanceId, jokerId, acquiredAt }], equipped: [instanceId, ...] } } }
let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(INV_FILE, 'utf8')); }
  catch { _cache = { byUser: {} }; }
  if (!_cache.byUser) _cache.byUser = {};
  return _cache;
}
function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INV_FILE, JSON.stringify(_cache));
}

function ensureUser(username) {
  const data = load();
  if (!data.byUser[username]) {
    data.byUser[username] = { owned: [], equipped: [] };
  }
  return data.byUser[username];
}

function genInstanceId() {
  return 'jk_' + crypto.randomBytes(8).toString('hex');
}

// ── Public getters ────────────────────────────────────────────────────────
function listCatalog() { return JOKERS; }
function getCatalog() { return JOKERS.map(j => ({
  id: j.id, name: j.name, emoji: j.emoji, rarity: j.rarity,
  baseValue: j.baseValue, abilities: j.abilities, description: j.description,
  odds: j.weight / JOKERS.reduce((s, x) => s + x.weight, 0),
})); }
function getRarities() { return RARITY; }
function getCratePrice() { return CRATE_PRICE; }
function getMaxEquipped() { return MAX_EQUIPPED; }

function getJokerDef(jokerId) { return JOKER_MAP[jokerId] || null; }

function getInventory(username) {
  const u = ensureUser(username);
  return {
    owned: u.owned.map(inst => ({
      instanceId: inst.instanceId,
      jokerId: inst.jokerId,
      acquiredAt: inst.acquiredAt,
      def: JOKER_MAP[inst.jokerId] || null,
    })).filter(i => i.def), // drop orphans
    equipped: u.equipped.filter(id => u.owned.some(o => o.instanceId === id)),
  };
}

// ── Crate pull ────────────────────────────────────────────────────────────
function pickWeighted(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  const rand = (crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff) * total;
  let acc = 0;
  for (const it of items) {
    acc += it.weight;
    if (rand < acc) return it;
  }
  return items[items.length - 1];
}

function openCrate(username) {
  const joker = pickWeighted(JOKERS);
  const instanceId = genInstanceId();
  const u = ensureUser(username);
  u.owned.push({ instanceId, jokerId: joker.id, acquiredAt: Date.now() });
  save();
  return {
    ok: true,
    instanceId,
    joker: {
      id: joker.id, name: joker.name, emoji: joker.emoji, rarity: joker.rarity,
      baseValue: joker.baseValue, abilities: joker.abilities, description: joker.description,
    },
  };
}

// ── Equip / unequip ────────────────────────────────────────────────────────
function equip(username, instanceId) {
  const u = ensureUser(username);
  if (!u.owned.some(o => o.instanceId === instanceId)) return { ok: false, error: 'You do not own that joker' };
  if (u.equipped.includes(instanceId)) return { ok: false, error: 'Already equipped' };
  if (u.equipped.length >= MAX_EQUIPPED) return { ok: false, error: `Already equipped max ${MAX_EQUIPPED} jokers` };
  u.equipped.push(instanceId);
  save();
  return { ok: true };
}

function unequip(username, instanceId) {
  const u = ensureUser(username);
  u.equipped = u.equipped.filter(id => id !== instanceId);
  save();
  return { ok: true };
}

// ── Transfer (used by auction house + trading) ────────────────────────────
function transferInstance(fromUser, toUser, instanceId) {
  const data = load();
  const from = ensureUser(fromUser);
  const idx = from.owned.findIndex(o => o.instanceId === instanceId);
  if (idx === -1) return { ok: false, error: 'Instance not owned' };
  const inst = from.owned[idx];
  // Remove from sender, also unequip if equipped
  from.owned.splice(idx, 1);
  from.equipped = from.equipped.filter(id => id !== instanceId);
  // Add to receiver
  const to = ensureUser(toUser);
  to.owned.push(inst);
  save();
  return { ok: true, joker: JOKER_MAP[inst.jokerId] };
}

// Remove an instance (used when listing on auction — held in escrow by auctionStore)
function removeInstance(username, instanceId) {
  const u = ensureUser(username);
  const idx = u.owned.findIndex(o => o.instanceId === instanceId);
  if (idx === -1) return { ok: false, error: 'Instance not owned' };
  const inst = u.owned[idx];
  u.owned.splice(idx, 1);
  u.equipped = u.equipped.filter(id => id !== instanceId);
  save();
  return { ok: true, instance: inst };
}

// Add an instance directly (used when auction returns unsold or buyer receives)
function addInstance(username, instance) {
  const u = ensureUser(username);
  u.owned.push(instance);
  save();
  return { ok: true };
}

function ownsInstance(username, instanceId) {
  const u = ensureUser(username);
  return u.owned.some(o => o.instanceId === instanceId);
}

// ── Aggregate equipped abilities ──────────────────────────────────────────
function getEquippedAbilities(username) {
  const inv = getInventory(username);
  const agg = {
    payoutMultiplier: 0,
    luckBoost: 0,
    cashbackPct: 0,
    xpMultiplier: 0,
    crateDiscountPct: 0,
    jackpotChance: 0,
  };
  for (const instId of inv.equipped) {
    const owned = inv.owned.find(o => o.instanceId === instId);
    if (!owned || !owned.def) continue;
    const a = owned.def.abilities || {};
    for (const key of Object.keys(agg)) {
      if (typeof a[key] === 'number') agg[key] += a[key];
    }
  }
  return agg;
}

// ── Leaderboard: aggregate every user's collection value ─────────────────
// Accepts a (jokerId, baseValue) -> marketValue resolver from caller so we
// don't have to import auctionStore here (avoids circular deps).
function getCollectionLeaderboard(marketResolver, limit = 50) {
  const data = load();
  const rows = [];
  for (const [username, u] of Object.entries(data.byUser)) {
    if (!u.owned || u.owned.length === 0) continue;
    let total = 0;
    let rarest = 'common';
    const rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
    const rarityBreakdown = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    for (const inst of u.owned) {
      const def = JOKER_MAP[inst.jokerId];
      if (!def) continue;
      const mv = typeof marketResolver === 'function'
        ? marketResolver(def.id, def.baseValue)
        : def.baseValue;
      total += mv;
      rarityBreakdown[def.rarity] = (rarityBreakdown[def.rarity] || 0) + 1;
      if (rarityOrder[def.rarity] > rarityOrder[rarest]) rarest = def.rarity;
    }
    rows.push({
      username,
      totalValue: total,
      jokerCount: u.owned.length,
      equippedCount: (u.equipped || []).length,
      rarest,
      rarityBreakdown,
    });
  }
  rows.sort((a, b) => b.totalValue - a.totalValue);
  return rows.slice(0, limit);
}

module.exports = {
  JOKERS,
  RARITY,
  CRATE_PRICE,
  MAX_EQUIPPED,
  getCatalog,
  getRarities,
  getCratePrice,
  getMaxEquipped,
  getJokerDef,
  getInventory,
  openCrate,
  equip,
  unequip,
  transferInstance,
  removeInstance,
  addInstance,
  ownsInstance,
  getEquippedAbilities,
  getCollectionLeaderboard,
};
