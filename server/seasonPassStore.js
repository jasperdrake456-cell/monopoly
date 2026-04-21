'use strict';
/**
 * 🎫 Season Pass — 30-day battle-pass style progression.
 *
 *  Every 30 days = one Season. Each season has 50 tiers.
 *  Users earn Season XP by wagering (1 SXP per $100 wagered).
 *  Each tier unlocks a reward on the FREE track. Users who buy Premium
 *  ($50,000 chips, once per season) unlock the PREMIUM track too.
 *
 *  Progression structure:
 *    SEASON_XP_PER_TIER = 500    → 50 × 500 = 25,000 SXP to fully complete
 *
 *  Rewards are balanced so total Free payout is modest but consistent,
 *  Premium payout is substantially better (scales exponentially late game).
 *
 *  Claimed tiers tracked per-user in a Set of "tier:track" keys (e.g. "12:free").
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'seasonPass.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SEASON_LENGTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const XP_PER_TIER      = 500;
const MAX_TIER         = 50;
const PREMIUM_COST     = 50_000;
const XP_PER_DOLLAR    = 1 / 100;

/* ── Persistence ────────────────────────────────────────────────────────── */

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { season: null, users: {} }; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8'); } catch {}
}
let state = load();

/* ── Reward tables ──────────────────────────────────────────────────────── */
/** Free track: gentle progression, roughly 1x to 3x of premium cost over 50 tiers */
function freeReward(tier) {
  // Milestone tiers every 10 give bigger
  if (tier === 50) return { type: 'chips', amount: 50_000, label: '💰 50k chips' };
  if (tier === 40) return { type: 'chips', amount: 25_000, label: '💰 25k chips' };
  if (tier === 30) return { type: 'mystery-box', tier: 'gold',    label: '📦 Gold Mystery Box' };
  if (tier === 25) return { type: 'chips', amount: 15_000, label: '💰 15k chips' };
  if (tier === 20) return { type: 'boost-token', amount: 1,      label: '🚀 Boost Token' };
  if (tier === 15) return { type: 'chips', amount: 10_000, label: '💰 10k chips' };
  if (tier === 10) return { type: 'mystery-box', tier: 'silver', label: '📦 Silver Mystery Box' };
  if (tier === 5)  return { type: 'chips', amount: 5_000,  label: '💰 5k chips' };
  // Small chip drops on other tiers
  if (tier % 2 === 0) return { type: 'chips', amount: 500 + tier * 30,  label: `💰 ${(500 + tier*30).toLocaleString()} chips` };
  return { type: 'xp', amount: 100 + tier * 10, label: `✨ ${100 + tier*10} XP` };
}

/** Premium track: much richer, scales exponentially late-game. */
function premiumReward(tier) {
  if (tier === 50) return { type: 'chips', amount: 1_000_000, label: '💎 1,000,000 chips' };
  if (tier === 45) return { type: 'chips', amount: 250_000,  label: '💎 250k chips' };
  if (tier === 40) return { type: 'title',  id: 'season-champion', label: '🏅 "Season Champion" Title' };
  if (tier === 35) return { type: 'chips', amount: 100_000,  label: '💎 100k chips' };
  if (tier === 30) return { type: 'mystery-box', tier: 'legendary', label: '📦 Legendary Mystery Box' };
  if (tier === 25) return { type: 'chips', amount: 50_000,   label: '💎 50k chips' };
  if (tier === 20) return { type: 'boost-token', amount: 3,  label: '🚀 3 Boost Tokens' };
  if (tier === 15) return { type: 'chips', amount: 25_000,   label: '💎 25k chips' };
  if (tier === 10) return { type: 'mystery-box', tier: 'gold', label: '📦 Gold Mystery Box' };
  if (tier === 5)  return { type: 'chips', amount: 15_000,   label: '💎 15k chips' };
  if (tier % 2 === 0) return { type: 'chips', amount: 2_000 + tier * 150, label: `💎 ${(2000 + tier*150).toLocaleString()} chips` };
  return { type: 'chips', amount: 1_000 + tier * 80, label: `💎 ${(1000 + tier*80).toLocaleString()} chips` };
}

function buildTrack() {
  const tiers = [];
  for (let t = 1; t <= MAX_TIER; t++) {
    tiers.push({
      tier: t,
      xpRequired: t * XP_PER_TIER,
      free: freeReward(t),
      premium: premiumReward(t),
    });
  }
  return tiers;
}

/* ── Season lifecycle ───────────────────────────────────────────────────── */

function ensureSeason() {
  const now = Date.now();
  if (!state.season || now >= state.season.endsAt) {
    // Start new season
    const seasonNum = (state.season?.num || 0) + 1;
    state.season = {
      num: seasonNum,
      name: `Season ${seasonNum}`,
      startsAt: now,
      endsAt: now + SEASON_LENGTH_MS,
    };
    // Clear user season progress but keep premium flag tracking *per season*
    state.users = {};
    save();
  }
  return state.season;
}

function getUser(username) {
  const u = (username || '').toLowerCase();
  if (!state.users[u]) state.users[u] = { xp: 0, premium: false, claimed: [] };
  return state.users[u];
}

/* ── XP & tier ──────────────────────────────────────────────────────────── */

function addWagerXP(username, wagerAmount) {
  ensureSeason();
  const entry = getUser(username);
  const gained = Math.floor(Number(wagerAmount || 0) * XP_PER_DOLLAR);
  if (gained <= 0) return { gained: 0, newXp: entry.xp };
  entry.xp += gained;
  save();
  return { gained, newXp: entry.xp };
}

function currentTier(xp) {
  return Math.min(MAX_TIER, Math.floor(xp / XP_PER_TIER));
}

function getStatus(username) {
  ensureSeason();
  const entry = username ? getUser(username) : null;
  const season = state.season;
  return {
    season: {
      ...season,
      timeLeftMs: Math.max(0, season.endsAt - Date.now()),
    },
    tiers: buildTrack(),
    you: entry && {
      xp: entry.xp,
      currentTier: currentTier(entry.xp),
      premium: !!entry.premium,
      claimed: entry.claimed.slice(),
    },
  };
}

/* ── Purchase premium ───────────────────────────────────────────────────── */

/** Called AFTER balance is verified + deducted by caller. */
function activatePremium(username) {
  ensureSeason();
  const entry = getUser(username);
  if (entry.premium) return { ok: false, error: 'Already premium this season' };
  entry.premium = true;
  save();
  return { ok: true };
}

function isPremium(username) {
  ensureSeason();
  return !!getUser(username).premium;
}

function getPremiumCost() { return PREMIUM_COST; }

/* ── Claim rewards ──────────────────────────────────────────────────────── */

/** Caller distributes the reward (chips, tokens, mystery box, etc) after calling this. */
function claimTier(username, tier, track) {
  ensureSeason();
  const entry = getUser(username);
  const tierNum = Math.floor(Number(tier));
  if (!tierNum || tierNum < 1 || tierNum > MAX_TIER) return { ok: false, error: 'Invalid tier' };
  if (track !== 'free' && track !== 'premium') return { ok: false, error: 'Invalid track' };

  const reached = currentTier(entry.xp);
  if (tierNum > reached) return { ok: false, error: `Reach tier ${tierNum} first` };
  if (track === 'premium' && !entry.premium) return { ok: false, error: 'Premium track locked — upgrade first' };

  const key = `${tierNum}:${track}`;
  if (entry.claimed.includes(key)) return { ok: false, error: 'Already claimed' };

  const reward = track === 'free' ? freeReward(tierNum) : premiumReward(tierNum);
  entry.claimed.push(key);
  save();
  return { ok: true, reward, tier: tierNum, track };
}

module.exports = {
  getStatus,
  addWagerXP,
  activatePremium,
  isPremium,
  getPremiumCost,
  claimTier,
  MAX_TIER,
  XP_PER_TIER,
};
