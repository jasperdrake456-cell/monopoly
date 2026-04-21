'use strict';
/**
 * Daily Egg Hunt — each user gets 3 eggs to crack per day. Each egg has
 * weighted rewards from small to jackpot. Resets at 00:00 Pacific.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'eggHunt.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, '{}', 'utf8');

const DAILY_EGGS = 3;

// Weighted rewards. Sum of weights = 1000. Tune for ~$800 EV per egg.
const REWARDS = [
  { weight: 100, min:    100, max:    250, emoji: '🥚', rarity: 'common',    label: 'Tiny Egg' },
  { weight: 250, min:    250, max:    750, emoji: '🐣', rarity: 'common',    label: 'Nest Egg' },
  { weight: 300, min:    500, max:  1_500, emoji: '🥚', rarity: 'uncommon',  label: 'Speckled Egg' },
  { weight: 200, min:  1_500, max:  3_500, emoji: '🐥', rarity: 'rare',      label: 'Golden Egg' },
  { weight:  95, min:  3_500, max:  8_000, emoji: '🦖', rarity: 'epic',      label: 'Dino Egg' },
  { weight:  40, min:  8_000, max: 25_000, emoji: '🐉', rarity: 'legendary', label: 'Dragon Egg' },
  { weight:  14, min: 25_000, max: 75_000, emoji: '👑', rarity: 'mythic',    label: 'Crown Egg' },
  { weight:   1, min:100_000, max:500_000, emoji: '💎', rarity: 'jackpot',   label: 'DIAMOND JACKPOT' },
];

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(d) { try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {} }

let cache = load();

function pacificDateStr(ts = Date.now()) {
  const d = new Date(ts);
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    .toISOString().slice(0, 10);
}

function pickReward() {
  const totalWeight = REWARDS.reduce((s, r) => s + r.weight, 0);
  let r = Math.random() * totalWeight;
  for (const row of REWARDS) {
    r -= row.weight;
    if (r <= 0) {
      const amount = Math.floor(row.min + Math.random() * (row.max - row.min));
      return { amount, emoji: row.emoji, rarity: row.rarity, label: row.label };
    }
  }
  const row = REWARDS[0];
  return { amount: row.min, emoji: row.emoji, rarity: row.rarity, label: row.label };
}

function getStatus(username) {
  const key = (username || '').toLowerCase();
  if (!key) return { eggsLeft: 0, totalToday: 0, history: [] };
  const today = pacificDateStr();
  const data = cache[key] || {};
  if (data.date !== today) {
    return { eggsLeft: DAILY_EGGS, totalToday: 0, date: today, history: (data.history || []).slice(0, 10) };
  }
  return {
    eggsLeft: Math.max(0, DAILY_EGGS - (data.opened || 0)),
    totalToday: data.opened || 0,
    date: today,
    history: (data.history || []).slice(0, 10),
  };
}

function crackEgg(username) {
  const key = (username || '').toLowerCase();
  if (!key) return { ok: false, error: 'Not logged in' };
  const today = pacificDateStr();
  if (!cache[key] || cache[key].date !== today) {
    cache[key] = { date: today, opened: 0, history: cache[key]?.history || [] };
  }
  const data = cache[key];
  if (data.opened >= DAILY_EGGS) return { ok: false, error: 'No eggs left today' };

  const reward = pickReward();
  data.opened += 1;
  data.history = [{ ...reward, at: Date.now() }, ...(data.history || [])].slice(0, 30);
  save(cache);
  return { ok: true, reward, eggsLeft: DAILY_EGGS - data.opened };
}

module.exports = { getStatus, crackEgg, REWARDS, DAILY_EGGS };
