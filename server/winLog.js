'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR     = process.env.DATA_DIR || path.join(__dirname, 'data');
const WIN_LOG_FILE = path.join(DATA_DIR, 'winLog.json');
const MAX_ENTRIES  = 500; // keep the 500 most recent big wins

function readWins() {
  try { return JSON.parse(fs.readFileSync(WIN_LOG_FILE, 'utf8')); }
  catch { return []; }
}

/**
 * Append a big-win entry (newest first).
 * Entry shape: { username, game, bet, payout, profit, multiplier, details, timestamp }
 */
function logWin(entry) {
  const wins = readWins();
  wins.unshift(entry);
  if (wins.length > MAX_ENTRIES) wins.length = MAX_ENTRIES;
  try { fs.writeFileSync(WIN_LOG_FILE, JSON.stringify(wins, null, 2), 'utf8'); }
  catch (e) { console.error('[winLog] write error:', e.message); }
}

function getWins() {
  return readWins();
}

function clearWins() {
  try { fs.writeFileSync(WIN_LOG_FILE, '[]', 'utf8'); }
  catch { /* non-fatal */ }
}

module.exports = { logWin, getWins, clearWins };
