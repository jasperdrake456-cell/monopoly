'use strict';
// Prestige: players who reach level 10 can prestige.
// Each prestige level resets XP to 0 but grants an exclusive title and bonus.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'prestige.json');

const PRESTIGE_TITLES = [
  { level: 1, title: '✨ Prestige I',   color: '#22d3ee', bonus: 500_000   },
  { level: 2, title: '🌟 Prestige II',  color: '#a78bfa', bonus: 1_000_000 },
  { level: 3, title: '🔥 Prestige III', color: '#f59e0b', bonus: 2_500_000 },
  { level: 4, title: '💎 Prestige IV',  color: '#ec4899', bonus: 5_000_000 },
  { level: 5, title: '👑 Prestige V',   color: '#fbbf24', bonus: 10_000_000 },
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

function getPrestige(username) {
  return read()[username.toLowerCase()] || { level: 0, title: null };
}

function canPrestige(xpLevel) {
  return xpLevel >= 10;
}

function prestige(username, currentXpLevel) {
  if (!canPrestige(currentXpLevel)) return { ok: false, error: 'Must be level 10 to prestige' };
  const d    = read();
  const key  = username.toLowerCase();
  const cur  = d[key]?.level || 0;
  const next = cur + 1;
  if (next > PRESTIGE_TITLES.length) return { ok: false, error: 'Already at maximum prestige' };
  const tier = PRESTIGE_TITLES[next - 1];
  d[key] = { level: next, title: tier.title, color: tier.color, prestigedAt: Date.now() };
  write(d);
  return { ok: true, prestige: d[key], bonus: tier.bonus };
}

module.exports = { getPrestige, canPrestige, prestige, PRESTIGE_TITLES };
