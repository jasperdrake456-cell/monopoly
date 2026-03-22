'use strict';
/**
 * espnAPI.js
 * ==========
 * Fetches sports data from ESPN's unofficial public API — no API key required.
 *
 * Used by autoSync (game discovery) and autoSettle (score-based settlement)
 * as the primary/fallback data source alongside The Odds API.
 *
 * ESPN scoreboard: https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
 * Supports: NBA, NCAAB, NHL, NFL, MLB, EPL, Champions League
 */

const https = require('https');

// ── Sport configs ─────────────────────────────────────────────────────────────
// espnPath: used in URL   name: matches our sportsStore sport names
const SPORTS = [
  { espnPath: 'basketball/mens-college-basketball', name: 'NCAAB',                   emoji: '🏀' },
  { espnPath: 'basketball/nba',                     name: 'NBA',                     emoji: '🏀' },
  { espnPath: 'hockey/nhl',                         name: 'NHL',                     emoji: '🏒' },
  { espnPath: 'baseball/mlb',                       name: 'MLB',                     emoji: '⚾' },
  { espnPath: 'football/nfl',                       name: 'NFL',                     emoji: '🏈' },
  { espnPath: 'soccer/eng.1',                       name: 'Premier League',          emoji: '⚽' },
  { espnPath: 'soccer/uefa.champions',              name: 'UEFA Champions League',   emoji: '⚽' },
];

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Cache: path+date → { data, fetchedAt }
const _cache = new Map();
const CACHE_TTL = 2 * 60_000; // 2 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GameVault/1.0)',
        'Accept': 'application/json',
      },
    }, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`ESPN returned non-JSON (${res.statusCode}): ${raw.slice(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('ESPN request timed out')); });
  });
}

/** Format Date as YYYYMMDD for ESPN query params */
function toESPNDate(d) {
  const y  = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}`;
}

/** Fetch ESPN scoreboard for one sport on one date (with in-memory cache) */
async function fetchScoreboard(espnPath, dateStr = null) {
  const url = `${ESPN_BASE}/${espnPath}/scoreboard` + (dateStr ? `?dates=${dateStr}` : '');
  const cacheKey = url;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) return hit.data;

  const data = await fetchJSON(url);
  _cache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

function clearCache() {
  _cache.clear();
}

// ── Parse a competition into a normalised game object ─────────────────────────

/**
 * Returns null if we can't extract required fields.
 * Normalised shape:
 * {
 *   id, name, sport, emoji, espnPath,
 *   homeTeam, awayTeam,
 *   startTime (ISO string),
 *   completed (bool),
 *   winner (team name | null),
 *   homeScore (number | null), awayScore (number | null),
 *   odds: { home (American), away, draw? } | null,
 * }
 */
function parseEvent(event, sportConfig) {
  const comp = (event.competitions || [])[0];
  if (!comp) return null;

  // Teams
  const home = comp.competitors?.find(c => c.homeAway === 'home');
  const away = comp.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away) return null;

  const homeTeam = home.team?.displayName;
  const awayTeam = away.team?.displayName;
  if (!homeTeam || !awayTeam) return null;

  // Status
  const status    = comp.status?.type;
  const completed = status?.completed === true;
  const state     = status?.state; // 'pre' | 'in' | 'post'

  // Scores (only meaningful when completed or in-progress)
  const homeScore = completed || state === 'in' ? parseFloat(home.score) : null;
  const awayScore = completed || state === 'in' ? parseFloat(away.score) : null;

  // Winner — ESPN sets competitor.winner = true on the winning team
  let winner = null;
  if (completed) {
    if (home.winner === true)       winner = homeTeam;
    else if (away.winner === true)  winner = awayTeam;
    else if (!isNaN(homeScore) && !isNaN(awayScore)) {
      // Fall back to score comparison if winner flag missing
      if (homeScore > awayScore)      winner = homeTeam;
      else if (awayScore > homeScore) winner = awayTeam;
      else                            winner = 'Draw';
    }
  }

  // Odds (DraftKings / ESPN BET — available for NBA, NFL, MLB)
  let odds = null;
  const oddsArr = comp.odds;
  if (Array.isArray(oddsArr) && oddsArr.length > 0) {
    const o = oddsArr[0]; // first provider
    const homeML = parseInt(o.moneyline?.home?.close?.odds ?? o.moneyline?.home?.open?.odds, 10);
    const awayML = parseInt(o.moneyline?.away?.close?.odds ?? o.moneyline?.away?.open?.odds, 10);
    if (!isNaN(homeML) && !isNaN(awayML)) {
      odds = { home: homeML, away: awayML };
    }
  }

  return {
    id:        event.id,
    name:      event.name,
    sport:     sportConfig.name,
    emoji:     sportConfig.emoji,
    espnPath:  sportConfig.espnPath,
    homeTeam,
    awayTeam,
    startTime: comp.startDate || event.date,
    completed,
    state,
    winner,
    homeScore,
    awayScore,
    odds,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all completed games for a given sport going back `daysBack` days.
 * Returns array of parsed game objects with winner set.
 */
async function fetchCompletedGames(sportConfig, daysBack = 7) {
  const results = [];
  const now = new Date();

  // Build list of dates to check (today + past N days)
  const dates = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(toESPNDate(d));
  }

  // Fetch each date (ESPN paginates by date for past games)
  // Use a Set to avoid duplicate event IDs across date pages
  const seen = new Set();

  for (const dateStr of dates) {
    let data;
    try { data = await fetchScoreboard(sportConfig.espnPath, dateStr); }
    catch (e) {
      console.log(`[espnAPI] ${sportConfig.name} ${dateStr}: ${e.message}`);
      continue;
    }

    for (const event of (data.events || [])) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);

      const game = parseEvent(event, sportConfig);
      if (game?.completed && game.winner) results.push(game);
    }
  }

  return results;
}

/**
 * Fetch upcoming (not yet started) games for a sport, up to `daysAhead` days.
 * Returns array of parsed game objects (completed=false).
 */
async function fetchUpcomingGames(sportConfig, daysAhead = 3) {
  const results = [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86_400_000);
  const seen = new Set();

  // Check today + next N days
  const dates = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toESPNDate(d));
  }

  for (const dateStr of dates) {
    let data;
    try { data = await fetchScoreboard(sportConfig.espnPath, dateStr); }
    catch (e) {
      console.log(`[espnAPI] ${sportConfig.name} ${dateStr}: ${e.message}`);
      continue;
    }

    for (const event of (data.events || [])) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);

      const game = parseEvent(event, sportConfig);
      if (!game) continue;

      const start = new Date(game.startTime);
      if (start <= now || start > cutoff) continue; // must be future and within window
      if (game.state === 'post') continue; // already finished

      results.push(game);
    }
  }

  return results;
}

/**
 * Fetch completed scores across ALL sports, returning a flat list.
 * Used by autoSettle as a primary/fallback score source.
 */
async function fetchAllCompletedScores(daysBack = 7) {
  const all = [];
  for (const sport of SPORTS) {
    try {
      const games = await fetchCompletedGames(sport, daysBack);
      all.push(...games);
    } catch (e) {
      console.log(`[espnAPI] fetchAllCompletedScores ${sport.name}: ${e.message}`);
    }
  }
  return all;
}

/**
 * Fetch all upcoming games across ALL sports within daysAhead.
 */
async function fetchAllUpcomingGames(daysAhead = 3) {
  const all = [];
  for (const sport of SPORTS) {
    try {
      const games = await fetchUpcomingGames(sport, daysAhead);
      all.push(...games);
    } catch (e) {
      console.log(`[espnAPI] fetchAllUpcomingGames ${sport.name}: ${e.message}`);
    }
  }
  return all;
}

module.exports = {
  SPORTS,
  fetchScoreboard,
  fetchCompletedGames,
  fetchUpcomingGames,
  fetchAllCompletedScores,
  fetchAllUpcomingGames,
  clearCache,
};
