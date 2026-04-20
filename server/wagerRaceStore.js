'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'wagerRace.json');

// Prize pool: $500k split 60/30/10 for top 3
const PRIZE_POOL   = 500_000;
const PRIZE_SPLIT  = [0.60, 0.30, 0.10]; // top 1, 2, 3

function mondayUTC() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return mon.toISOString().slice(0, 10);
}

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { week: mondayUTC(), wagered: {}, lastReset: 0 }; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

function checkReset() {
  const data = read();
  const week = mondayUTC();
  if (data.week !== week) {
    const prev = { week: data.week, wagered: data.wagered };
    data.prevWeek = prev;
    data.week     = week;
    data.wagered  = {};
    data.lastReset = Date.now();
    write(data);
    return { reset: true, prev };
  }
  return { reset: false };
}

function recordWager(username, amount) {
  checkReset();
  const data = read();
  data.wagered[username] = (data.wagered[username] || 0) + Math.floor(amount);
  write(data);
}

function getLeaderboard(limit = 20) {
  checkReset();
  const data = read();
  const sorted = Object.entries(data.wagered)
    .map(([username, wagered]) => ({ username, wagered }))
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, limit);
  return {
    week:        data.week,
    leaderboard: sorted,
    prizes:      PRIZE_SPLIT.map((pct, i) => ({ rank: i + 1, prize: Math.floor(PRIZE_POOL * pct) })),
    prizePool:   PRIZE_POOL,
  };
}

function getPrevWinners() {
  const data = read();
  if (!data.prevWeek) return null;
  const sorted = Object.entries(data.prevWeek.wagered || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([username, wagered], i) => ({
      rank: i + 1,
      username,
      wagered,
      prize: Math.floor(PRIZE_POOL * (PRIZE_SPLIT[i] || 0)),
    }));
  return { week: data.prevWeek.week, winners: sorted };
}

// Called by cron / weekly reset — pay out top 3
function payoutAndReset() {
  const data = read();
  const sorted = Object.entries(data.wagered)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const payouts = sorted.map(([username], i) => ({
    username,
    prize: Math.floor(PRIZE_POOL * (PRIZE_SPLIT[i] || 0)),
  }));
  // Archive
  data.prevWeek  = { week: data.week, wagered: data.wagered };
  data.week      = mondayUTC();
  data.wagered   = {};
  data.lastReset = Date.now();
  write(data);
  return payouts;
}

module.exports = { recordWager, getLeaderboard, getPrevWinners, payoutAndReset, PRIZE_POOL };
