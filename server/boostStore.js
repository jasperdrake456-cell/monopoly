'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE       = path.join(DATA_DIR, 'boosts.json');

// A boost gives 2× multiplier on all wins for 30 minutes
const BOOST_DURATION_MS = 30 * 60 * 1000;

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

function getStatus(username) {
  const d       = read();
  const u       = d[username] || { tokens: 0, activeUntil: 0 };
  const active  = u.activeUntil > Date.now();
  return {
    tokens:      u.tokens || 0,
    active,
    activeUntil: active ? u.activeUntil : null,
    remaining:   active ? u.activeUntil - Date.now() : 0,
  };
}

/** Award a boost token to a user (e.g. from achievements, missions). */
function awardToken(username, count = 1) {
  const d = read();
  if (!d[username]) d[username] = { tokens: 0, activeUntil: 0 };
  d[username].tokens = (d[username].tokens || 0) + count;
  write(d);
  return { tokens: d[username].tokens };
}

/** Activate a boost (consumes 1 token). Returns { ok, activeUntil }. */
function activateBoost(username) {
  const d = read();
  if (!d[username] || (d[username].tokens || 0) < 1) {
    return { ok: false, error: 'No boost tokens available' };
  }
  // Don't stack — if already active, extend by BOOST_DURATION_MS
  const now   = Date.now();
  const base  = Math.max(now, d[username].activeUntil || 0);
  d[username].activeUntil = base + BOOST_DURATION_MS;
  d[username].tokens -= 1;
  write(d);
  return { ok: true, activeUntil: d[username].activeUntil, tokens: d[username].tokens };
}

/** Check if user's boost is currently active. */
function isBoostActive(username) {
  const d = read();
  return (d[username]?.activeUntil || 0) > Date.now();
}

module.exports = { getStatus, awardToken, activateBoost, isBoostActive, BOOST_DURATION_MS };
