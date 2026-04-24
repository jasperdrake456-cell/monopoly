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
 *   - freeBetChance:     flat chance any bet is refunded (free roll)
 *   - flatWinBonus:      flat $ added to every win
 *   - lossRefundChance:  chance to fully refund a losing bet
 *   - winStreakBonus:    +% bonus per consecutive win (resets on loss)
 *   - lossStreakShield:  every 5th consecutive loss is refunded (enable if > 0)
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

  // ═══════════════════════════════════════════════════════════════════════
  //  ABILITY-EXPANSION PACK
  //  Jokers that use the new ability types (freeBetChance, flatWinBonus,
  //  lossRefundChance, winStreakBonus, lossStreakShield). These do things
  //  the original catalog couldn't — free rolls, flat cash per win, loss
  //  insurance, streak snowballing.
  // ═══════════════════════════════════════════════════════════════════════

  // COMMON — small, fun, frequent
  J('tip_jar',        'Tip Jar',         '🫙', 'common', 26, 450_000,
    { flatWinBonus: 100 },
    '+$100 flat on every win'),
  J('copper_charm',   'Copper Charm',    '🪬', 'common', 22, 500_000,
    { freeBetChance: 0.008 },
    '0.8% chance any bet is a free roll'),
  J('loss_leaf',      'Loss Leaf',       '🍂', 'common', 20, 550_000,
    { lossRefundChance: 0.01 },
    '1% chance a loss is fully refunded'),

  // UNCOMMON
  J('streak_stone',   'Streak Stone',    '🧿', 'uncommon', 12, 1_800_000,
    { winStreakBonus: 0.05 },
    '+5% bonus per win in a row (resets on loss)'),
  J('bankroll_ring',  'Bankroll Ring',   '💳', 'uncommon', 10, 2_000_000,
    { lossRefundChance: 0.025, cashbackPct: 0.02 },
    '2.5% loss-refund chance + 2% cashback'),
  J('pocket_ace',     'Pocket Ace',      '🂡', 'uncommon', 11, 1_700_000,
    { flatWinBonus: 400, payoutMultiplier: 0.02 },
    '+$400 per win, +2% payouts'),

  // RARE
  J('chaos_token',    'Chaos Token',     '☯️', 'rare', 5, 5_500_000,
    { freeBetChance: 0.02, payoutMultiplier: 0.03 },
    '2% free-bet chance, +3% payouts'),
  J('lucky_ticket',   'Lucky Ticket',    '🎟️', 'rare', 5, 5_000_000,
    { flatWinBonus: 1_500, luckBoost: 0.04 },
    '+$1.5k per win, +4% luck'),
  J('insurance_coin', 'Insurance Coin',  '🪙', 'rare', 4, 5_800_000,
    { lossStreakShield: 1, cashbackPct: 0.03 },
    'Every 5th loss in a row is refunded, +3% cashback'),

  // EPIC
  J('snowball_joker', 'Snowball Joker',  '❄️',  'epic', 2.5, 14_000_000,
    { winStreakBonus: 0.12, payoutMultiplier: 0.04 },
    '+12% per win streak, +4% payouts'),
  J('loss_shield',    'Loss Shield',     '🛡️', 'epic', 2,   16_000_000,
    { lossStreakShield: 1, lossRefundChance: 0.05, cashbackPct: 0.05 },
    'Every 5th loss refunded, 5% loss-refund chance, +5% cashback'),
  J('cash_magnet',    'Cash Magnet',     '🧲', 'epic', 2.5, 15_000_000,
    { flatWinBonus: 5_000, payoutMultiplier: 0.03 },
    '+$5k flat per win, +3% payouts'),

  // LEGENDARY
  J('phoenix_feather','Phoenix Feather', '🪶', 'legendary', 0.5, 75_000_000,
    { winStreakBonus: 0.20, lossRefundChance: 0.08, flatWinBonus: 2_500 },
    '+20%/streak, 8% loss-refund, +$2.5k per win'),
  J('free_roll_orb',  'Free Roll Orb',   '🔮', 'legendary', 0.45, 80_000_000,
    { freeBetChance: 0.04, payoutMultiplier: 0.10 },
    '4% free-bet chance, +10% payouts'),

  // MYTHIC — the new god-tier
  J('time_stone',     'Time Stone',      '⏳', 'mythic', 0.04, 500_000_000,
    { freeBetChance: 0.05, winStreakBonus: 0.25, flatWinBonus: 10_000, lossRefundChance: 0.10 },
    '5% free bets · +25%/streak · +$10k/win · 10% loss-refund'),
  J('eternity_chip',  'Eternity Chip',   '♾️', 'mythic', 0.02, 750_000_000,
    { freeBetChance: 0.08, flatWinBonus: 25_000, lossStreakShield: 1, winStreakBonus: 0.30, payoutMultiplier: 0.30 },
    'Stacks everything — 8% free, +30%/streak, +$25k/win, shield, +30% payouts'),

  // ═══════════════════════════════════════════════════════════════════════
  //  MEGA EXPANSION PACK v2 — more flavors, more variety
  // ═══════════════════════════════════════════════════════════════════════

  // COMMON — flavor tier
  J('pocket_lint',    'Pocket Lint',     '🧶', 'common', 28, 350_000,
    { flatWinBonus: 50, cashbackPct: 0.01 },
    '+$50 per win, 1% cashback'),
  J('dust_speck',     'Dust Speck',      '💨', 'common', 25, 400_000,
    { luckBoost: 0.01, payoutMultiplier: 0.01 },
    '+1% luck, +1% payouts'),
  J('soda_cap',       'Soda Cap',        '🥤', 'common', 24, 380_000,
    { freeBetChance: 0.005 },
    '0.5% free-bet chance'),
  J('sticker_book',   'Sticker Book',    '📔', 'common', 22, 420_000,
    { xpMultiplier: 0.15 },
    '+15% XP from every bet'),
  J('paper_plane',    'Paper Plane',     '🛩️', 'common', 23, 400_000,
    { winStreakBonus: 0.02 },
    '+2% per consecutive win'),

  // UNCOMMON
  J('snake_eyes',     'Snake Eyes',      '🐍', 'uncommon', 13, 1_600_000,
    { jackpotChance: 0.008, payoutMultiplier: 0.02 },
    '0.8% jackpot, +2% payouts'),
  J('lava_pebble',    'Lava Pebble',     '🔥', 'uncommon', 11, 1_900_000,
    { flatWinBonus: 600, luckBoost: 0.02 },
    '+$600/win, +2% luck'),
  J('spinner_ring',   'Spinner Ring',    '💫', 'uncommon', 12, 1_500_000,
    { freeBetChance: 0.012, cashbackPct: 0.02 },
    '1.2% free-bet, 2% cashback'),
  J('pool_chip',      'Pool Chip',       '🎱', 'uncommon', 10, 2_100_000,
    { winStreakBonus: 0.04, payoutMultiplier: 0.02 },
    '+4% per streak, +2% payouts'),
  J('storm_marble',   'Storm Marble',    '🌩️', 'uncommon', 11, 1_800_000,
    { lossRefundChance: 0.02, luckBoost: 0.03 },
    '2% loss-refund, +3% luck'),

  // RARE
  J('bloodstone',     'Bloodstone',      '🩸', 'rare', 5, 5_200_000,
    { lossStreakShield: 1, payoutMultiplier: 0.05 },
    'Every 5th loss refunded, +5% payouts'),
  J('void_shard',     'Void Shard',      '🕳️', 'rare', 4, 6_500_000,
    { jackpotChance: 0.015, flatWinBonus: 800 },
    '1.5% jackpot, +$800/win'),
  J('mirror_coin',    'Mirror Coin',     '🪞', 'rare', 5, 5_000_000,
    { freeBetChance: 0.025, luckBoost: 0.05 },
    '2.5% free-bet, +5% luck'),
  J('compass_rose',   'Compass Rose',    '🧭', 'rare', 4, 6_000_000,
    { winStreakBonus: 0.08, cashbackPct: 0.03 },
    '+8% per streak, 3% cashback'),
  J('neon_sign',      'Neon Sign',       '💡', 'rare', 4, 5_800_000,
    { flatWinBonus: 2_000, xpMultiplier: 0.3 },
    '+$2k/win, +30% XP'),
  J('echo_shell',     'Echo Shell',      '🐚', 'rare', 5, 5_400_000,
    { lossRefundChance: 0.04, payoutMultiplier: 0.04 },
    '4% loss-refund, +4% payouts'),

  // EPIC
  J('galaxy_dice',    'Galaxy Dice',     '🎲', 'epic', 2.5, 13_000_000,
    { jackpotChance: 0.025, winStreakBonus: 0.06, luckBoost: 0.08 },
    '2.5% jackpot, +6% per streak, +8% luck'),
  J('alchemist_vial', 'Alchemist Vial',  '⚗️', 'epic', 2,   17_000_000,
    { freeBetChance: 0.03, flatWinBonus: 3_500 },
    '3% free-bet, +$3.5k/win'),
  J('sigil_ward',     'Sigil Ward',      '🔰', 'epic', 2,   16_500_000,
    { lossStreakShield: 1, lossRefundChance: 0.06 },
    'Every 5th loss refunded + 6% loss-refund chance'),
  J('omega_card',     'Omega Card',      '🂠', 'epic', 1.5, 22_000_000,
    { winStreakBonus: 0.15, payoutMultiplier: 0.06, flatWinBonus: 2_000 },
    '+15% per streak, +6% payouts, +$2k/win'),
  J('crystal_skull',  'Crystal Skull',   '💀', 'epic', 2,   18_000_000,
    { jackpotChance: 0.02, payoutMultiplier: 0.08 },
    '2% jackpot, +8% payouts'),

  // LEGENDARY
  J('sun_pendant',    'Sun Pendant',     '☀️', 'legendary', 0.5, 72_000_000,
    { flatWinBonus: 7_500, luckBoost: 0.15, payoutMultiplier: 0.10 },
    '+$7.5k/win, +15% luck, +10% payouts'),
  J('moon_pendant',   'Moon Pendant',    '🌙', 'legendary', 0.5, 72_000_000,
    { lossRefundChance: 0.12, cashbackPct: 0.10, lossStreakShield: 1 },
    '12% loss-refund, 10% cashback, 5-loss shield'),
  J('starforge',      'Starforge',       '✨', 'legendary', 0.4, 90_000_000,
    { winStreakBonus: 0.25, jackpotChance: 0.02, flatWinBonus: 5_000 },
    '+25% per streak, 2% jackpot, +$5k/win'),
  J('abyssal_crown',  'Abyssal Crown',   '👑', 'legendary', 0.3, 110_000_000,
    { payoutMultiplier: 0.35, freeBetChance: 0.03, xpMultiplier: 0.8 },
    '+35% payouts, 3% free-bet, +80% XP'),

  // MYTHIC — chase tier
  J('zero_point',     'Zero Point',      '⚛️', 'mythic', 0.03, 550_000_000,
    { freeBetChance: 0.06, jackpotChance: 0.04, winStreakBonus: 0.20 },
    '6% free-bet, 4% jackpot, +20% per streak'),
  J('oracle_eye',     'Oracle Eye',      '👁️‍🗨️', 'mythic', 0.025, 620_000_000,
    { payoutMultiplier: 0.40, lossRefundChance: 0.15, flatWinBonus: 15_000 },
    '+40% payouts, 15% loss-refund, +$15k/win'),
  J('genesis_joker',  'Genesis Joker',   '🌠', 'mythic', 0.02, 820_000_000,
    { payoutMultiplier: 0.50, winStreakBonus: 0.35, flatWinBonus: 20_000, freeBetChance: 0.07, jackpotChance: 0.03 },
    'Ultimate stack — +50% payouts, +35%/streak, +$20k, 7% free, 3% jackpot'),
  J('void_emperor',   'Void Emperor',    '🖤', 'mythic', 0.015, 1_000_000_000,
    { payoutMultiplier: 0.60, lossStreakShield: 1, lossRefundChance: 0.20, cashbackPct: 0.20, flatWinBonus: 30_000 },
    '+60% payouts, shield, 20% loss-refund, 20% cashback, +$30k/win'),
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
    // New abilities
    freeBetChance: 0,
    flatWinBonus: 0,
    lossRefundChance: 0,
    winStreakBonus: 0,
    lossStreakShield: 0,
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
