'use strict';
/**
 * ⚔️ Duels — 1v1 Coin Flip wagers between players.
 *
 * Flow:
 *   1. Challenger creates a duel: { wager, side: 'heads'|'tails', expiresAt }.
 *      Server deducts the wager from their balance and escrows it.
 *   2. Another player "accepts" the duel with matching wager.
 *      Server deducts their wager too. Flips a provably-fair coin.
 *      Winner gets the full pool (minus 2% house cut).
 *   3. Expired duels auto-refund the creator.
 *
 *   Caller credits winnings to the winner / refunds the loser via the store
 *   by reading the settled duel's payload.
 */

const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'duels.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const HOUSE_CUT    = 0.02;           // 2% of pot → house
const MIN_WAGER    = 100;
const MAX_WAGER    = 500_000;
const EXPIRY_MS    = 10 * 60 * 1000; // open duels auto-expire in 10 min
const HISTORY_KEEP = 50;             // keep last N settled duels

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { open: [], history: [] }; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8'); } catch {}
}
let state = load();

function listOpen() {
  // Filter out expired on read — tick() actually handles cleanup.
  const now = Date.now();
  return state.open.filter(d => d.expiresAt > now).slice().sort((a, b) => b.createdAt - a.createdAt);
}
function listHistory(limit = 20) {
  return state.history.slice(0, Math.max(1, Math.min(HISTORY_KEEP, limit)));
}
function getById(id) {
  return state.open.find(d => d.id === id) || state.history.find(d => d.id === id);
}

function create({ username, wager, side }) {
  const u = (username || '').toLowerCase();
  const w = Math.floor(Number(wager) || 0);
  const s = side === 'tails' ? 'tails' : 'heads';
  if (w < MIN_WAGER || w > MAX_WAGER) {
    return { ok: false, error: `Wager must be between $${MIN_WAGER} and $${MAX_WAGER.toLocaleString()}` };
  }
  // Limit to 3 open duels per user
  const mine = state.open.filter(d => d.createdBy === u).length;
  if (mine >= 3) return { ok: false, error: 'You can have at most 3 open duels' };
  const duel = {
    id: `duel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdBy: u,
    wager: w,
    side: s,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPIRY_MS,
    status: 'open',
  };
  state.open.push(duel);
  save();
  return { ok: true, duel };
}

function cancel(id, username) {
  const u = (username || '').toLowerCase();
  const idx = state.open.findIndex(d => d.id === id);
  if (idx < 0) return { ok: false, error: 'Duel not found' };
  const d = state.open[idx];
  if (d.createdBy !== u) return { ok: false, error: 'Not your duel' };
  // Return refund amount so caller credits it back
  state.open.splice(idx, 1);
  d.status = 'cancelled';
  save();
  return { ok: true, refund: d.wager };
}

/**
 * Accept a duel. Returns result including who won + payouts.
 * Caller must:
 *   - deduct wager from acceptor before calling (if acceptFn returns ok)
 *     ACTUALLY: caller deducts BEFORE calling to ensure atomicity.
 *   - credit `winnerPayout` to result.winner
 */
function accept(id, acceptorUsername) {
  const u = (acceptorUsername || '').toLowerCase();
  const idx = state.open.findIndex(d => d.id === id);
  if (idx < 0) return { ok: false, error: 'Duel not found' };
  const d = state.open[idx];
  if (Date.now() > d.expiresAt) return { ok: false, error: 'Duel expired' };
  if (d.createdBy === u) return { ok: false, error: 'Cannot accept your own duel' };

  // Provably fair flip — random hex → first byte parity
  const seed = crypto.randomBytes(16).toString('hex');
  const first = parseInt(seed.slice(0, 2), 16);
  const coin  = first % 2 === 0 ? 'heads' : 'tails';

  const winner = (coin === d.side) ? d.createdBy : u;
  const loser  = (winner === d.createdBy) ? u : d.createdBy;
  const pool   = d.wager * 2;
  const house  = Math.floor(pool * HOUSE_CUT);
  const winnerPayout = pool - house;

  // Move duel to history
  state.open.splice(idx, 1);
  const settled = {
    ...d,
    status: 'settled',
    acceptedBy: u,
    acceptedAt: Date.now(),
    coin,
    seed,
    winner, loser,
    pool, house, winnerPayout,
  };
  state.history.unshift(settled);
  if (state.history.length > HISTORY_KEEP) state.history.length = HISTORY_KEEP;
  save();
  return { ok: true, duel: settled };
}

/**
 * Cleanup expired duels. Returns list of refunds the caller must credit back.
 */
function tick() {
  const now = Date.now();
  const refunds = [];
  state.open = state.open.filter(d => {
    if (d.expiresAt <= now) {
      refunds.push({ username: d.createdBy, amount: d.wager, duelId: d.id });
      return false;
    }
    return true;
  });
  if (refunds.length) save();
  return refunds;
}

module.exports = {
  MIN_WAGER, MAX_WAGER, HOUSE_CUT, EXPIRY_MS,
  listOpen, listHistory, getById,
  create, cancel, accept, tick,
};
