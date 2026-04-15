'use strict';
/**
 * autoSettle.js
 * =============
 * Polls ESPN (primary, no key needed) + The Odds API (fallback) for scores
 * every 5 minutes and automatically settles any completed open games.
 *
 * Flow:
 *  1. Cancel started games with 0 bets (no score lookup needed)
 *  2. For each eligible open game (started > 10 min ago):
 *     a. Try ESPN first — always free, no rate limit
 *     b. Fall back to Odds API if ESPN has no match
 *  3. Credit winners, emit balanceReset socket event, log everything
 */

const sb  = require('./sportsStore');
const us  = require('./userStore');
const al  = require('./adminLog');
const odd = require('./oddsAPI');
const espn = require('./espnAPI');

// Odds API sport key map (fallback only)
const ODDS_API_SPORT_MAP = {
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

// ── Team name normalization (shared by both ESPN + Odds API paths) ────────────
function normalizeTeam(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^\(\d+\)\s*/, '')       // strip seed prefix "(5) "
    .replace(/\bst\b\.?/g, 'saint')   // st / st. → saint
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\bstate\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamNick(name) {
  const parts = normalizeTeam(name).split(' ');
  return parts[parts.length - 1] || '';
}

function teamMatches(a, b) {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const nickA = teamNick(a), nickB = teamNick(b);
  if (nickA.length >= 4 && nickA === nickB) return true;
  return false;
}

function isSameGame(storedGame, apiHome, apiAway) {
  const homeMatch = teamMatches(storedGame.homeTeam, apiHome) && teamMatches(storedGame.awayTeam, apiAway);
  const swapMatch = teamMatches(storedGame.homeTeam, apiAway) && teamMatches(storedGame.awayTeam, apiHome);
  return homeMatch || swapMatch;
}

// ── Credit a winner and push balance update ───────────────────────────────────
function creditWinner(username, amount, label) {
  const r = us.addBonusByAdmin(username, amount);
  if (!r.ok) {
    console.error(`[autoSettle] ❌ addBonusByAdmin failed for ${username}: ${r.error}`);
    return;
  }
  if (_io) _io.emit('balanceReset', { username, balance: r.balance });
  console.log(`[autoSettle] 💸 ${label} ${username} +$${amount.toLocaleString()}`);
}

// ── Settle one game and pay out ───────────────────────────────────────────────
function doSettle(storedGame, winner, source) {
  const result = sb.settleGame(storedGame.gameId, winner);
  if (!result.ok) {
    if (!result.error?.includes('Already settled')) {
      console.log(`[autoSettle] settleGame failed: ${result.error}`);
    }
    return false;
  }

  for (const [username, amount] of Object.entries(result.payouts)) {
    creditWinner(username, amount, `[${source}]`);
  }

  // parlayPayouts are now embedded in settleGame result (atomic settlement)
  const parlayPayouts = result.parlayPayouts || {};
  for (const [username, amount] of Object.entries(parlayPayouts)) {
    creditWinner(username, amount, `[${source} parlay]`);
  }

  al.log('sports_auto_settle', {
    gameId:      storedGame.gameId,
    winner,
    source,
    homeTeam:    storedGame.homeTeam,
    awayTeam:    storedGame.awayTeam,
    betsSettled: result.settled.length,
    totalPaid:   Object.values(result.payouts).reduce((a, b) => a + b, 0),
  });

  console.log(`[autoSettle] ✅ [${source}] ${storedGame.homeTeam} vs ${storedGame.awayTeam} → ${winner} (${result.settled.length} bets)`);
  return true;
}

// ── Settle via Odds API (original path) ──────────────────────────────────────
async function settleViaOddsAPI(eligible) {
  const remaining = [...eligible];
  const settled   = new Set();

  // Group by sport key
  const bySport = {};
  for (const g of remaining) {
    const key = ODDS_API_SPORT_MAP[g.sport];
    if (!key) continue;
    if (!bySport[key]) bySport[key] = [];
    bySport[key].push(g);
  }

  for (const [apiKey, games] of Object.entries(bySport)) {
    let scores;
    try {
      scores = await odd.fetchScoresForSport(apiKey);
    } catch (e) {
      console.log(`[autoSettle] Odds API ${apiKey} failed: ${e.message}`);
      continue;
    }

    for (const apiGame of scores) {
      if (!apiGame.completed) continue;
      const match = games.find(g => isSameGame(g, apiGame.home_team, apiGame.away_team));
      if (!match || settled.has(match.gameId)) continue;

      // Determine winner from Odds API score data
      const { scores: sc, home_team, away_team } = apiGame;
      if (!sc || sc.length < 2) continue;
      const getScore = t => { const e = sc.find(s => teamMatches(s.name, t)); return e ? parseFloat(e.score) : NaN; };
      const hs = getScore(home_team), as_ = getScore(away_team);
      if (isNaN(hs) || isNaN(as_)) continue;

      let winner;
      if (hs === as_) {
        winner = match.odds?.draw != null ? 'Draw' : null;
      } else {
        const storedHomeIsApiHome = teamMatches(match.homeTeam, home_team);
        const apiHomeWon = hs > as_;
        winner = storedHomeIsApiHome
          ? (apiHomeWon ? match.homeTeam : match.awayTeam)
          : (apiHomeWon ? match.awayTeam : match.homeTeam);
      }

      if (!winner) continue;
      if (doSettle(match, winner, 'OddsAPI')) settled.add(match.gameId);
    }
  }

  return settled;
}

// ── Socket.io + concurrency guard ─────────────────────────────────────────────
let _io       = null;
let _settling = false;

// ── Auto-cancel started games with 0 bets ────────────────────────────────────
function cleanupZeroBetGames() {
  const allGames = sb.getGames(true);
  const now      = Date.now();
  let cancelled  = 0;
  for (const g of allGames) {
    if (g.status !== 'open') continue;
    if (new Date(g.startTime).getTime() >= now) continue;
    const stats = sb.getGameBetStats(g.gameId);
    if (stats.betCount > 0) continue; // has straight or parlay bets — skip
    const result = sb.cancelGame(g.gameId);
    if (!result.ok) continue;
    // Settle any parlay legs on this game (void the leg; pay out if all other legs are done)
    const parlayPayouts = sb.settleParlayBets(g.gameId, 'cancelled');
    for (const [username, amount] of Object.entries(parlayPayouts)) {
      const r = us.addBonusByAdmin(username, amount);
      if (r.ok && _io) _io.emit('balanceReset', { username, balance: r.balance });
      console.log(`[autoSettle] 🔄 Parlay void payout: ${username} +$${amount.toLocaleString()}`);
    }
    cancelled++;
    console.log(`[autoSettle] 🧹 Auto-cancelled 0-bet: ${g.homeTeam} vs ${g.awayTeam}`);
  }
  if (cancelled > 0) console.log(`[autoSettle] Cleaned up ${cancelled} zero-bet game(s)`);
  return cancelled;
}

// ── Auto-purge old settled/cancelled games ────────────────────────────────────
function purgeOldGames() {
  const KEEP_DAYS = 14;
  const cutoff    = Date.now() - KEEP_DAYS * 24 * 60 * 60_000;
  const allGames  = sb.getGames(true);
  const stale     = allGames.filter(g =>
    (g.status === 'settled' || g.status === 'cancelled') &&
    (g.settledAt || g.createdAt || 0) < cutoff
  );
  if (!stale.length) return;
  const r = sb.purgeHistory();
  console.log(`[autoSettle] 🗑️  Purged ${r.gamesRemoved} game(s), ${r.betsRemoved} bet record(s)`);
}

// ── Core settle run ───────────────────────────────────────────────────────────
async function runAutoSettle() {
  if (_settling) {
    console.log('[autoSettle] Already running — skipping');
    return;
  }
  _settling = true;

  try {
    // Step 1: clean up 0-bet games (no network needed)
    cleanupZeroBetGames();

    // Step 2: find eligible open games (started > 10 min ago)
    const allGames = sb.getGames(true);
    const now      = Date.now();
    const eligible = allGames.filter(
      g => g.status === 'open' && new Date(g.startTime).getTime() < now - 10 * 60_000
    );

    console.log(`[autoSettle] Run — ${allGames.length} total, ${eligible.length} eligible for settlement`);
    if (!eligible.length) return;

    eligible.forEach(g =>
      console.log(`[autoSettle]   → ${g.sport} | ${g.homeTeam} vs ${g.awayTeam}`)
    );

    const settled = new Set();

    // ── Step 3: ESPN (primary — no API key, no rate limit) ────────────────────
    espn.clearCache();
    console.log('[autoSettle] Fetching scores from ESPN…');

    // Group eligible games by ESPN sport path
    const espnSportMap = Object.fromEntries(espn.SPORTS.map(s => [s.name, s]));

    for (const g of eligible) {
      if (settled.has(g.gameId)) continue;
      const sportConfig = espnSportMap[g.sport];
      if (!sportConfig) continue;

      let espnGames;
      try {
        espnGames = await espn.fetchCompletedGames(sportConfig, 7);
      } catch (e) {
        console.log(`[autoSettle] ESPN ${g.sport} fetch failed: ${e.message}`);
        continue;
      }

      const match = espnGames.find(eg => isSameGame(g, eg.homeTeam, eg.awayTeam));
      if (!match) continue;

      let winner = match.winner;
      // For soccer draws — only settle as Draw if we have draw odds
      if (winner === 'Draw' && g.odds?.draw == null) {
        console.log(`[autoSettle] ESPN: ${g.homeTeam} vs ${g.awayTeam} is a draw but no draw odds — skipping`);
        continue;
      }
      // Map ESPN winner name back to our stored team name
      if (winner && winner !== 'Draw') {
        if (teamMatches(g.homeTeam, winner))      winner = g.homeTeam;
        else if (teamMatches(g.awayTeam, winner)) winner = g.awayTeam;
        else {
          console.log(`[autoSettle] ESPN winner "${winner}" doesn't match stored teams — skipping`);
          continue;
        }
      }

      if (winner && doSettle(g, winner, 'ESPN')) settled.add(g.gameId);
    }

    // ── Step 4: Odds API fallback for anything ESPN didn't cover ─────────────
    const remaining = eligible.filter(g => !settled.has(g.gameId));
    if (remaining.length > 0) {
      console.log(`[autoSettle] ESPN missed ${remaining.length} game(s) — trying Odds API fallback…`);
      odd.clearScoresCache();
      const oddsSettled = await settleViaOddsAPI(remaining);
      oddsSettled.forEach(id => settled.add(id));
    }

    // ── Step 5: warn about anything still unsettled ───────────────────────────
    const stillOpen = eligible.filter(g => !settled.has(g.gameId));
    if (stillOpen.length > 0) {
      stillOpen.forEach(g =>
        console.log(`[autoSettle] ⚠️  Could not auto-settle: ${g.sport} | ${g.homeTeam} vs ${g.awayTeam} — settle manually`)
      );
    }

    console.log(`[autoSettle] Done — ${settled.size} settled this pass`);
  } finally {
    _settling = false;
  }
}

// ── Start the polling loop ────────────────────────────────────────────────────
function start(intervalMs = 5 * 60_000, io = null) {
  _io = io;

  // Zero-bet cleanup + purge — run 20s after boot, then on schedule
  setTimeout(() => { cleanupZeroBetGames(); purgeOldGames(); }, 20_000);

  console.log(`[autoSettle] ✅ Started — polling every ${intervalMs / 60_000} min (ESPN primary + Odds API fallback)`);

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
