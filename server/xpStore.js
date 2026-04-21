'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'xp.json');

// ── Level thresholds ─────────────────────────────────────────────────────────
const LEVELS = [
  { level: 1,  xp: 0,       name: 'Rookie',      color: '#94a3b8', icon: '🥉' },
  { level: 2,  xp: 500,     name: 'Regular',     color: '#22c55e', icon: '🎮' },
  { level: 3,  xp: 1500,    name: 'Hustler',     color: '#3b82f6', icon: '💵' },
  { level: 4,  xp: 4000,    name: 'High Roller', color: '#8b5cf6', icon: '🎰' },
  { level: 5,  xp: 10000,   name: 'Shark',       color: '#ec4899', icon: '🦈' },
  { level: 6,  xp: 25000,   name: 'Whale',       color: '#f59e0b', icon: '🐋' },
  { level: 7,  xp: 60000,   name: 'Elite',       color: '#ef4444', icon: '⚡' },
  { level: 8,  xp: 150000,  name: 'Legend',      color: '#06b6d4', icon: '🌟' },
  { level: 9,  xp: 400000,  name: 'Diamond',     color: '#a78bfa', icon: '💎' },
  { level: 10, xp: 1000000, name: 'God',         color: '#fbbf24', icon: '👑' },
];

// ── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  // Betting milestones
  { id: 'first_bet',       name: 'First Steps',    desc: 'Place your first bet',                icon: '🎯', xpReward: 50  },
  { id: 'bet_1k',          name: 'Getting Started', desc: 'Wager $1,000 total',                icon: '💸', xpReward: 100 },
  { id: 'bet_100k',        name: 'Big Spender',     desc: 'Wager $100,000 total',              icon: '🤑', xpReward: 500 },
  { id: 'bet_1m',          name: 'High Roller',     desc: 'Wager $1,000,000 total',            icon: '🎰', xpReward: 2000 },
  { id: 'bet_10m',         name: 'Whale',           desc: 'Wager $10,000,000 total',           icon: '🐋', xpReward: 10000 },
  // Win milestones
  { id: 'first_win',       name: 'Beginner\'s Luck','desc': 'Win your first bet',              icon: '🍀', xpReward: 75  },
  { id: 'win_10',          name: 'On a Roll',        desc: 'Win 10 bets',                      icon: '🎲', xpReward: 200 },
  { id: 'win_100',         name: 'Consistent',       desc: 'Win 100 bets',                     icon: '📈', xpReward: 1000 },
  { id: 'win_500',         name: 'Unstoppable',      desc: 'Win 500 bets',                     icon: '🔥', xpReward: 5000 },
  // Streak
  { id: 'streak_3',        name: 'Hot Streak',       desc: 'Win 3 bets in a row',              icon: '🌶️', xpReward: 150 },
  { id: 'streak_5',        name: 'Heater',            desc: 'Win 5 bets in a row',             icon: '🔥', xpReward: 400 },
  { id: 'streak_10',       name: 'Unstoppable',      desc: 'Win 10 bets in a row',             icon: '⚡', xpReward: 2000 },
  // Big wins
  { id: 'bigwin_5x',       name: 'Multiplier',       desc: 'Win with a 5× multiplier or higher', icon: '✨', xpReward: 200 },
  { id: 'bigwin_10x',      name: 'Jackpot Hunter',   desc: 'Win with a 10× multiplier or higher',icon: '💥', xpReward: 500 },
  { id: 'bigwin_50x',      name: 'Legendary',        desc: 'Win with a 50× multiplier or higher',icon: '💎', xpReward: 2000 },
  { id: 'bigwin_100x',     name: 'Godlike',          desc: 'Win with a 100× multiplier or higher',icon: '👑', xpReward: 10000 },
  { id: 'profit_50k',      name: 'Profit King',      desc: 'Win $50,000 profit in one bet',    icon: '💰', xpReward: 1000 },
  { id: 'profit_500k',     name: 'Millionaire',      desc: 'Win $500,000 profit in one bet',   icon: '🏦', xpReward: 5000 },
  // Game variety
  { id: 'games_5',         name: 'Explorer',         desc: 'Play 5 different games',           icon: '🗺️', xpReward: 300 },
  { id: 'games_10',        name: 'Gamer',            desc: 'Play 10 different games',          icon: '🎮', xpReward: 750 },
  { id: 'games_all',       name: 'Completionist',    desc: 'Play every game on the site',     icon: '🏅', xpReward: 5000 },
  // Level ups
  { id: 'level_5',         name: 'Rising Star',      desc: 'Reach level 5 (Shark)',            icon: '🦈', xpReward: 500 },
  { id: 'level_10',        name: 'Legend',           desc: 'Reach max level 10 (God)',         icon: '👑', xpReward: 50000 },
  // Daily spin
  { id: 'spin_7',          name: 'Daily Devotee',    desc: 'Claim daily spin 7 days in a row', icon: '🎡', xpReward: 500 },
  { id: 'spin_30',         name: 'Loyal',            desc: 'Claim daily spin 30 days in a row',icon: '📅', xpReward: 3000 },
  // Special
  { id: 'jackpot',         name: 'Jackpot!',         desc: 'Win the slots jackpot',            icon: '🎰', xpReward: 20000 },
  { id: 'parlay_win',      name: 'Parlay Pro',       desc: 'Win a sports parlay bet',          icon: '🏆', xpReward: 1000 },
  { id: 'comeback',        name: 'Comeback Kid',     desc: 'Win after having $0 in balance',   icon: '🔄', xpReward: 750 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function getOrCreate(all, username) {
  if (!all[username]) {
    all[username] = {
      xp:            0,
      level:         1,
      totalWagered:  0,
      totalWins:     0,
      winStreak:     0,
      bestStreak:    0,
      gamesPlayed:   {},       // { gameSlug: count }
      achievements:  [],       // [{ id, unlockedAt }]
      spinStreak:    0,
      lastSpinDate:  null,
    };
  }
  return all[username];
}

function getLevelInfo(xp) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xp) lvl = l;
  }
  const nextIdx = LEVELS.findIndex(l => l.level === lvl.level) + 1;
  const next    = LEVELS[nextIdx] || null;
  return {
    ...lvl,
    xp,
    xpToNext:    next ? next.xp - xp : null,
    nextLevel:   next,
    progress:    next ? Math.floor(((xp - lvl.xp) / (next.xp - lvl.xp)) * 100) : 100,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Award XP to a player, unlock achievements, return { newXp, newLevel, leveledUp, unlocked[] }
 */
function awardXP(username, xpAmount) {
  const all     = read();
  const u       = getOrCreate(all, username);
  const oldLevel = u.level;
  u.xp          += Math.floor(xpAmount);

  // Recalculate level
  for (const l of LEVELS) {
    if (u.xp >= l.xp) u.level = l.level;
  }

  write(all);
  return { newXp: u.xp, newLevel: u.level, leveledUp: u.level > oldLevel, levelInfo: getLevelInfo(u.xp) };
}

/**
 * Record a bet result, award XP, unlock achievements.
 * Returns { xpGained, newXp, newLevel, leveledUp, unlocked[] }
 */
function recordBet({ username, game, amount, won, multiplier, profit }) {
  const all  = read();
  const u    = getOrCreate(all, username);
  const unlocked = [];

  // ── Update stats ──────────────────────────────────────────────────────────
  u.totalWagered = (u.totalWagered || 0) + amount;
  u.gamesPlayed  = u.gamesPlayed || {};
  u.gamesPlayed[game] = (u.gamesPlayed[game] || 0) + 1;

  if (won) {
    u.totalWins  = (u.totalWins || 0) + 1;
    u.winStreak  = (u.winStreak || 0) + 1;
    u.bestStreak = Math.max(u.bestStreak || 0, u.winStreak);
  } else {
    u.winStreak = 0;
  }

  // ── XP from betting ───────────────────────────────────────────────────────
  let xpGained = Math.floor(amount / 1000); // 1 XP per $1000 wagered
  if (won && multiplier) xpGained += Math.floor(multiplier * 2); // bonus for big multipliers
  if (won && profit >= 50_000)  xpGained += 100;
  if (won && profit >= 500_000) xpGained += 500;

  // ── Check achievements ────────────────────────────────────────────────────
  const has = id => u.achievements.some(a => a.id === id);
  const unlock = id => {
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def || has(id)) return;
    u.achievements.push({ id, unlockedAt: Date.now() });
    xpGained += def.xpReward;
    unlocked.push({ ...def });
  };

  const totalBets = Object.values(u.gamesPlayed).reduce((s, c) => s + c, 0);
  if (totalBets === 1)              unlock('first_bet');
  if (u.totalWagered >= 1_000)      unlock('bet_1k');
  if (u.totalWagered >= 100_000)    unlock('bet_100k');
  if (u.totalWagered >= 1_000_000)  unlock('bet_1m');
  if (u.totalWagered >= 10_000_000) unlock('bet_10m');

  if (won) {
    if (u.totalWins === 1)   unlock('first_win');
    if (u.totalWins >= 10)   unlock('win_10');
    if (u.totalWins >= 100)  unlock('win_100');
    if (u.totalWins >= 500)  unlock('win_500');

    if (u.winStreak >= 3)  unlock('streak_3');
    if (u.winStreak >= 5)  unlock('streak_5');
    if (u.winStreak >= 10) unlock('streak_10');

    if (multiplier >= 5)   unlock('bigwin_5x');
    if (multiplier >= 10)  unlock('bigwin_10x');
    if (multiplier >= 50)  unlock('bigwin_50x');
    if (multiplier >= 100) unlock('bigwin_100x');

    if (profit >= 50_000)  unlock('profit_50k');
    if (profit >= 500_000) unlock('profit_500k');
  }

  const uniqueGames = Object.keys(u.gamesPlayed).length;
  if (uniqueGames >= 5)  unlock('games_5');
  if (uniqueGames >= 10) unlock('games_10');
  // games_all = 35 unique games
  if (uniqueGames >= 35) unlock('games_all');

  // ── Apply XP ──────────────────────────────────────────────────────────────
  const oldLevel = u.level;
  u.xp = (u.xp || 0) + xpGained;
  for (const l of LEVELS) { if (u.xp >= l.xp) u.level = l.level; }

  // Level achievements
  if (u.level >= 5)  unlock('level_5');
  if (u.level >= 10) unlock('level_10');

  write(all);
  return {
    xpGained,
    newXp:    u.xp,
    newLevel: u.level,
    leveledUp: u.level > oldLevel,
    levelInfo: getLevelInfo(u.xp),
    unlocked,
    stats: { totalWagered: u.totalWagered, totalWins: u.totalWins, winStreak: u.winStreak },
  };
}

function recordJackpotWin(username) {
  const all = read();
  const u   = getOrCreate(all, username);
  const unlocked = [];
  const has = id => u.achievements.some(a => a.id === id);
  if (!has('jackpot')) {
    u.achievements.push({ id: 'jackpot', unlockedAt: Date.now() });
    const def = ACHIEVEMENTS.find(a => a.id === 'jackpot');
    u.xp += def.xpReward;
    for (const l of LEVELS) { if (u.xp >= l.xp) u.level = l.level; }
    unlocked.push({ ...def });
  }
  write(all);
  return unlocked;
}

function recordParlayWin(username) {
  const all = read();
  const u   = getOrCreate(all, username);
  if (!u.achievements.some(a => a.id === 'parlay_win')) {
    u.achievements.push({ id: 'parlay_win', unlockedAt: Date.now() });
    const def = ACHIEVEMENTS.find(a => a.id === 'parlay_win');
    u.xp += def.xpReward;
    for (const l of LEVELS) { if (u.xp >= l.xp) u.level = l.level; }
    write(all);
  }
}

function recordDailySpin(username) {
  const all  = read();
  const u    = getOrCreate(all, username);
  const unlocked = [];
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (u.lastSpinDate === yesterday) {
    u.spinStreak = (u.spinStreak || 0) + 1;
  } else if (u.lastSpinDate === today) {
    // already recorded today — do nothing
    write(all);
    return [];
  } else {
    u.spinStreak = 1;
  }
  u.lastSpinDate = today;

  const has = id => u.achievements.some(a => a.id === id);
  const unlock = id => {
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def || has(id)) return;
    u.achievements.push({ id, unlockedAt: Date.now() });
    u.xp += def.xpReward;
    for (const l of LEVELS) { if (u.xp >= l.xp) u.level = l.level; }
    unlocked.push({ ...def });
  };

  if (u.spinStreak >= 7)  unlock('spin_7');
  if (u.spinStreak >= 30) unlock('spin_30');

  write(all);
  return unlocked;
}

function getProfile(username) {
  const all = read();
  const u   = all[username];
  if (!u) return null;
  return {
    ...u,
    levelInfo: getLevelInfo(u.xp || 0),
    achievementDetails: u.achievements.map(a => {
      const def = ACHIEVEMENTS.find(x => x.id === a.id);
      return def ? { ...def, unlockedAt: a.unlockedAt } : a;
    }),
  };
}

/** Reset a user's XP and level to 1 (used for prestige). Preserves all other stats. */
function resetXP(username) {
  const all = read();
  const u   = getOrCreate(all, username);
  u.xp      = 0;
  u.level   = 1;
  write(all);
}

function getTopPlayers(limit = 20) {
  const all = read();
  return Object.entries(all)
    .map(([username, u]) => ({ username, xp: u.xp || 0, level: u.level || 1, levelInfo: getLevelInfo(u.xp || 0) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

module.exports = {
  LEVELS,
  ACHIEVEMENTS,
  getLevelInfo,
  recordBet,
  recordJackpotWin,
  recordParlayWin,
  recordDailySpin,
  getProfile,
  getTopPlayers,
  awardXP,
  resetXP,
};
