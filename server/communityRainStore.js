'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'communityRain.json');

const TARGET           = 500_000;  // Pool explodes at $500k
const CONTRIBUTION_MIN = 500;      // Min contribution per click
const CONTRIBUTION_MAX = 10_000;   // Max contribution per click

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { pool: 0, contributors: [], lastFired: 0, history: [] }; }
}

function write(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FILE);
}

function getStatus() {
  const d = read();
  return {
    pool:         d.pool || 0,
    target:       TARGET,
    progress:     Math.min(100, Math.floor(((d.pool || 0) / TARGET) * 100)),
    contributors: (d.contributors || []).slice(-20),
    lastFired:    d.lastFired || 0,
    history:      (d.history || []).slice(0, 5),
  };
}

/**
 * Contribute `amount` to the pool.
 * Returns { ok, pool, target, fired }
 * `fired` = true when pool has just hit the target (caller must collect + broadcast).
 */
function contribute(amount) {
  const amt = Math.min(Math.max(Math.floor(amount), CONTRIBUTION_MIN), CONTRIBUTION_MAX);
  const d   = read();
  d.pool    = (d.pool || 0) + amt;
  write(d);
  return { ok: true, pool: d.pool, target: TARGET, fired: d.pool >= TARGET };
}

function addContributor(username, amount) {
  const d = read();
  d.contributors = d.contributors || [];
  d.contributors.push({ username, amount, at: Date.now() });
  if (d.contributors.length > 100) d.contributors = d.contributors.slice(-100);
  write(d);
}

/**
 * Collect and reset the pool.
 * `onlineUsernames` — array of usernames currently online.
 * Returns { totalPool, perUser, players } or null if pool < TARGET.
 */
function collectPool(onlineUsernames) {
  const d = read();
  if ((d.pool || 0) < TARGET) return null;
  const totalPool = d.pool;
  const count     = Math.max(1, onlineUsernames.length);
  const perUser   = Math.floor(totalPool / count);

  d.history = d.history || [];
  d.history.unshift({ totalPool, perUser, players: count, at: Date.now() });
  if (d.history.length > 10) d.history.length = 10;

  d.pool         = 0;
  d.contributors = [];
  d.lastFired    = Date.now();
  write(d);
  return { totalPool, perUser, players: onlineUsernames };
}

module.exports = {
  getStatus,
  contribute,
  addContributor,
  collectPool,
  TARGET,
  CONTRIBUTION_MIN,
  CONTRIBUTION_MAX,
};
