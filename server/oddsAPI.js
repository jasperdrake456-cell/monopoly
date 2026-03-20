'use strict';

const https = require('https');

const API_KEY  = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Sports to track
const SPORTS = [
  { key: 'americanfootball_nfl',     name: 'NFL',            emoji: '🏈' },
  { key: 'basketball_nba',           name: 'NBA',            emoji: '🏀' },
  { key: 'baseball_mlb',             name: 'MLB',            emoji: '⚾' },
  { key: 'icehockey_nhl',            name: 'NHL',            emoji: '🏒' },
  { key: 'soccer_epl',               name: 'Premier League', emoji: '⚽' },
  { key: 'mma_mixed_martial_arts',   name: 'MMA',            emoji: '🥊' },
];

// In-memory cache
const oddsCache   = new Map(); // sportKey → { data, fetchedAt }
const scoresCache = new Map();
const ODDS_TTL    = 30 * 60 * 1000; // 30 minutes
const SCORES_TTL  =  5 * 60 * 1000; // 5 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Invalid JSON from odds API')); }
      });
    }).on('error', reject);
  });
}

// Pull the best American odds from the first bookmaker that has h2h markets
function extractOdds(game) {
  for (const bm of (game.bookmakers || [])) {
    const h2h = (bm.markets || []).find(m => m.key === 'h2h');
    if (!h2h) continue;
    const result = {};
    for (const o of h2h.outcomes) {
      if (o.name === game.home_team)  result.home = o.price;
      else if (o.name === game.away_team) result.away = o.price;
      else result.draw = o.price; // soccer draw
    }
    if (result.home != null && result.away != null) return result;
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function fetchGamesForSport(sportKey) {
  if (!API_KEY) throw new Error('NO_API_KEY');

  const hit = oddsCache.get(sportKey);
  if (hit && Date.now() - hit.fetchedAt < ODDS_TTL) return hit.data;

  const url = `${BASE_URL}/sports/${sportKey}/odds` +
    `?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
  const raw = await fetchJSON(url);

  if (!Array.isArray(raw)) throw new Error('Unexpected response from odds API');

  const games = raw
    .filter(g => new Date(g.commence_time) > new Date()) // future only
    .map(g => ({
      id:           g.id,
      sport:        sportKey,
      homeTeam:     g.home_team,
      awayTeam:     g.away_team,
      commenceTime: g.commence_time,
      odds:         extractOdds(g),
    }))
    .filter(g => g.odds)  // only games with valid odds
    .slice(0, 12);

  oddsCache.set(sportKey, { data: games, fetchedAt: Date.now() });
  return games;
}

async function fetchAllGames() {
  const result = [];
  for (const sport of SPORTS) {
    try {
      const games = await fetchGamesForSport(sport.key);
      result.push({ ...sport, games });
    } catch (err) {
      if (err.message === 'NO_API_KEY') throw err;
      // Sport might be off-season — just return empty
      result.push({ ...sport, games: [] });
    }
  }
  return result;
}

async function fetchScoresForSport(sportKey) {
  if (!API_KEY) return [];

  const hit = scoresCache.get(sportKey);
  if (hit && Date.now() - hit.fetchedAt < SCORES_TTL) return hit.data;

  const url = `${BASE_URL}/sports/${sportKey}/scores?apiKey=${API_KEY}&daysFrom=3`;
  const raw = await fetchJSON(url);
  if (!Array.isArray(raw)) return [];

  const completed = raw.filter(g => g.completed);
  scoresCache.set(sportKey, { data: completed, fetchedAt: Date.now() });
  return completed;
}

module.exports = { fetchAllGames, fetchGamesForSport, fetchScoresForSport, SPORTS };
