'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const BANS_FILE = path.join(DATA_DIR, 'bans.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BANS_FILE)) fs.writeFileSync(BANS_FILE, JSON.stringify({ ips: {}, users: {} }, null, 2), 'utf8');

function readBans() {
  try { return JSON.parse(fs.readFileSync(BANS_FILE, 'utf8')); }
  catch { return { ips: {}, users: {} }; }
}

function writeBans(bans) {
  fs.writeFileSync(BANS_FILE, JSON.stringify(bans, null, 2), 'utf8');
}

// ── IP bans ───────────────────────────────────────────────────────────────────
// bans.ips[ip] = { reason, bannedAt, expiresAt (null = permanent) }

function banIP(ip, reason = '', durationMs = null) {
  const bans = readBans();
  bans.ips[ip] = {
    reason,
    bannedAt: Date.now(),
    expiresAt: durationMs ? Date.now() + durationMs : null,
  };
  writeBans(bans);
}

function unbanIP(ip) {
  const bans = readBans();
  delete bans.ips[ip];
  writeBans(bans);
}

function isIPBanned(ip) {
  const bans = readBans();
  const entry = bans.ips[ip];
  if (!entry) return false;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    // Auto-expire
    delete bans.ips[ip];
    writeBans(bans);
    return false;
  }
  return true;
}

function getIPBan(ip) {
  const bans = readBans();
  return bans.ips[ip] || null;
}

function listIPBans() {
  const bans = readBans();
  const now  = Date.now();
  // Clean expired first
  let changed = false;
  for (const ip of Object.keys(bans.ips)) {
    if (bans.ips[ip].expiresAt && now > bans.ips[ip].expiresAt) {
      delete bans.ips[ip];
      changed = true;
    }
  }
  if (changed) writeBans(bans);
  return Object.entries(bans.ips).map(([ip, data]) => ({ ip, ...data }));
}

// ── User bans ─────────────────────────────────────────────────────────────────
// bans.users[username] = {
//   reason, bannedAt,
//   games: ['crash', 'mines', ...] or ['*'] for all casino games,
//   expiresAt: null (permanent) or timestamp
// }

const ALL_CASINO_GAMES = [
  'crash', 'plinko', 'dice', 'roulette', 'blackjack', 'baccarat',
  'mines', 'ride-the-bus', 'slots', 'chicken-cross', 'texas-holdem',
  'hilo', 'tower', 'wheel',
];

function banUser(username, games = ['*'], reason = '', durationMs = null) {
  const bans = readBans();
  if (!bans.users) bans.users = {};
  bans.users[username] = {
    reason,
    bannedAt: Date.now(),
    games, // ['*'] = all games, or specific game slugs
    expiresAt: durationMs ? Date.now() + durationMs : null,
  };
  writeBans(bans);
}

function unbanUser(username) {
  const bans = readBans();
  if (!bans.users) bans.users = {};
  delete bans.users[username];
  writeBans(bans);
}

function getUserBan(username) {
  const bans = readBans();
  if (!bans.users) return null;
  const entry = bans.users[username];
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    delete bans.users[username];
    writeBans(bans);
    return null;
  }
  return entry;
}

function isUserBannedFromGame(username, gameSlug) {
  const ban = getUserBan(username);
  if (!ban) return false;
  return ban.games.includes('*') || ban.games.includes(gameSlug);
}

function listUserBans() {
  const bans = readBans();
  if (!bans.users) return [];
  const now = Date.now();
  let changed = false;
  for (const username of Object.keys(bans.users)) {
    if (bans.users[username].expiresAt && now > bans.users[username].expiresAt) {
      delete bans.users[username];
      changed = true;
    }
  }
  if (changed) writeBans(bans);
  return Object.entries(bans.users).map(([username, data]) => ({ username, ...data }));
}

module.exports = {
  banIP, unbanIP, isIPBanned, getIPBan, listIPBans,
  banUser, unbanUser, getUserBan, isUserBannedFromGame, listUserBans,
  ALL_CASINO_GAMES,
};
