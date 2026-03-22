'use strict';
/**
 * autoSync.js
 * ===========
 * Fetches upcoming games every 6 hours and adds new ones to the sportsbook.
 *
 * Sources (in order):
 *  1. ESPN (primary) — free, no key, covers ALL sports including March Madness
 *     Provides game schedule + odds (DraftKings moneylines) when available.
 *  2. The Odds API (supplement) — used only to fill in odds for ESPN games
 *     that have no moneyline data (e.g., NCAAB, NHL).
 *
 * Safe to run repeatedly — duplicate detection skips already-added games.
 */

const https = require('https');
const sb    = require('./sportsStore');
const al    = require('./adminLog');
const espn  = require('./espnAPI');

const DAYS_AHEAD = 3;
const ODDS_BASE  = 'https://api.the-odds-api.com/v4';

// ── The Odds API helpers (for filling in missing odds) ────────────────────────

// Map our sport names → Odds API keys
const ODDS_API_MAP = {
  'NCAAB':                 'basketball_ncaab',
  'NBA':                   'basketball_nba',
  'NHL':                   'icehockey_nhl',
  'MLB':                   'baseball_mlb',
  'NFL':                   'americanfootball_nfl',
  'Premier League':        'soccer_epl',
  'UEFA Champions League': 'soccer_uefa_champs_league',
  'MMA':                   'mma_mixed_martial_arts',
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Non-JSON response from Odds API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Odds API timeout')); });
  });
}

function extractOddsFromOddsAPI(game) {
  for (const bm of game.bookmakers || []) {
    const h2h = (bm.markets || []).find(m => m.key === 'h2h');
    if (!h2h) continue;
    const out = {};
    for (const o of h2h.outcomes) {
      if (o.name === game.home_team)      out.home = o.price;
      else if (o.name === game.away_team) out.away = o.price;
      else                                out.draw = o.price;
    }
    if (out.home != null && out.away != null) return out;
  }
  return null;
}

/** Fetch odds for one sport from The Odds API. Returns map: normalizedKey → odds */
async function fetchOddsAPIForSport(apiKey) {
  const API_KEY = process.env.ODDS_API_KEY || '358b60a6e8223a596d99cb0dc8fe6716';
  const url = `${ODDS_BASE}/sports/${apiKey}/odds` +
    `?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
  const raw = await fetchJSON(url);
  if (!Array.isArray(raw)) return {};

  // Build map: "home_team|away_team" → odds
  const map = {};
  for (const g of raw) {
    const odds = extractOddsFromOddsAPI(g);
    if (!odds) continue;
    const key = `${g.home_team.toLowerCase()}|${g.away_team.toLowerCase()}`;
    map[key] = odds;
  }
  return map;
}

// ── Duplicate detection (same fuzzy logic as autoSettle) ─────────────────────

function normalizeTeam(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\bst\b\.?/g, 'saint')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\bstate\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamMatches(a, b) {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const nickA = na.split(' ').pop(), nickB = nb.split(' ').pop();
  if (nickA.length >= 4 && nickA === nickB) return true;
  return false;
}

function isDuplicate(existingGames, homeTeam, awayTeam) {
  return existingGames.some(g => {
    const ha = teamMatches(g.homeTeam, homeTeam) && teamMatches(g.awayTeam, awayTeam);
    const sw = teamMatches(g.homeTeam, awayTeam) && teamMatches(g.awayTeam, homeTeam);
    return ha || sw;
  });
}

// ── Fallback odds: generate reasonable American moneylines when none available ─
// Used for NCAAB/NHL when neither ESPN nor Odds API has odds (e.g. off-season, low-profile games)
function fallbackOdds() {
  return { home: -110, away: -110 }; // pick 'em
}

// ── Core sync run ─────────────────────────────────────────────────────────────
let _syncing = false;

async function runAutoSync() {
  if (_syncing) {
    console.log('[autoSync] Already running — skipping');
    return;
  }
  _syncing = true;

  try {
    // Load all currently open games for duplicate detection
    const allGames  = sb.getGames(true);
    const openGames = allGames.filter(g => g.status === 'open');
    console.log(`[autoSync] Starting sync — ${openGames.length} open games already in book`);

    let totalAdded   = 0;
    let totalSkipped = 0;

    // Pre-fetch Odds API data for all sports in one pass (to supplement ESPN odds)
    const oddsAPIData = {}; // sportName → odds map
    for (const sport of espn.SPORTS) {
      const apiKey = ODDS_API_MAP[sport.name];
      if (!apiKey) continue;
      try {
        oddsAPIData[sport.name] = await fetchOddsAPIForSport(apiKey);
      } catch (e) {
        oddsAPIData[sport.name] = {};
        // Not fatal — ESPN odds or fallback will be used
      }
    }

    // Fetch all upcoming games from ESPN
    for (const sportConfig of espn.SPORTS) {
      console.log(`[autoSync] 🔍 ESPN ${sportConfig.name}…`);
      let upcoming;
      try {
        upcoming = await espn.fetchUpcomingGames(sportConfig, DAYS_AHEAD);
      } catch (e) {
        console.log(`[autoSync] ESPN ${sportConfig.name} failed: ${e.message}`);
        continue;
      }

      console.log(`[autoSync]    ${upcoming.length} upcoming game(s)`);

      let sportAdded = 0;
      for (const g of upcoming) {
        if (isDuplicate(openGames, g.homeTeam, g.awayTeam)) {
          totalSkipped++;
          continue;
        }

        // Resolve odds: ESPN → Odds API → fallback
        let odds = g.odds; // ESPN moneyline (available for NBA, NFL, MLB)

        if (!odds) {
          // Try Odds API
          const oddsMap = oddsAPIData[sportConfig.name] || {};
          const key = `${g.homeTeam.toLowerCase()}|${g.awayTeam.toLowerCase()}`;
          const swapKey = `${g.awayTeam.toLowerCase()}|${g.homeTeam.toLowerCase()}`;
          if (oddsMap[key]) {
            odds = oddsMap[key];
          } else if (oddsMap[swapKey]) {
            // Odds API has teams swapped — flip home/away
            const o = oddsMap[swapKey];
            odds = { home: o.away, away: o.home, ...(o.draw ? { draw: o.draw } : {}) };
          }
        }

        if (!odds) {
          // Neither source has odds — use equal-line fallback so game can still be bet
          odds = fallbackOdds();
          console.log(`[autoSync]    ⚠️  No odds found for ${g.homeTeam} vs ${g.awayTeam} — using pick'em (-110/-110)`);
        }

        const game = {
          sport:      sportConfig.name,
          sportEmoji: sportConfig.emoji,
          homeTeam:   g.homeTeam,
          awayTeam:   g.awayTeam,
          odds,
          startTime:  g.startTime,
        };

        const result = sb.createGame(game);
        if (result.ok) {
          openGames.push({ ...game, status: 'open', gameId: result.game.gameId });
          sportAdded++;
          totalAdded++;
          console.log(`[autoSync]    ✅ ${g.homeTeam} (${odds.home > 0 ? '+' : ''}${odds.home}) vs ${g.awayTeam} (${odds.away > 0 ? '+' : ''}${odds.away})`);
        } else {
          console.log(`[autoSync]    ❌ Failed to add ${g.homeTeam} vs ${g.awayTeam}: ${result.error}`);
        }
      }

      if (sportAdded === 0 && upcoming.length > 0) {
        console.log(`[autoSync]    ⏭️  All ${upcoming.length} game(s) already in book`);
      }
    }

    console.log(`[autoSync] Done — ${totalAdded} added, ${totalSkipped} already existed`);

    if (totalAdded > 0) {
      al.log('sports_auto_sync', { gamesAdded: totalAdded, skipped: totalSkipped, source: 'ESPN+OddsAPI' });
    }
  } catch (e) {
    console.error('[autoSync] Unexpected error:', e.message);
  } finally {
    _syncing = false;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
function start(intervalMs = 6 * 60 * 60_000) {
  console.log(`[autoSync] ✅ Started — syncing every ${intervalMs / 3_600_000}h via ESPN (next ${DAYS_AHEAD} days)`);

  // Run 10s after boot
  setTimeout(() => {
    runAutoSync().catch(e => console.error('[autoSync] Error on first run:', e));
  }, 10_000);

  // Then every N hours
  setInterval(() => {
    runAutoSync().catch(e => console.error('[autoSync] Error:', e));
  }, intervalMs);
}

module.exports = { start, runAutoSync };
