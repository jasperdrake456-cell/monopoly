'use strict';
/**
 * autoSync.js
 * ===========
 * Automatically fetches upcoming games from The Odds API and adds any
 * new ones to the sportsbook every 6 hours.
 *
 * Requires: ODDS_API_KEY env var (same key used by autoSettle / oddsAPI).
 * Safe to run repeatedly — duplicate detection skips already-added games.
 */

const https = require('https');
const sb    = require('./sportsStore');
const al    = require('./adminLog');

const ODDS_BASE = 'https://api.the-odds-api.com/v4';

// Sports to sync — covers March Madness, NBA, NHL, EPL, Champions League, MLB, MMA
const SPORTS = [
  { key: 'basketball_ncaab',           name: 'NCAAB',                   emoji: '🏀' },
  { key: 'basketball_nba',             name: 'NBA',                     emoji: '🏀' },
  { key: 'icehockey_nhl',              name: 'NHL',                     emoji: '🏒' },
  { key: 'baseball_mlb',               name: 'MLB',                     emoji: '⚾' },
  { key: 'soccer_epl',                 name: 'Premier League',          emoji: '⚽' },
  { key: 'soccer_uefa_champs_league',  name: 'UEFA Champions League',   emoji: '⚽' },
  { key: 'americanfootball_nfl',       name: 'NFL',                     emoji: '🏈' },
  { key: 'mma_mixed_martial_arts',     name: 'MMA',                     emoji: '🥊' },
];

// How far ahead to pull games (days)
const DAYS_AHEAD = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Invalid JSON from Odds API')); }
      });
    }).on('error', reject);
  });
}

function extractOdds(game) {
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

// ── Duplicate detection (same fuzzy logic as autoSettle) ─────────────────────

function normalizeTeam(name) {
  return (name || '')
    .toLowerCase()
    .replace(/^\(\d+\)\s*/, '')      // strip seed prefix "(5) "
    .replace(/\bst\b\.?/g, 'saint') // st / st. → saint
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\bstate\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamMatches(a, b) {
  const na = normalizeTeam(a), nb = normalizeTeam(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Nickname match: last word only (needs length ≥ 4 to avoid false positives)
  const nickA = na.split(' ').pop();
  const nickB = nb.split(' ').pop();
  if (nickA.length >= 4 && nickA === nickB) return true;
  return false;
}

function isDuplicate(existingGames, homeTeam, awayTeam) {
  return existingGames.some(g => {
    const homeAway = teamMatches(g.homeTeam, homeTeam) && teamMatches(g.awayTeam, awayTeam);
    const swapped  = teamMatches(g.homeTeam, awayTeam) && teamMatches(g.awayTeam, homeTeam);
    return homeAway || swapped;
  });
}

// ── Core sync run ─────────────────────────────────────────────────────────────

let _syncing = false;

async function runAutoSync() {
  const API_KEY = process.env.ODDS_API_KEY || '358b60a6e8223a596d99cb0dc8fe6716';
  if (!API_KEY) return;

  if (_syncing) {
    console.log('[autoSync] Already running — skipping this tick');
    return;
  }
  _syncing = true;

  try {
    const cutoff = new Date(Date.now() + DAYS_AHEAD * 86_400_000);
    const now    = new Date();

    // Load all existing open games (for duplicate check)
    const allGames   = sb.getGames(true);
    const openGames  = allGames.filter(g => g.status === 'open');

    let totalAdded   = 0;
    let totalSkipped = 0;
    let apiRequests  = 0;

    for (const sport of SPORTS) {
      let raw;
      try {
        const url = `${ODDS_BASE}/sports/${sport.key}/odds` +
          `?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
        raw = await fetchJSON(url);
        apiRequests++;
      } catch (e) {
        // Sport might be off-season — just skip it
        if (e.message.includes('401') || e.message.includes('Unauthorized')) {
          console.error(`[autoSync] ❌ Invalid API key — stopping sync`);
          return;
        }
        console.log(`[autoSync] ${sport.name}: fetch failed (${e.message}) — skipping`);
        continue;
      }

      if (!Array.isArray(raw)) {
        // API returns an error object when sport is off-season
        if (raw && raw.message) {
          console.log(`[autoSync] ${sport.name}: ${raw.message} — skipping`);
        }
        continue;
      }

      // Filter to games starting within our window
      const upcoming = raw.filter(g => {
        const t = new Date(g.commence_time);
        return t > now && t <= cutoff;
      });

      let sportAdded = 0;
      for (const g of upcoming) {
        const odds = extractOdds(g);
        if (!odds) continue; // no odds available yet

        if (isDuplicate(openGames, g.home_team, g.away_team)) {
          totalSkipped++;
          continue;
        }

        const game = {
          sport:      sport.name,
          sportEmoji: sport.emoji,
          homeTeam:   g.home_team,
          awayTeam:   g.away_team,
          odds,
          startTime:  new Date(g.commence_time).toISOString(),
        };

        const result = sb.createGame(game);
        if (result.ok) {
          // Push to openGames so subsequent sports in this loop don't re-add the same game
          openGames.push({ ...game, status: 'open', gameId: result.game.gameId });
          sportAdded++;
          totalAdded++;
        }
      }

      if (sportAdded > 0) {
        console.log(`[autoSync] ✅ ${sport.name}: added ${sportAdded} new game(s)`);
      }
    }

    if (totalAdded > 0 || totalSkipped === 0) {
      console.log(`[autoSync] Done — ${totalAdded} added, ${totalSkipped} already existed (${apiRequests} API calls)`);
      if (totalAdded > 0) {
        al.log('sports_auto_sync', { gamesAdded: totalAdded, skipped: totalSkipped });
      }
    }
  } catch (e) {
    console.error('[autoSync] Unexpected error:', e.message);
  } finally {
    _syncing = false;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

function start(intervalMs = 6 * 60 * 60_000) { // default: every 6 hours
  const key = process.env.ODDS_API_KEY || '358b60a6e8223a596d99cb0dc8fe6716';
  if (!key) {
    console.warn('[autoSync] ⚠️  No Odds API key — automatic game syncing disabled.');
    return;
  }

  console.log(`[autoSync] ✅ Started — syncing games every ${intervalMs / 3_600_000}h (next ${DAYS_AHEAD} days)`);

  // Run once at startup after a short delay
  setTimeout(() => {
    runAutoSync().catch(e => console.error('[autoSync] Error on first run:', e));
  }, 10_000); // 10 seconds after boot

  // Then on a recurring schedule
  setInterval(() => {
    runAutoSync().catch(e => console.error('[autoSync] Error:', e));
  }, intervalMs);
}

module.exports = { start, runAutoSync };
