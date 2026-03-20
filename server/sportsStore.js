'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'sports.json');

// ── Persistence ───────────────────────────────────────────────────────────────

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { games: [], bets: [] }; }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
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
  return includeSettled ? games : games.filter(g => g.status === 'open');
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

// Legacy — kept so settlement job still compiles
function getOpenBetsByGame()     { return {}; }
function getSportsWithOpenBets() { return []; }
function settleBet()             { return null; }

module.exports = {
  createGame, getGames, updateGame, settleGame, cancelGame, deleteGame,
  getGameBetStats, getAllBets,
  placeBet, getUserBets,
  calcPayout,
  // legacy stubs
  getOpenBetsByGame, getSportsWithOpenBets, settleBet,
};
