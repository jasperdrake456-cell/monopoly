#!/usr/bin/env node
/**
 * seed-mlb.js
 * Fetches upcoming MLB games from The Odds API and seeds them into the Game Vault
 * sports betting system.
 *
 * Usage:
 *   node seed-mlb.js [--server <url>] [--admin-user <user>] [--admin-pass <pass>]
 *
 * Defaults:
 *   --server     https://monopoly-production-c2bd.up.railway.app
 *   --admin-user jasper
 *   --admin-pass  (prompted if not supplied)
 *
 * Environment variables (alternative to flags):
 *   SERVER_URL, ADMIN_USERNAME, ADMIN_PASSWORD
 */

'use strict';

const https = require('https');
const http  = require('http');

// ── Config ────────────────────────────────────────────────────────────────────

const MLB_API_KEY  = '358b60a6e8223a596d99cb0dc8fe6716';
const MLB_ODDS_URL =
  `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds/` +
  `?apiKey=${MLB_API_KEY}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;

const args       = process.argv.slice(2);
const argMap     = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) argMap[args[i].slice(2)] = args[i + 1] || '';
}

const SERVER_URL    = argMap['server']     || process.env.SERVER_URL     || 'https://monopoly-production-c2bd.up.railway.app';
const ADMIN_USER    = argMap['admin-user'] || process.env.ADMIN_USERNAME || 'jasper';
const ADMIN_PASS    = argMap['admin-pass'] || process.env.ADMIN_PASSWORD || '';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { reject(new Error(`JSON parse error: ${raw.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

function postJSON(url, data, token) {
  return new Promise((resolve, reject) => {
    const body   = JSON.stringify(data);
    const parsed = new URL(url);
    const mod    = parsed.protocol === 'https:' ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = mod.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Odds extraction ───────────────────────────────────────────────────────────

function extractOdds(game) {
  for (const bm of (game.bookmakers || [])) {
    const h2h = (bm.markets || []).find(m => m.key === 'h2h');
    if (!h2h) continue;
    const result = {};
    for (const o of h2h.outcomes) {
      if (o.name === game.home_team)       result.home = o.price;
      else if (o.name === game.away_team)  result.away = o.price;
    }
    if (result.home != null && result.away != null) return result;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Login
  if (!ADMIN_PASS) {
    console.error('ERROR: Admin password required. Set --admin-pass or ADMIN_PASSWORD env var.');
    process.exit(1);
  }

  console.log(`Logging in as ${ADMIN_USER} to ${SERVER_URL}…`);
  const loginRes = await postJSON(`${SERVER_URL}/api/accounts/login`, {
    username: ADMIN_USER,
    password: ADMIN_PASS,
  });
  if (!loginRes.body?.ok || !loginRes.body?.token) {
    console.error('Login failed:', loginRes.body);
    process.exit(1);
  }
  const token = loginRes.body.token;
  console.log('Login successful.');

  // 2. Fetch MLB odds
  console.log('Fetching MLB odds from The Odds API…');
  const oddsRes = await fetchJSON(MLB_ODDS_URL);
  if (!Array.isArray(oddsRes.body)) {
    console.error('Unexpected response from Odds API:', oddsRes.body);
    process.exit(1);
  }

  const games = oddsRes.body;
  console.log(`Got ${games.length} MLB game(s) from API.`);

  // 3. Filter to upcoming games with valid odds
  const now = Date.now();
  const upcoming = games
    .filter(g => new Date(g.commence_time).getTime() > now)
    .map(g => ({
      sport:     'MLB',
      sportEmoji: '⚾',
      homeTeam:  g.home_team,
      awayTeam:  g.away_team,
      odds:      extractOdds(g),
      startTime: g.commence_time,
    }))
    .filter(g => g.odds !== null)
    .slice(0, 15); // seed up to 15 games

  console.log(`${upcoming.length} upcoming game(s) with valid odds to seed.`);

  // 4. POST each game to admin endpoint
  let created = 0;
  let failed  = 0;
  for (const game of upcoming) {
    const res = await postJSON(
      `${SERVER_URL}/api/admin/sports/games`,
      game,
      token
    );
    if (res.body?.ok) {
      console.log(`  ✅ Created: ${game.awayTeam} @ ${game.homeTeam} — Home: ${game.odds.home > 0 ? '+' : ''}${game.odds.home}, Away: ${game.odds.away > 0 ? '+' : ''}${game.odds.away}`);
      created++;
    } else {
      console.warn(`  ❌ Failed:  ${game.awayTeam} @ ${game.homeTeam} — ${JSON.stringify(res.body)}`);
      failed++;
    }
  }

  console.log(`\nDone. Created: ${created}  Failed: ${failed}`);
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
