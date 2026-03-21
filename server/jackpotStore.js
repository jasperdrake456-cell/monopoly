'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE          = path.join(DATA_DIR, 'jackpot.json');
const JACKPOT_START = 10_000;

// ── Persistence (in-memory cache) ─────────────────────────────────────────────

let _cache = null;

function read() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = { amount: JACKPOT_START }; }
  return _cache;
}

function write(data) {
  _cache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

// ── Public API ────────────────────────────────────────────────────────────────

function getJackpot() {
  return read().amount;
}

/**
 * Add contributionAmt to the jackpot pool.
 * Returns the new jackpot total.
 */
function contribute(contributionAmt) {
  const data = read();
  data.amount = Math.floor((data.amount || JACKPOT_START) + contributionAmt);
  write(data);
  return data.amount;
}

/**
 * Claim the jackpot. Returns the amount won and resets pool to JACKPOT_START.
 */
function claim() {
  const data   = read();
  const won    = data.amount;
  data.amount  = JACKPOT_START;
  write(data);
  return { won, resetTo: JACKPOT_START };
}

/**
 * Reset the pool to the starting amount (admin use).
 */
function reset() {
  write({ amount: JACKPOT_START });
  return JACKPOT_START;
}

function resetTo(amount) {
  const val = Math.max(0, Math.floor(amount));
  write({ amount: val });
  return val;
}

module.exports = { getJackpot, contribute, claim, reset, resetTo, JACKPOT_START };
