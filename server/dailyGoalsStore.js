'use strict';
// Daily wagering goals — players get a bonus when they hit their daily target.
// Tiers: Starter $10k → Whale $1M. Resets at midnight Pacific.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'dailyGoals.json');

const TIERS = [
  { id: 'starter',   label: 'Starter',    target: 10_000,   bonus: 500,     xp: 50  },
  { id: 'regular',   label: 'Regular',    target: 50_000,   bonus: 2_000,   xp: 150 },
  { id: 'high',      label: 'High Roller',target: 200_000,  bonus: 7_500,   xp: 400 },
  { id: 'whale',     label: 'Whale',      target: 1_000_000,bonus: 40_000,  xp: 1500 },
];

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function write(d) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, FILE);
  } catch { /* non-fatal */ }
}

function todayKey() {
  // Pacific midnight key
  const offset = (() => {
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(now.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.min(jan, jul) === 420 ? 7 : 8;
  })();
  return new Date(Date.now() - offset * 3_600_000).toISOString().slice(0, 10);
}

function getStatus(username) {
  const d   = read();
  const key = username.toLowerCase();
  const today = todayKey();
  const entry = d[key] || {};
  const wageredToday = (entry.day === today) ? (entry.wagered || 0) : 0;
  const claimedTiers = (entry.day === today) ? (entry.claimedTiers || []) : [];

  const currentTier  = TIERS.filter(t => wageredToday < t.target)[0] || null;
  const nextTier     = currentTier || null;
  const completedTiers = TIERS.filter(t => wageredToday >= t.target);
  return { wageredToday, tiers: TIERS, claimedTiers, nextTier, completedTiers };
}

// Called from recordBetResult flow — adds wager amount to daily total
function addWager(username, amount) {
  const d   = read();
  const key = username.toLowerCase();
  const today = todayKey();
  if (!d[key] || d[key].day !== today) {
    d[key] = { day: today, wagered: 0, claimedTiers: [] };
  }
  d[key].wagered = (d[key].wagered || 0) + amount;
  write(d);
  // Return newly completeable tiers
  const completable = TIERS.filter(t =>
    d[key].wagered >= t.target && !d[key].claimedTiers.includes(t.id)
  );
  return completable;
}

function claimTier(username, tierId) {
  const d   = read();
  const key = username.toLowerCase();
  const today = todayKey();
  if (!d[key] || d[key].day !== today) return { ok: false, error: 'no_progress' };
  if (d[key].claimedTiers?.includes(tierId)) return { ok: false, error: 'already_claimed' };
  const tier = TIERS.find(t => t.id === tierId);
  if (!tier) return { ok: false, error: 'invalid_tier' };
  if ((d[key].wagered || 0) < tier.target) return { ok: false, error: 'not_reached' };
  if (!d[key].claimedTiers) d[key].claimedTiers = [];
  d[key].claimedTiers.push(tierId);
  write(d);
  return { ok: true, tier };
}

module.exports = { getStatus, addWager, claimTier, TIERS };
