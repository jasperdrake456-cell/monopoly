'use strict';
/**
 * Public Big Wins Board feed — in-memory ring buffer of recent meaningful
 * wins. Separate from the admin big-win log (winLog.js):
 *
 *   winLog.js          → admin-only, $5M+ threshold, auto-clears hourly
 *   publicWinsStore.js → public board, $10k+ threshold, last 50 entries,
 *                        kept in memory until process restart
 *
 * The public board needs to actually have content to show, while the admin
 * log is meant to surface only whale-level events. They serve different
 * purposes so they get separate stores.
 */

const MAX = 50;
let wins = [];

function logWin(entry) {
  const e = { ...entry };
  e.id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  wins.unshift(e);
  if (wins.length > MAX) wins.length = MAX;
  return e;
}

function getWins() { return wins; }

function clearWins() { wins = []; }

module.exports = { logWin, getWins, clearWins };
