'use strict';
// Tracks recent balance changes per user (bonuses, wins, purchases).
// Stores last 50 entries per user. Fire-and-forget, non-critical.
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'balanceHistory.json');
const MAX_PER_USER = 50;

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

function log(username, { type, amount, balance, description }) {
  try {
    const d = read();
    const key = username.toLowerCase();
    if (!d[key]) d[key] = [];
    d[key].unshift({ type, amount, balance, description, at: Date.now() });
    if (d[key].length > MAX_PER_USER) d[key].length = MAX_PER_USER;
    write(d);
  } catch { /* non-fatal */ }
}

function getHistory(username, limit = 20) {
  const d = read();
  return (d[username.toLowerCase()] || []).slice(0, limit);
}

module.exports = { log, getHistory };
