'use strict';
/**
 * Case Opening — CSGO-style unboxing.
 *
 * Each case has a weighted pool of items. Opening deducts the case price from
 * the user's balance (atomically via userStore) and returns a randomly picked
 * item whose $ value is credited back. Items have rarities that drive the UI
 * celebration tier (common → mythic).
 *
 * Free daily "Welcome Case" every 10 minutes (synced with hourly reward) to
 * pull players back.
 *
 * Recent opens are tracked in memory (capped) and broadcast over the Socket.IO
 * "caseOpen" event so every connected client sees the live feed.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FREE_FILE = path.join(DATA_DIR, 'caseFreeClaims.json');
const FREE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between free-case claims

// ── Rarity tiers ──────────────────────────────────────────────────────────
const RARITY = {
  common:    { label: 'Common',    color: '#94a3b8', glow: 'rgba(148,163,184,0.4)' },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', glow: 'rgba(74,222,128,0.5)'  },
  rare:      { label: 'Rare',      color: '#60a5fa', glow: 'rgba(96,165,250,0.6)'  },
  epic:      { label: 'Epic',      color: '#c084fc', glow: 'rgba(192,132,252,0.7)' },
  legendary: { label: 'Legendary', color: '#fbbf24', glow: 'rgba(251,191,36,0.9)'  },
  mythic:    { label: 'MYTHIC',    color: '#f472b6', glow: 'rgba(244,114,182,1)'   },
};

// Item helper: { emoji, name, value, rarity, weight }
const I = (emoji, name, value, rarity, weight) => ({ emoji, name, value, rarity, weight });

// ── Case definitions ──────────────────────────────────────────────────────
// Weights control drop rate within a case. Each case is a weighted random pick.
// Designed for slight negative EV overall (house edge ~5-10% depending on case).
const CASES = [
  {
    id: 'welcome',
    name: 'Welcome Case',
    emoji: '🎁',
    price: 0, // free once per hour
    subtitle: 'Free every hour — taste the hype',
    color: '#4ade80',
    bg: 'linear-gradient(135deg, #052e16 0%, #166534 100%)',
    freeOnly: true,
    items: [
      I('💵',  '$100 Bill',      100,      'common',    40),
      I('💰',  'Bag of Coins',   250,      'common',    30),
      I('🪙',  'Gold Coin',      500,      'uncommon',  18),
      I('💎',  'Small Gem',      1_500,    'uncommon',  8),
      I('💍',  'Silver Ring',    5_000,    'rare',      3),
      I('👑',  'Tiny Crown',     25_000,   'epic',      0.9),
      I('🏆',  'Welcome Trophy', 100_000,  'legendary', 0.1),
    ],
  },
  {
    id: 'starter',
    name: 'Starter Case',
    emoji: '📦',
    price: 250,
    subtitle: 'Low stakes, steady drops',
    color: '#60a5fa',
    bg: 'linear-gradient(135deg, #0c1222 0%, #1e3a8a 100%)',
    items: [
      I('🪙',  'Bronze Coin',     50,       'common',    50),
      I('💵',  'Cash Wad',        150,      'common',    25),
      I('🎫',  'Scratch Ticket',  350,      'uncommon',  15),
      I('💎',  'Tiny Ruby',       800,      'uncommon',  6),
      I('💍',  'Silver Band',     2_500,    'rare',      3),
      I('👑',  'Jester Crown',    12_500,   'epic',      0.9),
      I('🌟',  'Lucky Star',      75_000,   'legendary', 0.1),
    ],
  },
  {
    id: 'vegas',
    name: 'Vegas Case',
    emoji: '🎰',
    price: 2_500,
    subtitle: 'Bright lights, bigger drops',
    color: '#f472b6',
    bg: 'linear-gradient(135deg, #4c0519 0%, #be185d 100%)',
    items: [
      I('🎰',  'Slot Token',       800,      'common',    45),
      I('🃏',  'Lucky Card',       1_800,    'common',    22),
      I('♠️',  'Ace of Spades',    4_500,    'uncommon',  15),
      I('💎',  'Vegas Diamond',    12_000,   'uncommon',  10),
      I('👑',  'High Roller Crown',40_000,   'rare',      5),
      I('💰',  'Cash Briefcase',   150_000,  'epic',      2.5),
      I('🎲',  'Dice of Destiny',  500_000,  'legendary', 0.45),
      I('🏛️',  'The Vault',        2_000_000,'mythic',    0.05),
    ],
  },
  {
    id: 'crypto',
    name: 'Crypto Case',
    emoji: '₿',
    price: 15_000,
    subtitle: 'Rug pulls & rockets',
    color: '#fbbf24',
    bg: 'linear-gradient(135deg, #451a03 0%, #ea580c 100%)',
    items: [
      I('📉',  'Rug Pull',         3_000,    'common',    40),
      I('🪙',  'Altcoin Bag',      8_000,    'common',    25),
      I('💸',  'Memecoin Win',     25_000,   'uncommon',  18),
      I('🟠',  'Bitcoin Shard',    80_000,   'uncommon',  10),
      I('💎',  'Diamond Hands',    250_000,  'rare',      5),
      I('🚀',  'To The Moon',      1_200_000,'epic',      1.8),
      I('₿',   'Satoshi Wallet',   5_000_000,'legendary', 0.18),
      I('👨‍🚀','Galactic Rug',     20_000_000,'mythic',   0.02),
    ],
  },
  {
    id: 'whale',
    name: 'Whale Case',
    emoji: '🐋',
    price: 100_000,
    subtitle: 'Only for the reckless',
    color: '#c084fc',
    bg: 'linear-gradient(135deg, #1e1b4b 0%, #7c3aed 100%)',
    items: [
      I('🐟',  'Small Fry',         20_000,    'common',    45),
      I('🐠',  'Reef Fish',         60_000,    'common',    22),
      I('🦈',  'Shark Fin',         180_000,   'uncommon',  17),
      I('🐙',  'Kraken Ink',        500_000,   'uncommon',  9),
      I('🐋',  'Whale Breach',      1_500_000, 'rare',      5),
      I('🌊',  'Tsunami',           7_500_000, 'epic',      1.8),
      I('🌀',  'Abyssal Vortex',    30_000_000,'legendary', 0.19),
      I('👁️',  'Leviathan Awakens', 150_000_000,'mythic',   0.01),
    ],
  },
];

// Quick-access map
const CASE_MAP = Object.fromEntries(CASES.map(c => [c.id, c]));

// ── Recent opens feed (in-memory, capped) ─────────────────────────────────
const MAX_RECENT = 40;
const recentOpens = []; // [{ username, caseId, item, at }]

function pushRecent(entry) {
  recentOpens.unshift(entry);
  if (recentOpens.length > MAX_RECENT) recentOpens.length = MAX_RECENT;
}

// ── Free-case claim tracking ──────────────────────────────────────────────
let _freeCache = null;
function readFree() {
  if (_freeCache) return _freeCache;
  try { _freeCache = JSON.parse(fs.readFileSync(FREE_FILE, 'utf8')); }
  catch { _freeCache = {}; }
  return _freeCache;
}
function writeFree(data) {
  _freeCache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FREE_FILE, JSON.stringify(data));
}

function msUntilFree(username) {
  const data = readFree();
  const last = data[username] || 0;
  return Math.max(0, last + FREE_COOLDOWN_MS - Date.now());
}

// ── Weighted random pick ──────────────────────────────────────────────────
function pickItem(items) {
  const totalWeight = items.reduce((s, it) => s + it.weight, 0);
  // Crypto-secure random float in [0, totalWeight)
  const rand = (crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff) * totalWeight;
  let acc = 0;
  for (const it of items) {
    acc += it.weight;
    if (rand < acc) return it;
  }
  return items[items.length - 1]; // fallback (shouldn't hit)
}

// ── Odds display (computed from weights) ──────────────────────────────────
function casePublicInfo(c) {
  const totalWeight = c.items.reduce((s, it) => s + it.weight, 0);
  return {
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    price: c.price,
    subtitle: c.subtitle,
    color: c.color,
    bg: c.bg,
    freeOnly: !!c.freeOnly,
    items: c.items.map(it => ({
      emoji: it.emoji,
      name: it.name,
      value: it.value,
      rarity: it.rarity,
      odds: (it.weight / totalWeight), // 0..1
    })).sort((a, b) => b.value - a.value),
  };
}

function getAllCases() {
  return CASES.map(casePublicInfo);
}

function getRarities() {
  return RARITY;
}

function getRecentOpens() {
  return recentOpens;
}

/**
 * Run the RNG + bookkeeping for a case open. Callers (index.js) handle
 * balance deduction + credit via userStore — this function is pure logic.
 * Returns { ok, caseId, item, reel } where reel is an array of items to
 * render in the spinning animation (with the winning item at index 50).
 */
function openCase(username, caseId, opts = {}) {
  const c = CASE_MAP[caseId];
  if (!c) return { ok: false, error: 'Unknown case' };
  if (c.freeOnly && !opts.free) return { ok: false, error: 'This case can only be opened as a free claim' };

  const item = pickItem(c.items);

  // Build a 60-item reel for the animation. Random items fill the reel;
  // the winning item is placed at index 50 (where the cursor lands).
  const reel = [];
  for (let i = 0; i < 60; i++) {
    if (i === 50) reel.push(item);
    else          reel.push(pickItem(c.items));
  }

  const entry = {
    username,
    caseId: c.id,
    caseName: c.name,
    item: { emoji: item.emoji, name: item.name, value: item.value, rarity: item.rarity },
    at: Date.now(),
  };
  pushRecent(entry);

  return { ok: true, caseId: c.id, item: entry.item, reel, entry };
}

/** Mark a free-case claim as used (call only after RNG succeeded). */
function recordFreeClaim(username) {
  const data = readFree();
  data[username] = Date.now();
  writeFree(data);
}

module.exports = {
  CASES,
  RARITY,
  getAllCases,
  getRarities,
  getRecentOpens,
  openCase,
  msUntilFree,
  recordFreeClaim,
  casePublicInfo,
};
