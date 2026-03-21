'use strict';
/**
 * autoSettle.js
 * Polls The Odds API scores every 15 minutes.
 * Any completed game that has an open entry in sportsStore is settled automatically
 * and winners are credited without any manual input.
 */

const sb  = require('./sportsStore');
const us  = require('./userStore');
const al  = require('./adminLog');
const odd = require('./oddsAPI');

// ── Sport key map: our stored sport name → Odds API sport key ─────────────────
const SPORT_KEY_MAP = {
  'NCAAB':                 'basketball_ncaab',
  'NBA':                   'basketball_nba',
  'NHL':                   'icehockey_nhl',
  'NFL':                   'americanfootball_nfl',
  'MLB':                   'baseball_mlb',
  'Premier League':        'soccer_epl',
  'La Liga':               'soccer_spain_la_liga',
  'UEFA Champions League': 'soccer_uefa_champs_league',
  'MMA':                   'mma_mixed_martial_arts',
};

// ── Team name normalization (same logic as auto-sync script) ──────────────────
function normalizeTeam(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^\(\d+\)\s*/, '')       // strip "(5) " seed prefix
    .replace(/\bst\./g, 'saint')      // St. (with period) → saint, e.g. "St. John's"
    .replace(/[^a-z0-9 ]/g, '')       // remove special chars
    .replace(/\bstate\b/g, 'st')      // "Wright State" → "wright st" to match "Wright St Raiders"
    .replace(/\s+/g, ' ')
    .trim();
}

// Fuzzy match: exact OR one name contains the other (handles "Kentucky" ↔ "Kentucky Wildcats")
function teamMatches(a, b) {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function isSameGame(storedGame, apiHome, apiAway) {
  const homeMatch = teamMatches(storedGame.homeTeam, apiHome) && teamMatches(storedGame.awayTeam, apiAway);
  const swapMatch = teamMatches(storedGame.homeTeam, apiAway) && teamMatches(storedGame.awayTeam, apiHome);
  return homeMatch || swapMatch;
}

// Determine winner from API score data
function determineWinner(storedGame, apiGame) {
  const { scores, home_team, away_team } = apiGame;
  if (!scores || scores.length < 2) return null;

  // Find score by fuzzy-matching the team name
  const getScore = (teamName) => {
    const entry = scores.find(s => teamMatches(s.name, teamName));
    return entry != null ? parseFloat(entry.score) : NaN;
  };

  const homeScore = getScore(home_team);
  const awayScore = getScore(away_team);
  if (isNaN(homeScore) || isNaN(awayScore)) return null;

  const isDraw = homeScore === awayScore;

  // Determine which stored team name corresponds to which API team
  const storedHomeIsApiHome = teamMatches(storedGame.homeTeam, home_team);

  if (isDraw) {
    // Only settle draw if the game has draw odds, otherwise hold
    return storedGame.odds?.draw != null ? 'Draw' : null;
  }

  const apiHomeWon = homeScore > awayScore;
  if (storedHomeIsApiHome) {
    return apiHomeWon ? storedGame.homeTeam : storedGame.awayTeam;
  } else {
    return apiHomeWon ? storedGame.awayTeam : storedGame.homeTeam;
  }
}

// Socket.io instance — set by start() so we can push balance updates to clients
let _io = null;

// ── Core settle run ───────────────────────────────────────────────────────────
async function runAutoSettle() {
  // First: cancel any started games with 0 bets — no API key needed for this
  cleanupZeroBetGames();

  // Always bust the scores cache so we get fresh data on every settle run
  odd.clearScoresCache();

  // Get ALL games (including settled) then filter to open ones that have started
  const allGames = sb.getGames(true);
  const now = Date.now();
  // Only settle open games whose start time has already passed (give 10 min grace)
  const eligible = allGames.filter(g => g.status === 'open' && new Date(g.startTime).getTime() < now - 10 * 60_000);

  console.log(`[autoSettle] Run started — ${allGames.length} total games, ${eligible.length} eligible for settlement`);
  if (!eligible.length) {
    console.log('[autoSettle] No eligible games — nothing to do');
    return;
  }

  eligible.forEach(g => console.log(`[autoSettle]   Eligible: ${g.sport} | ${g.homeTeam} vs ${g.awayTeam} | started ${new Date(g.startTime).toISOString()}`));

  // Group by API sport key
  const bySportKey = {};
  for (const g of eligible) {
    const apiKey = SPORT_KEY_MAP[g.sport];
    if (!apiKey) {
      console.warn(`[autoSettle] No API key mapping for sport "${g.sport}" — skipping`);
      continue;
    }
    if (!bySportKey[apiKey]) bySportKey[apiKey] = [];
    bySportKey[apiKey].push(g);
  }

  if (!Object.keys(bySportKey).length) {
    console.log('[autoSettle] No eligible games have a known sport mapping');
    return;
  }

  let totalSettled = 0;

  for (const [apiKey, games] of Object.entries(bySportKey)) {
    let scores;
    try {
      scores = await odd.fetchScoresForSport(apiKey);
    } catch (e) {
      console.error(`[autoSettle] Score fetch failed for ${apiKey}:`, e.message);
      continue;
    }

    console.log(`[autoSettle] ${apiKey}: fetched ${scores.length} completed scores from API`);

    for (const apiGame of scores) {
      if (!apiGame.completed) continue;

      const match = games.find(g => isSameGame(g, apiGame.home_team, apiGame.away_team));
      if (!match) continue;

      console.log(`[autoSettle] Match found: ${apiGame.home_team} vs ${apiGame.away_team} → stored as ${match.homeTeam} vs ${match.awayTeam}`);

      const winner = determineWinner(match, apiGame);
      if (!winner) {
        const sc = (apiGame.scores || []).map(s => `${s.name}:${s.score}`).join(', ');
        console.log(`[autoSettle] Could not determine winner for ${apiGame.home_team} vs ${apiGame.away_team} (scores: ${sc || 'none'}) — skipping`);
        continue;
      }

      const result = sb.settleGame(match.gameId, winner);
      if (!result.ok) {
        // Already settled or cancelled — just log if it's unexpected
        if (!result.error?.includes('Already settled')) {
          console.log(`[autoSettle] settleGame failed for ${match.homeTeam} vs ${match.awayTeam}: ${result.error}`);
        }
        continue;
      }

      // Credit all straight-bet winners and push balance update to their clients
      for (const [username, amount] of Object.entries(result.payouts)) {
        const r = us.addBonusByAdmin(username, amount);
        if (!r.ok) console.error(`[autoSettle] addBonusByAdmin failed for ${username}: ${r.error}`);
        if (r.ok && _io) _io.emit('balanceReset', { username, balance: r.balance });
        console.log(`[autoSettle] 💸 ${username} +$${amount.toLocaleString()} — ${match.homeTeam} vs ${match.awayTeam} (winner: ${winner})`);
      }

      // Settle any parlays that include this game
      const parlayPayouts = sb.settleParlayBets(match.gameId, winner);
      for (const [username, amount] of Object.entries(parlayPayouts)) {
        const r = us.addBonusByAdmin(username, amount);
        if (!r.ok) console.error(`[autoSettle] addBonusByAdmin (parlay) failed for ${username}: ${r.error}`);
        if (r.ok && _io) _io.emit('balanceReset', { username, balance: r.balance });
        console.log(`[autoSettle] 🎲 parlay payout: ${username} +$${amount.toLocaleString()} (game: ${match.homeTeam} vs ${match.awayTeam})`);
      }

      al.log('sports_auto_settle', {
        gameId:      match.gameId,
        winner,
        homeTeam:    match.homeTeam,
        awayTeam:    match.awayTeam,
        betsSettled: result.settled.length,
        totalPaid:   Object.values(result.payouts).reduce((a, b) => a + b, 0),
      });

      console.log(`[autoSettle] ✅ Settled: ${match.homeTeam} vs ${match.awayTeam} — Winner: ${winner} (${result.settled.length} bets)`);
      totalSettled++;
    }

    // Log any eligible games from this sport that had NO API match (name mismatch likely)
    for (const g of games) {
      const wasSettled = allGames.find(ag => ag.gameId === g.gameId)?.status !== 'open';
      if (!wasSettled) {
        const matched = scores.some(s => isSameGame(g, s.home_team, s.away_team));
        if (!matched) {
          console.log(`[autoSettle] ⚠️  No API match found for: ${g.sport} | ${g.homeTeam} vs ${g.awayTeam}`);
        }
      }
    }
  }

  if (totalSettled > 0) {
    console.log(`[autoSettle] 🏆 Auto-settled ${totalSettled} game(s) this run`);
  } else {
    console.log('[autoSettle] Run complete — 0 games settled this pass');
  }
}

// ── Auto-cancel started games with 0 bets (no API key needed) ────────────────
function cleanupZeroBetGames() {
  const allGames = sb.getGames(true);
  const now = Date.now();
  let cancelled = 0;
  for (const g of allGames) {
    if (g.status !== 'open') continue;
    if (new Date(g.startTime).getTime() >= now) continue; // not started yet
    const stats = sb.getGameBetStats(g.gameId);
    if (stats.betCount > 0) continue; // has real bets — let the API settle it
    sb.cancelGame(g.gameId);
    cancelled++;
    console.log(`[autoSettle] 🧹 Auto-cancelled 0-bet game: ${g.homeTeam} vs ${g.awayTeam}`);
  }
  if (cancelled > 0) console.log(`[autoSettle] Cleaned up ${cancelled} zero-bet game(s)`);
  return cancelled;
}

// ── Start the polling loop ────────────────────────────────────────────────────
function start(intervalMs = 15 * 60_000, io = null) { // default: every 15 minutes
  _io = io; // store socket.io instance for balance push notifications

  // Always run zero-bet cleanup on a schedule — no API key needed
  setTimeout(() => cleanupZeroBetGames(), 15_000); // 15s after boot
  setInterval(() => cleanupZeroBetGames(), intervalMs);

  if (!process.env.ODDS_API_KEY) {
    console.warn('[autoSettle] ⚠️  ODDS_API_KEY not set — score-based auto-settlement disabled. Zero-bet cleanup still runs.');
    return;
  }
  console.log(`[autoSettle] ✅ Started — checking scores every ${intervalMs / 60_000} min`);
  // Run once immediately after a short delay (let server fully start)
  setTimeout(() => {
    runAutoSettle().catch(e => console.error('[autoSettle] Error on first run:', e));
  }, 30_000);
  setInterval(() => {
    runAutoSettle().catch(e => console.error('[autoSettle] Error:', e));
  }, intervalMs);
}

module.exports = { start, runAutoSettle, cleanupZeroBetGames };
