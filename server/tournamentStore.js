'use strict';
/**
 * 🏆 Tournament System — scheduled multi-player casino tournaments.
 *
 * Flow:
 *  1. Admin creates tournament (name, game-tag, entry fee, start/end, prize split).
 *  2. Before start, players pay entry fee to join.
 *  3. During active window, players' wagering on the target game(s) is tracked:
 *     net profit = wins - losses over that window.
 *  4. At end, top N players split the prize pool based on split percentages.
 *  5. Payouts are auto-credited.
 *
 * Every tournament has:
 *   { id, name, description, gameTag, entryFee, startsAt, endsAt, minEntries,
 *     split:[0.5,0.3,0.2], status:'scheduled'|'active'|'ended'|'cancelled',
 *     entries:[{ username, joinedAt, netProfit, wagered, bets }],
 *     prizePool, resolved:false, winners:[]
 *   }
 *
 *  gameTag matches slugs from xp.record-bet (e.g. 'crash', 'mines', 'slots').
 *  Use '*' to match all casino games.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'tournaments.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, '[]', 'utf8');

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function save(d){ try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {} }

let tournaments = load();

function listAll() {
  return tournaments.slice().sort((a, b) => b.startsAt - a.startsAt);
}
function getById(id) { return tournaments.find(t => t.id === id); }

function activeTournaments() {
  const now = Date.now();
  return tournaments.filter(t => t.status === 'active' && now >= t.startsAt && now < t.endsAt);
}

function upcomingTournaments(limit = 10) {
  const now = Date.now();
  return tournaments
    .filter(t => t.status === 'scheduled' && t.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, limit);
}

function create({ name, description = '', gameTag = '*', entryFee, startsAt, endsAt, minEntries = 2, split = [0.5, 0.3, 0.2] }) {
  if (!name) return { ok: false, error: 'Name required' };
  const fee = Math.floor(Number(entryFee) || 0);
  if (fee < 0) return { ok: false, error: 'Invalid entry fee' };
  const s = Number(startsAt), e = Number(endsAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
    return { ok: false, error: 'Invalid start/end timestamps' };
  }
  if (!Array.isArray(split) || split.length === 0) {
    return { ok: false, error: 'Invalid split' };
  }
  const sumSplit = split.reduce((a, b) => a + Number(b), 0);
  if (sumSplit > 1.0001 || sumSplit <= 0) {
    return { ok: false, error: 'Split must sum to <= 1' };
  }
  const t = {
    id: `tourn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: String(name).slice(0, 60),
    description: String(description).slice(0, 200),
    gameTag: String(gameTag).slice(0, 40),
    entryFee: fee,
    startsAt: s,
    endsAt: e,
    minEntries,
    split,
    status: 'scheduled',
    entries: [],
    prizePool: 0,  // grows as players join
    resolved: false,
    winners: [],
    createdAt: Date.now(),
  };
  tournaments.push(t);
  save(tournaments);
  return { ok: true, tournament: t };
}

function isInTournament(t, username) {
  const u = (username || '').toLowerCase();
  return t.entries.some(e => e.username === u);
}

function join(tournamentId, username) {
  const t = getById(tournamentId);
  if (!t) return { ok: false, error: 'Tournament not found' };
  if (t.status !== 'scheduled' && t.status !== 'active') return { ok: false, error: 'Tournament closed' };
  if (Date.now() >= t.endsAt) return { ok: false, error: 'Tournament ended' };
  if (isInTournament(t, username)) return { ok: false, error: 'Already joined' };
  const u = (username || '').toLowerCase();
  t.entries.push({ username: u, joinedAt: Date.now(), netProfit: 0, wagered: 0, bets: 0 });
  t.prizePool += t.entryFee;
  save(tournaments);
  return { ok: true, tournament: t };
}

/**
 * Record a bet for the current user — called from the xp/record-bet endpoint.
 * If user is enrolled in any active matching tournament, updates their standings.
 *  profit: win - wager (can be negative).
 *  wager: amount risked.
 *  gameSlug: slug of the game (e.g. 'crash').
 */
function recordBet(username, { profit, wager, gameSlug }) {
  const u = (username || '').toLowerCase();
  const now = Date.now();
  let changed = false;
  for (const t of tournaments) {
    if (t.status !== 'active') continue;
    if (now < t.startsAt || now >= t.endsAt) continue;
    if (t.gameTag !== '*' && t.gameTag !== gameSlug) continue;
    const entry = t.entries.find(e => e.username === u);
    if (!entry) continue;
    entry.netProfit = (entry.netProfit || 0) + (Number(profit) || 0);
    entry.wagered   = (entry.wagered || 0)  + (Number(wager)  || 0);
    entry.bets      = (entry.bets || 0)     + 1;
    changed = true;
  }
  if (changed) save(tournaments);
}

function activate(t) {
  t.status = 'active';
  save(tournaments);
}

/**
 * Tick: check every tournament and auto-activate/finalize based on time.
 * Returns arrays of { started: [...], finalized: [{ tournament, payouts }] }.
 */
function tick() {
  const now = Date.now();
  const started = [];
  const finalized = [];
  for (const t of tournaments) {
    if (t.status === 'scheduled' && now >= t.startsAt && now < t.endsAt) {
      activate(t);
      started.push(t);
    }
    if (t.status === 'active' && now >= t.endsAt && !t.resolved) {
      const result = finalize(t);
      if (result) finalized.push(result);
    }
  }
  return { started, finalized };
}

/** Resolve a tournament: pay out top entries. Returns { tournament, payouts } or null. */
function finalize(t) {
  if (t.resolved) return null;
  // If not enough entries → refund everyone
  if (t.entries.length < t.minEntries) {
    const payouts = t.entries.map(e => ({ username: e.username, amount: t.entryFee, reason: 'refund' }));
    t.status = 'cancelled';
    t.resolved = true;
    t.winners = [];
    save(tournaments);
    return { tournament: t, payouts };
  }

  // Sort by netProfit desc, tiebreaker fewer bets (efficiency)
  const sorted = t.entries.slice().sort((a, b) => (b.netProfit - a.netProfit) || (a.wagered - b.wagered));
  const winners = [];
  const payouts = [];
  for (let i = 0; i < t.split.length && i < sorted.length; i++) {
    const share = Math.floor(t.prizePool * t.split[i]);
    if (share <= 0) continue;
    winners.push({ username: sorted[i].username, rank: i + 1, prize: share, netProfit: sorted[i].netProfit });
    payouts.push({ username: sorted[i].username, amount: share, reason: `rank ${i + 1}` });
  }
  t.status = 'ended';
  t.resolved = true;
  t.winners = winners;
  save(tournaments);
  return { tournament: t, payouts };
}

function cancel(id) {
  const t = getById(id);
  if (!t) return { ok: false, error: 'Not found' };
  if (t.resolved) return { ok: false, error: 'Already resolved' };
  const payouts = t.entries.map(e => ({ username: e.username, amount: t.entryFee, reason: 'cancelled refund' }));
  t.status = 'cancelled';
  t.resolved = true;
  t.winners = [];
  save(tournaments);
  return { ok: true, tournament: t, payouts };
}

function getLeaderboard(id) {
  const t = getById(id);
  if (!t) return null;
  return t.entries.slice().sort((a, b) => (b.netProfit - a.netProfit) || (a.wagered - b.wagered));
}

module.exports = {
  listAll, getById, activeTournaments, upcomingTournaments,
  create, join, recordBet, tick, finalize, cancel, getLeaderboard,
};
