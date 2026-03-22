'use strict';
/**
 * autoSettle.js
 * Polls The Odds API scores every 5 minutes.
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

// ── Team name normalization ───────────────────────────────────────────────────
function normalizeTeam(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^\(\d+\)\s*/, '')        // strip "(5) " seed prefix
    .replace(/\bst\b\.?/g, 'saint')    // st / st. → saint
    .replace(/[^a-z0-9 ]/g, '')        // remove special chars
    .replace(/\bstate\b/g, 'st')       // "Wright State" → "wright st"
    .replace(/\s+/g, ' ')
    .trim();
}

// Return last word (nickname) of a team name: "Golden State Warriors" → "warriors"
function teamNick(name) {
  const parts = normalizeTeam(name).split(' ');
  return parts[parts.length - 1] || '';
}

// Fuzzy match: exact, contains, or last-word (nickname) matches
function teamMatches(a, b) {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Nickname match: "Warriors" ↔ "Golden State Warriors"
  const nickA = teamNick(a), nickB = teamNick(b);
  if (nickA.length >= 4 && nickA === nickB) return true;
  return false;
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

  const getScore = (teamName) => {
    const entry = scores.find(s => teamMatches(s.name, teamName));
    return entry != null ? parseFloat(entry.score) : NaN;
  };

  const homeScore = getScore(home_team);
  const awayScore = getScore(away_team);
  if (isNaN(homeScore) || isNaN(awayScore)) return null;

  const isDraw = homeScore === awayScore;
  const storedHomeIsApiHome = teamMatches(storedGame.homeTeam, home_team);

  if (isDraw) {
    return storedGame.odds?.draw != null ? 'Draw' : null;
  }

  const apiHomeWon = homeScore > awayScore;
  if (storedHomeIsApiHome) {
    return apiHomeWon ? storedGame.homeTeam : storedGame.awayTeam;
  } else {
    return apiHomeWon ? storedGame.awayTeam : storedGame.homeTeam;
  }
}

// ── Socket.io instance ────────────────────────────────────────────────────────
let _io = null;

// ── Concurrent-run guard ──────────────────────────────────────────────────────
let _settling = false;

// ── Auto-cancel started games with 0 bets (no API key needed) ────────────────
function cleanupZeroBetGames() {
  const allGames = sb.getGames(true);
  const now = Date.now();
  let cancelled = 0;
  for (const g of allGames) {
    if (g.status !== 'open') continue;
    if (new Date(g.startTime).getTime() >= now) continue;
    const stats = sb.getGameBetStats(g.gameId);
    if (stats.betCount > 0) continue;
    sb.cancelGame(g.gameId);
    cancelled++;
    console.log(`[autoSettle] 🧹 Auto-cancelled 0-bet game: ${g.homeTeam} vs ${g.awayTeam}`);
  }
  if (cancelled > 0) console.log(`[autoSettle] Cleaned up ${cancelled} zero-bet game(s)`);
  return cancelled;
}

// ── Auto-purge old settled/cancelled games (keep DB lean) ────────────────────
function purgeOldGames() {
  const KEEP_DAYS = 14; // remove settled/cancelled games older than 14 days
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60_000;
  const allGames = sb.getGames(true);
  const stale = allGames.filter(g =>
    (g.status === 'settled' || g.status === 'cancelled') &&
    (g.settledAt || g.createdAt || 0) < cutoff
  );
  if (!stale.length) return;
  const result = sb.purgeHistory();
  console.log(`[autoSettle] 🗑️  Purged ${result.gamesRemoved} old game(s) and ${result.betsRemoved} bet record(s)`);
}

// ── Core settle run ───────────────────────────────────────────────────────────
async function runAutoSettle() {
  if (_settling) {
    console.log('[autoSettle] Already running — skipping this tick');
    return;
  }
  _settling = true;

  try {
    // Step 1: cancel started 0-bet games (no API key needed)
    cleanupZeroBetGames();

    // Step 2: bail early if no API key
    if (!process.env.ODDS_API_KEY) return;

    // Step 3: bust cache and fetch fresh scores
    odd.clearScoresCache();

    const allGames = sb.getGames(true);
    const now = Date.now();
    // 10-min grace after start time before we try to settle
    const eligible = allGames.filter(
      g => g.status === 'open' && new Date(g.startTime).getTime() < now - 10 * 60_000
    );

    console.log(`[autoSettle] Run — ${allGames.length} total, ${eligible.length} eligible`);
    if (!eligible.length) {
      console.log('[autoSettle] Nothing to settle');
      return;
    }

    eligible.forEach(g =>
      console.log(`[autoSettle]   → ${g.sport} | ${g.homeTeam} vs ${g.awayTeam} | start:${g.startTime}`)
    );

    // Group by API sport key
    const bySportKey = {};
    for (const g of eligible) {
      const apiKey = SPORT_KEY_MAP[g.sport];
      if (!apiKey) {
        console.warn(`[autoSettle] No API mapping for sport "${g.sport}" — skipping`);
        continue;
      }
      if (!bySportKey[apiKey]) bySportKey[apiKey] = [];
      bySportKey[apiKey].push(g);
    }

    if (!Object.keys(bySportKey).length) return;

    let totalSettled = 0;

    for (const [apiKey, games] of Object.entries(bySportKey)) {
      let scores;
      try {
        scores = await odd.fetchScoresForSport(apiKey);
      } catch (e) {
        console.error(`[autoSettle] Score fetch failed for ${apiKey}:`, e.message);
        continue;
      }

      console.log(`[autoSettle] ${apiKey}: ${scores.length} completed scores`);

      // Settle matched games
      for (const apiGame of scores) {
        if (!apiGame.completed) continue;

        const match = games.find(g => isSameGame(g, apiGame.home_team, apiGame.away_team));
        if (!match) continue;

        console.log(`[autoSettle] Match: ${apiGame.home_team} vs ${apiGame.away_team}`);

        const winner = determineWinner(match, apiGame);
        if (!winner) {
          const sc = (apiGame.scores || []).map(s => `${s.name}:${s.score}`).join(', ');
          console.log(`[autoSettle] Could not determine winner (scores: ${sc || 'none'}) — skipping`);
          continue;
        }

        const result = sb.settleGame(match.gameId, winner);
        if (!result.ok) {
          if (!result.error?.includes('Already settled')) {
            console.log(`[autoSettle] settleGame failed: ${result.error}`);
          }
          continue;
        }

        // Credit straight-bet winners
        for (const [username, amount] of Object.entries(result.payouts)) {
          const r = us.addBonusByAdmin(username, amount);
          if (!r.ok) console.error(`[autoSettle] addBonusByAdmin failed for ${username}: ${r.error}`);
          if (r.ok && _io) _io.emit('balanceReset', { username, balance: r.balance });
          console.log(`[autoSettle] 💸 ${username} +$${amount.toLocaleString()} (${match.homeTeam} vs ${match.awayTeam} → ${winner})`);
        }

        // Settle parlays
        const parlayPayouts = sb.settleParlayBets(match.gameId, winner);
        for (const [username, amount] of Object.entries(parlayPayouts)) {
          const r = us.addBonusByAdmin(username, amount);
          if (!r.ok) console.error(`[autoSettle] parlay addBonusByAdmin failed for ${username}: ${r.error}`);
          if (r.ok && _io) _io.emit('balanceReset', { username, balance: r.balance });
          console.log(`[autoSettle] 🎲 parlay: ${username} +$${amount.toLocaleString()}`);
        }

        al.log('sports_auto_settle', {
          gameId:      match.gameId,
          winner,
          homeTeam:    match.homeTeam,
          awayTeam:    match.awayTeam,
          betsSettled: result.settled.length,
          totalPaid:   Object.values(result.payouts).reduce((a, b) => a + b, 0),
        });

        console.log(`[autoSettle] ✅ ${match.homeTeam} vs ${match.awayTeam} → ${winner} (${result.settled.length} bets)`);
        totalSettled++;
      }

      // Warn about unmatched eligible games
      for (const g of games) {
        const stillOpen = sb.getGames(true).find(ag => ag.gameId === g.gameId)?.status === 'open';
        if (stillOpen) {
          const matched = scores.some(s => isSameGame(g, s.home_team, s.away_team));
          if (!matched) {
            console.log(`[autoSettle] ⚠️  No API match: ${g.sport} | ${g.homeTeam} vs ${g.awayTeam} — settle manually`);
          }
        }
      }
    }

    console.log(`[autoSettle] Done — ${totalSettled} settled this pass`);
  } finally {
    _settling = false;
  }
}

// ── Start the polling loop ────────────────────────────────────────────────────
function start(intervalMs = 5 * 60_000, io = null) {
  _io = io;

  // Zero-bet cleanup + purge — run 20s after boot, then on every interval tick
  setTimeout(() => {
    cleanupZeroBetGames();
    purgeOldGames();
  }, 20_000);

  if (!process.env.ODDS_API_KEY) {
    console.warn('[autoSettle] ⚠️  ODDS_API_KEY not set — score-based settlement disabled. Zero-bet cleanup still runs.');
    setInterval(() => { cleanupZeroBetGames(); purgeOldGames(); }, intervalMs);
    return;
  }

  console.log(`[autoSettle] ✅ Started — polling every ${intervalMs / 60_000} min`);

  // First full run 30s after boot
  setTimeout(() => {
    runAutoSettle().catch(e => console.error('[autoSettle] Error on first run:', e));
  }, 30_000);

  // Recurring: settle + cleanup + purge
  setInterval(() => {
    runAutoSettle().catch(e => console.error('[autoSettle] Error:', e));
    purgeOldGames();
  }, intervalMs);
}

module.exports = { start, runAutoSettle, cleanupZeroBetGames, purgeOldGames };
