'use strict';
// Daily check-in streak system. Rewards escalate with consecutive daily check-ins.
// Resets if user misses a day.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'checkIn.json');

// Reward schedule: index = (streak - 1), repeating after index 6 (7-day cycle)
const REWARDS = [
  1_000,   // Day 1
  2_500,   // Day 2
  5_000,   // Day 3
  7_500,   // Day 4
  10_000,  // Day 5
  20_000,  // Day 6
  50_000,  // Day 7 (jackpot!)
];

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function write(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FILE);
}

function dayKey(ts = Date.now()) {
  return new Date(ts).toDateString(); // e.g. "Mon Apr 20 2026"
}

function getStatus(username) {
  const d    = read();
  const u    = d[username] || { streak: 0, lastDay: null };
  const today = dayKey();
  const yesterday = dayKey(Date.now() - 86_400_000);
  const alreadyClaimed = u.lastDay === today;
  const streakAlive    = u.lastDay === yesterday || u.lastDay === today;
  const currentStreak  = streakAlive ? u.streak : 0;
  const nextStreak     = alreadyClaimed ? currentStreak : Math.min(currentStreak + 1, REWARDS.length);
  const nextReward     = REWARDS[(nextStreak - 1) % REWARDS.length] || REWARDS[0];
  return {
    canClaim:      !alreadyClaimed,
    streak:        currentStreak,
    alreadyClaimed,
    nextReward,
    rewards:       REWARDS,
    lastClaimedAt: d[username]?.lastClaimedAt || null,
  };
}

function claim(username) {
  const d     = read();
  const today = dayKey();
  const yesterday = dayKey(Date.now() - 86_400_000);
  const u     = d[username] || { streak: 0, lastDay: null };

  if (u.lastDay === today) return { ok: false, error: 'Already checked in today' };

  const streakAlive = u.lastDay === yesterday;
  const newStreak   = streakAlive ? u.streak + 1 : 1;
  const reward      = REWARDS[(newStreak - 1) % REWARDS.length] || REWARDS[0];

  d[username] = { streak: newStreak, lastDay: today, lastClaimedAt: Date.now() };
  write(d);
  return { ok: true, streak: newStreak, reward, isWeekly: newStreak % 7 === 0 };
}

module.exports = { getStatus, claim, REWARDS };
