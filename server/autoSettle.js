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
    .replace(/\bst\.?\b/g, 'saint')   // St. → saint
    .replace(/[^a-z0-9 ]/g, '')
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

// ── Core settle run ───────────────────────────────────────────────────────────
async function runAutoSettle() {
  // Get ALL games (including settled) then filter to open ones that have started
  const allGames = sb.getGames(true);
  const now = Date.now();
  // Only settle open games whose start time has already passed (give 10 min grace)
  const eligible = allGames.filter(g => g.status === 'open' && new Date(g.startTime).getTime() < now - 10 * 60_000);
  if (!eligible.length) return;

  // Group by API sport key
  const bySportKey = {};
  for (const g of eligible) {
    const apiKey = SPORT_KEY_MAP[g.sport];
    if (!apiKey) continue;
    if (!bySportKey[apiKey]) bySportKey[apiKey] = [];
    bySportKey[apiKey].push(g);
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

    for (const apiGame of scores) {
      if (!apiGame.completed) continue;

      const match = games.find(g => isSameGame(g, apiGame.home_team, apiGame.away_team));
      if (!match) continue;

      const winner = determineWinner(match, apiGame);
      if (!winner) {
        console.log(`[autoSettle] Could not determine winner for ${apiGame.home_team} vs ${apiGame.away_team} — skipping`);
        continue;
      }

      const result = sb.settleGame(match.gameId, winner);
      if (!result.ok) {
        // Already settled or cancelled — remove from future checks by just logging
        if (!result.error?.includes('Already settled')) {
          console.log(`[autoSettle] settleGame failed for ${match.homeTeam} vs ${match.awayTeam}: ${result.error}`);
        }
        continue;
      }

      // Credit all winners
      for (const [username, amount] of Object.entries(result.payouts)) {
        us.addBonusByAdmin(username, amount);
        console.log(`[autoSettle] 💸 ${username} +$${amount.toLocaleString()} — ${match.homeTeam} vs ${match.awayTeam} (winner: ${winner})`);
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
  }

  if (totalSettled > 0) {
    console.log(`[autoSettle] 🏆 Auto-settled ${totalSettled} game(s) this run`);
  }
}

// ── Start the polling loop ────────────────────────────────────────────────────
function start(intervalMs = 15 * 60_000) { // default: every 15 minutes
  if (!process.env.ODDS_API_KEY) {
    console.warn('[autoSettle] ⚠️  ODDS_API_KEY not set — auto-settlement disabled. Set it in Railway env vars.');
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

module.exports = { start, runAutoSettle };
