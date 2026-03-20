'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'sports.json');

// ── Persistence ───────────────────────────────────────────────────────────────

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { bets: [] }; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

// ── Odds math ─────────────────────────────────────────────────────────────────

/**
 * Calculate total payout (bet returned + winnings) for American odds.
 *   +150 on $1000  → $2500  (win $1500)
 *   -130 on $1000  → $1769  (win $769)
 */
function calcPayout(amount, odds) {
  if (odds > 0) return Math.floor(amount + amount * (odds / 100));
  return Math.floor(amount + amount * (100 / Math.abs(odds)));
}

// ── Public API ────────────────────────────────────────────────────────────────

function placeBet({ username, gameId, sport, homeTeam, awayTeam, commenceTime, pick, odds, amount }) {
  if (!username || !gameId || !pick || !odds || !amount) {
    return { ok: false, error: 'Missing bet fields' };
  }
  const amt = Math.floor(Number(amount));
  if (!amt || amt < 100) return { ok: false, error: 'Minimum bet is $100' };
  if (amt > 500_000)     return { ok: false, error: 'Maximum bet is $500,000' };

  const data = read();

  // Prevent duplicate bets on same game by same user
  const existing = data.bets.find(
    b => b.username === username && b.gameId === gameId && b.status === 'open'
  );
  if (existing) return { ok: false, error: 'You already have an open bet on this game' };

  const betId          = crypto.randomBytes(8).toString('hex');
  const potentialPayout = calcPayout(amt, odds);

  data.bets.push({
    betId,
    username,
    gameId,
    sport,
    homeTeam,
    awayTeam,
    commenceTime,
    pick,
    odds,
    amount:          amt,
    potentialPayout,
    status:          'open',  // open | won | lost | push | void
    placedAt:        Date.now(),
    settledAt:       null,
    payout:          null,
  });

  write(data);
  return { ok: true, betId, potentialPayout };
}

function getUserBets(username) {
  const data = read();
  return data.bets
    .filter(b => b.username === username)
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 50);
}

/** Returns { gameId → [bets] } for all unsettled bets. */
function getOpenBetsByGame() {
  const data   = read();
  const byGame = {};
  for (const b of data.bets.filter(b => b.status === 'open')) {
    if (!byGame[b.gameId]) byGame[b.gameId] = [];
    byGame[b.gameId].push(b);
  }
  return byGame;
}

/** Sports that currently have at least one open bet. */
function getSportsWithOpenBets() {
  const data = read();
  return [...new Set(data.bets.filter(b => b.status === 'open').map(b => b.sport))];
}

/**
 * Settle a single bet.
 * winner: exact team name that won, or 'push' (draw).
 * Returns settled bet object, or null if not found / already settled.
 */
function settleBet(betId, winner) {
  const data = read();
  const bet  = data.bets.find(b => b.betId === betId);
  if (!bet || bet.status !== 'open') return null;

  bet.settledAt = Date.now();

  if (winner === 'push') {
    bet.status = 'push';
    bet.payout = bet.amount; // stake returned
  } else if (bet.pick === winner) {
    bet.status = 'won';
    bet.payout = bet.potentialPayout;
  } else {
    bet.status = 'lost';
    bet.payout = 0;
  }

  write(data);
  return bet;
}

module.exports = {
  placeBet,
  getUserBets,
  getOpenBetsByGame,
  getSportsWithOpenBets,
  settleBet,
  calcPayout,
};
