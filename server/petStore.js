'use strict';
/**
 * 🐾 Pet Companions — adoptable pets that earn passive tips + give perks.
 *
 * Each user can own ONE pet at a time (swappable by re-adopting later).
 *  - Adopting costs chips (varies by pet rarity).
 *  - Pets accumulate "pet XP" from wagering (1 PXP per $50 wagered).
 *  - Pets level up: 1 → 50 (level N requires N*400 cumulative XP).
 *  - Pets auto-tip: hourly passive chips = TIP_BASE × level.
 *     User clicks "Collect" to claim (max 24h accumulation).
 *  - Can feed pet with chips to instantly grant PXP (1 chip = 1 PXP).
 *  - Each pet has a "perk" that passively modifies gameplay (soft effect,
 *    read by the game server when processing bets — future hook point).
 *
 * Persistence: { users: { [username]: { pet, level, xp, lastCollectAt, adoptedAt } } }
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'pets.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const XP_PER_LEVEL = 400;
const MAX_LEVEL    = 50;
const XP_PER_DOLLAR = 1 / 50;
const TIP_BASE     = 200;            // chips per hour at level 1
const MAX_TIP_HOURS = 24;            // cap accumulation

const PETS = {
  'lucky-cat': {
    id: 'lucky-cat', name: 'Lucky Cat', emoji: '🐱',
    rarity: 'common',   cost: 5_000,
    perk: '+1% bonus XP on every bet',
  },
  'fire-dragon': {
    id: 'fire-dragon', name: 'Fire Dragon', emoji: '🐉',
    rarity: 'rare',     cost: 25_000,
    perk: '+2% multiplier on crash cashouts',
  },
  'phoenix': {
    id: 'phoenix',     name: 'Phoenix', emoji: '🔥',
    rarity: 'epic',     cost: 75_000,
    perk: '5% refund on losing bets over $1,000',
  },
  'ghost-fox': {
    id: 'ghost-fox',   name: 'Ghost Fox', emoji: '👻',
    rarity: 'rare',     cost: 30_000,
    perk: 'Lucky nudges on slot reels',
  },
  'panda-sage': {
    id: 'panda-sage',  name: 'Panda Sage', emoji: '🐼',
    rarity: 'common',   cost: 8_000,
    perk: '+2 XP per dollar wagered',
  },
  'gold-shark': {
    id: 'gold-shark',  name: 'Gold Shark', emoji: '🦈',
    rarity: 'legendary', cost: 200_000,
    perk: '2× hourly tip payouts',
  },
  'cosmic-owl': {
    id: 'cosmic-owl',  name: 'Cosmic Owl', emoji: '🦉',
    rarity: 'epic',     cost: 100_000,
    perk: 'Sees ahead: +5% odds boost on prediction markets',
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
  return state.users[u] || null;
}

function pet(u) { return PETS[u.pet] || null; }

function levelFromXp(xp) {
  // level N reached at xp >= sum(1..N)*XP_PER_LEVEL ... actually linear easier.
  // simplest: level = floor(xp / XP_PER_LEVEL) + 1, capped.
  const lvl = Math.floor(xp / XP_PER_LEVEL) + 1;
  return Math.min(MAX_LEVEL, lvl);
}

function xpToNextLevel(xp) {
  const lvl = levelFromXp(xp);
  if (lvl >= MAX_LEVEL) return 0;
  return XP_PER_LEVEL * lvl - xp;
}

/** Compute accumulated tip since last collect (chips). */
function pendingTip(entry) {
  if (!entry) return 0;
  const lvl = levelFromXp(entry.xp);
  const elapsed = Date.now() - (entry.lastCollectAt || entry.adoptedAt || Date.now());
  const hours = Math.min(MAX_TIP_HOURS, elapsed / (60 * 60 * 1000));
  const p = PETS[entry.pet];
  const multi = p && p.id === 'gold-shark' ? 2 : 1;
  return Math.floor(TIP_BASE * lvl * hours * multi);
}

function listPets() {
  return Object.values(PETS);
}

function getUserPet(username) {
  const entry = getUser(username);
  if (!entry) return { pet: null };
  const info = pet(entry);
  return {
    pet: info,
    level: levelFromXp(entry.xp),
    xp: entry.xp,
    xpToNext: xpToNextLevel(entry.xp),
    pendingTip: pendingTip(entry),
    lastCollectAt: entry.lastCollectAt,
    adoptedAt: entry.adoptedAt,
  };
}

/** Caller must verify + deduct pet.cost before calling. */
function adopt(username, petId) {
  const u = (username || '').toLowerCase();
  const p = PETS[petId];
  if (!p) return { ok: false, error: 'Unknown pet' };
  state.users[u] = {
    pet: petId,
    xp: 0,
    lastCollectAt: Date.now(),
    adoptedAt: Date.now(),
  };
  save();
  return { ok: true, pet: p };
}

/** Add passive wager XP — called from record-bet. */
function addWagerXP(username, wagerAmount) {
  const entry = getUser(username);
  if (!entry) return;
  const gained = Math.floor(Number(wagerAmount || 0) * XP_PER_DOLLAR);
  if (gained <= 0) return;
  entry.xp += gained;
  save();
}

/** Feed pet with chips — caller must have already deducted chips. */
function feed(username, chipAmount) {
  const entry = getUser(username);
  if (!entry) return { ok: false, error: 'No pet adopted' };
  const amt = Math.max(0, Math.floor(Number(chipAmount) || 0));
  if (amt <= 0) return { ok: false, error: 'Invalid amount' };
  const beforeLvl = levelFromXp(entry.xp);
  entry.xp += amt;
  const afterLvl = levelFromXp(entry.xp);
  save();
  return {
    ok: true,
    xpGained: amt,
    totalXp: entry.xp,
    level: afterLvl,
    leveledUp: afterLvl > beforeLvl,
  };
}

/** Collect the pending tip. Returns amount to credit. */
function collectTip(username) {
  const entry = getUser(username);
  if (!entry) return { ok: false, error: 'No pet adopted' };
  const amount = pendingTip(entry);
  if (amount <= 0) return { ok: false, error: 'Nothing to collect yet' };
  entry.lastCollectAt = Date.now();
  save();
  return { ok: true, amount };
}

module.exports = {
  listPets,
  getUserPet,
  adopt,
  addWagerXP,
  feed,
  collectTip,
  PETS,
};
