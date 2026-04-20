'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'missions.json');

// ── Mission definitions ──────────────────────────────────────────────────────
// type: 'wager' | 'wins' | 'game_wager' | 'game_wins' | 'big_win'
const MISSION_POOL = [
  { id: 'm_wager_5k',    type: 'wager',      target: 5000,    reward: 500,   desc: 'Wager $5,000 on any game',           icon: '💸' },
  { id: 'm_wager_25k',   type: 'wager',      target: 25000,   reward: 2000,  desc: 'Wager $25,000 on any game',          icon: '💸' },
  { id: 'm_wager_100k',  type: 'wager',      target: 100000,  reward: 7500,  desc: 'Wager $100,000 on any game',         icon: '💰' },
  { id: 'm_wins_3',      type: 'wins',       target: 3,       reward: 300,   desc: 'Win 3 bets on any game',             icon: '✅' },
  { id: 'm_wins_10',     type: 'wins',       target: 10,      reward: 1000,  desc: 'Win 10 bets on any game',            icon: '🏆' },
  { id: 'm_crash_3',     type: 'game_wins',  target: 3,  game: 'crash',  reward: 600,   desc: 'Win 3 Crash rounds',     icon: '🚀' },
  { id: 'm_slots_5',     type: 'game_wins',  target: 5,  game: 'slots',  reward: 500,   desc: 'Win 5 Slots spins',      icon: '🎰' },
  { id: 'm_slots_w10k',  type: 'game_wager', target: 10000, game: 'slots', reward: 800, desc: 'Wager $10,000 on Slots', icon: '🎰' },
  { id: 'm_roulette_3',  type: 'game_wins',  target: 3,  game: 'roulette', reward: 600, desc: 'Win 3 Roulette bets',   icon: '🎡' },
  { id: 'm_bj_3',        type: 'game_wins',  target: 3,  game: 'blackjack', reward: 500, desc: 'Win 3 Blackjack hands', icon: '♠' },
  { id: 'm_mines_2',     type: 'game_wins',  target: 2,  game: 'mines',  reward: 700,   desc: 'Cash out on Mines twice',icon: '💣' },
  { id: 'm_dice_5',      type: 'game_wins',  target: 5,  game: 'dice',   reward: 400,   desc: 'Win 5 Dice bets',        icon: '🎲' },
  { id: 'm_plinko_5k',   type: 'game_wager', target: 5000, game: 'plinko', reward: 500, desc: 'Drop $5,000 on Plinko',  icon: '🎯' },
  { id: 'm_bigwin_5x',   type: 'big_win',    target: 5,       reward: 1000,  desc: 'Get a 5× win on any game',           icon: '✨' },
  { id: 'm_bigwin_10x',  type: 'big_win',    target: 10,      reward: 3000,  desc: 'Get a 10× win on any game',          icon: '💥' },
  { id: 'm_sports_bet',  type: 'game_wager', target: 1000, game: 'sports', reward: 600, desc: 'Wager $1,000 on Sports', icon: '🏈' },
  { id: 'm_horse_bet',   type: 'game_wager', target: 2000, game: 'horse-racing', reward: 500, desc: 'Wager $2,000 on Horse Racing', icon: '🏇' },
];

const MISSIONS_PER_DAY = 3;
const RESET_HOUR_UTC   = 0; // midnight UTC

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
}

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

/** Pick 3 random missions for the day, seeded by date+username for consistency */
function pickMissions(username) {
  const key    = todayKey() + username;
  let seed     = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const rng    = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
  const pool   = [...MISSION_POOL];
  const picked = [];
  while (picked.length < MISSIONS_PER_DAY && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function getMissions(username) {
  const all  = read();
  const day  = todayKey();
  const key  = `${username}:${day}`;
  if (!all[key]) {
    const defs = pickMissions(username);
    all[key] = {
      day,
      missions: defs.map(d => ({ ...d, progress: 0, completed: false, rewardClaimed: false })),
    };
    write(all);
  }
  return all[key].missions;
}

/**
 * Update mission progress for a player.
 * eventType: 'wager' | 'win' | 'game_wager' | 'game_win' | 'big_win'
 * Returns array of newly completed missions with their reward amounts.
 */
function recordEvent(username, eventType, game, amount, multiplier) {
  const all  = read();
  const day  = todayKey();
  const key  = `${username}:${day}`;
  if (!all[key]) getMissions(username); // initialise
  const rec  = all[key] || read()[key];
  const completed = [];

  for (const m of rec.missions) {
    if (m.completed) continue;
    let progressed = false;

    if (m.type === 'wager' && eventType === 'wager') {
      m.progress = (m.progress || 0) + amount;
      progressed = true;
    } else if (m.type === 'wins' && eventType === 'win') {
      m.progress = (m.progress || 0) + 1;
      progressed = true;
    } else if (m.type === 'game_wager' && eventType === 'wager' && m.game === game) {
      m.progress = (m.progress || 0) + amount;
      progressed = true;
    } else if (m.type === 'game_wins' && eventType === 'win' && m.game === game) {
      m.progress = (m.progress || 0) + 1;
      progressed = true;
    } else if (m.type === 'big_win' && eventType === 'big_win') {
      if (multiplier >= m.target) {
        m.progress = m.target;
        progressed = true;
      }
    }

    if (progressed && m.progress >= m.target && !m.completed) {
      m.completed  = true;
      m.completedAt = Date.now();
      completed.push({ ...m });
    }
  }

  write(all);
  return completed;
}

function claimReward(username, missionId) {
  const all  = read();
  const day  = todayKey();
  const key  = `${username}:${day}`;
  const rec  = all[key];
  if (!rec) return { ok: false, error: 'No missions found' };

  const m = rec.missions.find(x => x.id === missionId);
  if (!m)            return { ok: false, error: 'Mission not found' };
  if (!m.completed)  return { ok: false, error: 'Mission not complete' };
  if (m.rewardClaimed) return { ok: false, error: 'Already claimed' };

  m.rewardClaimed = true;
  write(all);
  return { ok: true, reward: m.reward };
}

module.exports = { getMissions, recordEvent, claimReward, MISSION_POOL };
