'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'sports.json');

// ── Persistence (in-memory cache — read once, write-through) ──────────────────

let _cache = null;

function read() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = { games: [], bets: [] }; }
  return _cache;
}

function write(data) {
  _cache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, FILE);
}

// ── Odds math ─────────────────────────────────────────────────────────────────

function calcPayout(amount, odds) {
  if (odds > 0) return Math.floor(amount + amount * (odds / 100));
  return Math.floor(amount + amount * (100 / Math.abs(odds)));
}

// ── Game management (admin) ───────────────────────────────────────────────────

function createGame({ sport, sportEmoji, homeTeam, awayTeam, odds, startTime }) {
  const data   = read();
  const gameId = crypto.randomBytes(8).toString('hex');
  if (!data.games) data.games = [];
  const game = {
    gameId, sport, sportEmoji: sportEmoji || '',
    homeTeam, awayTeam, odds,
    startTime, status: 'open', winner: null,
    createdAt: Date.now(), settledAt: null,
  };
  data.games.push(game);
  write(data);
  return { ok: true, game };
}

function getGames(includeSettled = false) {
  const data = read();
  const games = (data.games || []);
  // For the public (player) view: only show open games that haven't started yet
  return includeSettled ? games : games.filter(g => g.status === 'open' && Date.now() < new Date(g.startTime).getTime());
}

function updateGame(gameId, updates) {
  const data = read();
  const game = (data.games || []).find(g => g.gameId === gameId);
  if (!game)               return { ok: false, error: 'Game not found' };
  if (game.status !== 'open') return { ok: false, error: 'Game already settled or cancelled' };
  if (updates.odds)       game.odds      = updates.odds;
  if (updates.startTime)  game.startTime = updates.startTime;
  if (updates.homeTeam)   game.homeTeam  = updates.homeTeam;
  if (updates.awayTeam)   game.awayTeam  = updates.awayTeam;
  write(data);
  return { ok: true, game };
}

/**
 * Settle a game — marks winner, settles all open bets.
 * winner: exact team name, or 'cancelled' to void and refund everyone.
 * Returns { ok, game, settled: [bet], payouts: { username → amount } }
 */
function settleGame(gameId, winner) {
  const data = read();
  const game = (data.games || []).find(g => g.gameId === gameId);
  if (!game)                  return { ok: false, error: 'Game not found' };
  if (game.status !== 'open') return { ok: false, error: 'Already settled or cancelled' };

  game.status    = winner === 'cancelled' ? 'cancelled' : 'settled';
  game.winner    = winner;
  game.settledAt = Date.now();

  const openBets = (data.bets || []).filter(b => b.gameId === gameId && b.status === 'open');
  const payouts  = {}; // username → amount to credit

  for (const bet of openBets) {
    bet.settledAt = Date.now();
    if (winner === 'cancelled') {
      bet.status = 'push';
      bet.payout = bet.amount;
    } else if (bet.pick === winner) {
      bet.status = 'won';
      bet.payout = bet.potentialPayout;
    } else {
      bet.status = 'lost';
      bet.payout = 0;
    }
    if (bet.payout > 0) {
      payouts[bet.username] = (payouts[bet.username] || 0) + bet.payout;
    }
  }

  write(data);
  return { ok: true, game, settled: openBets, payouts };
}

function cancelGame(gameId) {
  return settleGame(gameId, 'cancelled');
}

function deleteGame(gameId) {
  const data = read();
  const idx  = (data.games || []).findIndex(g => g.gameId === gameId);
  if (idx === -1) return { ok: false, error: 'Game not found' };
  data.games.splice(idx, 1);
  write(data);
  return { ok: true };
}

/**
 * Purge all settled and cancelled games (and their bets) from the DB.
 * Keeps open games intact. Returns { gamesRemoved, betsRemoved }.
 */
function purgeHistory() {
  const data = read();
  const before = (data.games || []).length;
  const removedIds = new Set(
    (data.games || []).filter(g => g.status === 'settled' || g.status === 'cancelled').map(g => g.gameId)
  );
  data.games = (data.games || []).filter(g => !removedIds.has(g.gameId));
  const betsBefore = (data.bets || []).length;
  data.bets = (data.bets || []).filter(b => !removedIds.has(b.gameId));
  write(data);
  return {
    gamesRemoved: before - data.games.length,
    betsRemoved:  betsBefore - data.bets.length,
  };
}

function getGameBetStats(gameId) {
  const data  = read();
  const bets  = (data.bets || []).filter(b => b.gameId === gameId);
  const open  = bets.filter(b => b.status === 'open');
  const totalWagered = open.reduce((s, b) => s + b.amount, 0);
  return { betCount: open.length, totalWagered };
}

function getAllBets() {
  const data = read();
  return (data.bets || []).sort((a, b) => b.placedAt - a.placedAt);
}

// ── Bet placement (players) ───────────────────────────────────────────────────

function placeBet({ username, gameId, pick, odds, amount }) {
  const data = read();
  const game = (data.games || []).find(g => g.gameId === gameId);
  if (!game)                  return { ok: false, error: 'Game not found' };
  if (game.status !== 'open') return { ok: false, error: 'Betting is closed for this game' };
  if (Date.now() >= new Date(game.startTime).getTime()) return { ok: false, error: 'Betting is closed — this game has already started' };

  const amt = Math.floor(Number(amount));
  if (!amt || amt < 100)  return { ok: false, error: 'Minimum bet is $100' };
  if (amt > 500_000)      return { ok: false, error: 'Maximum bet is $500,000' };

  const existing = (data.bets || []).find(
    b => b.username === username && b.gameId === gameId && b.status === 'open'
  );
  if (existing) return { ok: false, error: 'You already have an open bet on this game' };

  const betId          = crypto.randomBytes(8).toString('hex');
  const potentialPayout = calcPayout(amt, odds);

  if (!data.bets) data.bets = [];
  data.bets.push({
    betId, username, gameId,
    sport:    game.sport,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    commenceTime: game.startTime,
    pick, odds, amount: amt, potentialPayout,
    status: 'open', placedAt: Date.now(), settledAt: null, payout: null,
  });

  write(data);
  return { ok: true, betId, potentialPayout };
}

function getUserBets(username) {
  const data = read();
  return (data.bets || [])
    .filter(b => b.username === username)
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 50);
}

// ── Parlays ───────────────────────────────────────────────────────────────────

/**
 * Convert American odds to decimal multiplier.
 * e.g. +150 → 2.5, -110 → 1.909
 */
function americanToDecimal(odds) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

/**
 * Convert combined decimal odds back to American odds.
 */
function decimalToAmerican(decimal) {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/**
 * Place a parlay bet.
 * picks = [{ gameId, pick, odds }]
 * Returns { ok, betId, combinedOdds (American), potentialPayout }
 */
function placeParlayBet({ username, picks, amount }) {
  if (!picks || picks.length < 2) return { ok: false, error: 'A parlay requires at least 2 picks' };
  if (picks.length > 12)           return { ok: false, error: 'Maximum 12 legs in a parlay' };

  const data  = read();
  const games = data.games || [];
  const now   = Date.now();

  // Validate each pick
  let combinedDecimal = 1;
  const resolvedPicks = [];
  const usedGameIds   = new Set();

  for (const p of picks) {
    if (usedGameIds.has(p.gameId)) return { ok: false, error: 'Cannot bet the same game twice in a parlay' };
    usedGameIds.add(p.gameId);

    const game = games.find(g => g.gameId === p.gameId);
    if (!game)                  return { ok: false, error: `Game not found: ${p.gameId}` };
    if (game.status !== 'open') return { ok: false, error: `Game already closed: ${game.homeTeam} vs ${game.awayTeam}` };
    if (now >= new Date(game.startTime).getTime()) return { ok: false, error: `Betting closed — ${game.homeTeam} vs ${game.awayTeam} has started` };

    const odds = Number(p.odds);
    if (!odds || isNaN(odds)) return { ok: false, error: `Invalid odds for ${p.pick}` };

    combinedDecimal *= americanToDecimal(odds);
    resolvedPicks.push({
      gameId:   game.gameId,
      pick:     p.pick,
      odds:     odds,
      sport:    game.sport,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      startTime: game.startTime,
      status:   'open', // open | won | lost | push | cancelled
    });
  }

  const amt = Math.floor(Number(amount));
  if (!amt || amt < 100)  return { ok: false, error: 'Minimum parlay bet is $100' };
  if (amt > 500_000)      return { ok: false, error: 'Maximum parlay bet is $500,000' };

  const combinedOdds     = decimalToAmerican(combinedDecimal);
  const potentialPayout  = Math.floor(amt * combinedDecimal);
  const betId            = crypto.randomBytes(8).toString('hex');

  if (!data.bets) data.bets = [];
  data.bets.push({
    betId,
    username,
    type:            'parlay',
    picks:           resolvedPicks,
    amount:          amt,
    combinedOdds,
    combinedDecimal,
    potentialPayout,
    status:          'open',
    placedAt:        now,
    settledAt:       null,
    payout:          null,
  });

  write(data);
  return { ok: true, betId, combinedOdds, potentialPayout };
}

/**
 * Settle all open parlay bets that have a game just settled.
 * Called internally after settleGame() so settlement is automatic.
 * Returns map { username → payout } for crediting.
 */
function settleParlayBets(gameId, winner) {
  const data    = read();
  const parlays = (data.bets || []).filter(b => b.type === 'parlay' && b.status === 'open');
  const payouts = {};

  for (const bet of parlays) {
    const leg = bet.picks.find(p => p.gameId === gameId);
    if (!leg) continue;

    // Update this leg's status
    if (winner === 'cancelled') {
      leg.status = 'push'; // cancelled game: leg is void, recalculate odds without it
    } else if (leg.pick === winner) {
      leg.status = 'won';
    } else {
      leg.status = 'lost';
    }

    // Check if all legs are resolved
    const openLegs      = bet.picks.filter(p => p.status === 'open');
    if (openLegs.length > 0) continue; // more legs still pending

    // All legs resolved — determine parlay outcome
    const lostLegs = bet.picks.filter(p => p.status === 'lost');

    bet.settledAt = Date.now();

    if (lostLegs.length > 0) {
      // Any loss = parlay lost
      bet.status = 'lost';
      bet.payout = 0;
    } else {
      // No losses — check for pushes (cancelled games)
      const pushLegs = bet.picks.filter(p => p.status === 'push');
      if (pushLegs.length === bet.picks.length) {
        // All legs pushed — full refund
        bet.status = 'push';
        bet.payout = bet.amount;
      } else {
        // Some pushes: recalculate decimal odds without pushed legs
        const wonLegs     = bet.picks.filter(p => p.status === 'won');
        const effectiveDec = wonLegs.reduce((acc, p) => acc * americanToDecimal(p.odds), 1);
        const payout      = Math.floor(bet.amount * effectiveDec);
        bet.status = 'won';
        bet.payout = payout;
        payouts[bet.username] = (payouts[bet.username] || 0) + payout;
      }
    }

    if (bet.status === 'push' && bet.payout > 0) {
      payouts[bet.username] = (payouts[bet.username] || 0) + bet.payout;
    }
  }

  if (Object.keys(payouts).length > 0 || parlays.some(b => b.settledAt)) {
    write(data);
  }
  return payouts;
}

function getUserParlays(username) {
  const data = read();
  return (data.bets || [])
    .filter(b => b.username === username && b.type === 'parlay')
    .sort((a, b) => b.placedAt - a.placedAt)
    .slice(0, 50);
}

// Legacy — kept so settlement job still compiles
function getOpenBetsByGame()     { return {}; }
function getSportsWithOpenBets() { return []; }
function settleBet()             { return null; }

module.exports = {
  createGame, getGames, updateGame, settleGame, cancelGame, deleteGame, purgeHistory,
  getGameBetStats, getAllBets,
  placeBet, getUserBets,
  placeParlayBet, settleParlayBets, getUserParlays,
  calcPayout, americanToDecimal, decimalToAmerican,
  // legacy stubs
  getOpenBetsByGame, getSportsWithOpenBets, settleBet,
};
