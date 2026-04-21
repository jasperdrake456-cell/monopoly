'use strict';
// Player title system. Titles are earned from achievements and can be equipped.
// The equipped title shows in chat next to the username.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'titles.json');

// Available titles: { id, name, color, achievementRequired } or { id, name, color, level, prestige }
const TITLES = [
  { id: 'rookie',      name: 'Rookie',       color: '#94a3b8', req: null          },
  { id: 'gambler',     name: 'Gambler',       color: '#22c55e', req: 'first_bet'   },
  { id: 'big_spender', name: 'Big Spender',   color: '#3b82f6', req: 'bet_100k'    },
  { id: 'high_roller', name: 'High Roller',   color: '#8b5cf6', req: 'bet_1m'      },
  { id: 'whale',       name: 'Whale',         color: '#0ea5e9', req: 'bet_10m'     },
  { id: 'hot_streak',  name: 'On Fire 🔥',    color: '#ef4444', req: 'streak_5'    },
  { id: 'heater',      name: 'Unstoppable ⚡', color: '#f59e0b', req: 'streak_10'   },
  { id: 'jackpot',     name: 'Jackpot! 🎰',   color: '#fbbf24', req: 'jackpot'     },
  { id: 'legendary',   name: 'Legendary 💎',  color: '#a78bfa', req: 'bigwin_50x'  },
  { id: 'godlike',     name: 'Godlike 👑',    color: '#fcd34d', req: 'bigwin_100x' },
  { id: 'explorer',    name: 'Explorer 🗺️',   color: '#22d3ee', req: 'games_10'    },
  { id: 'completionist',name: 'Completionist', color: '#10b981', req: 'games_all'  },
  { id: 'millionaire', name: 'Millionaire 💰', color: '#f59e0b', req: 'profit_500k' },
  { id: 'loyal',       name: 'Loyal ❤️',       color: '#ec4899', req: 'spin_30'    },
  { id: 'parlay_pro',  name: 'Parlay Pro 🏆',  color: '#84cc16', req: 'parlay_win' },
  { id: 'comeback',    name: 'Comeback Kid 🔄', color: '#06b6d4', req: 'comeback'  },
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

function getUnlockedTitles(achievements) {
  const ids = new Set((achievements || []).map(a => a.id || a));
  return TITLES.filter(t => !t.req || ids.has(t.req));
}

function getEquipped(username) {
  return read()[username.toLowerCase()] || null;
}

function equipTitle(username, titleId) {
  const d = read();
  if (titleId === null) {
    delete d[username.toLowerCase()];
    write(d);
    return { ok: true, title: null };
  }
  const title = TITLES.find(t => t.id === titleId);
  if (!title) return { ok: false, error: 'Unknown title' };
  d[username.toLowerCase()] = { id: title.id, name: title.name, color: title.color };
  write(d);
  return { ok: true, title: d[username.toLowerCase()] };
}

module.exports = { TITLES, getUnlockedTitles, getEquipped, equipTitle };
