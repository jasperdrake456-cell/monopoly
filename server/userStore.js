'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Storage files ─────────────────────────────────────────────────────────────
// Use DATA_DIR env var (set to a Railway Volume mount path like /data) so that
// account data survives redeploys. Falls back to server/data/ for local dev.
const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    '{}', 'utf8');
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '{}', 'utf8');

console.log(`[userStore] Data directory: ${DATA_DIR}`);

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function readSessionsFromDisk() {
  try { return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeSessionsToDisk() {
  const obj = {};
  for (const [token, data] of sessions) obj[token] = data;
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj), 'utf8'); }
  catch { /* non-fatal */ }
}

// ── Password hashing ──────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Session store (persisted to sessions.json) ────────────────────────────────
// token → { username, expires }
const sessions = new Map();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Load sessions saved from before the last restart
(function loadSessions() {
  const saved = readSessionsFromDisk();
  const now   = Date.now();
  for (const [token, data] of Object.entries(saved)) {
    if (data.expires > now) sessions.set(token, data); // skip expired
  }
  console.log(`[sessions] Loaded ${sessions.size} active session(s) from disk`);
})();

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(username) {
  const token = makeToken();
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  writeSessionsToDisk();
  return token;
}

function validateToken(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) {
    sessions.delete(token);
    writeSessionsToDisk();
    return null;
  }
  return session.username;
}

function destroySession(token) {
  sessions.delete(token);
  writeSessionsToDisk();
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STARTING_BALANCE = 500;
const DAILY_AMOUNT     = 250;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * Returns { ok, error, token, username, balance }
 */
function register(username, password) {
  if (!username || typeof username !== 'string') return { ok: false, error: 'Invalid username' };
  if (!password || typeof password !== 'string') return { ok: false, error: 'Invalid password' };

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (clean.length < 3) return { ok: false, error: 'Username must be 3+ characters (letters, numbers, _ -)' };
  if (clean.length > 20) return { ok: false, error: 'Username max 20 characters' };
  if (password.length < 4) return { ok: false, error: 'Password must be 4+ characters' };

  const users = readUsers();
  if (users[clean]) return { ok: false, error: 'Username already taken' };

  const salt = makeSalt();
  users[clean] = {
    username: clean,
    displayName: username.trim().slice(0, 20),
    passwordHash: hashPassword(password, salt),
    salt,
    casinoBalance: STARTING_BALANCE,
    lastDaily: 0,
    createdAt: Date.now(),
  };
  writeUsers(users);

  const token = createSession(clean);
  return { ok: true, token, username: clean, displayName: users[clean].displayName, balance: STARTING_BALANCE };
}

/**
 * Log in.
 * Returns { ok, error, token, username, balance }
 */
function login(username, password) {
  if (!username || !password) return { ok: false, error: 'Missing credentials' };

  const clean = username.trim().toLowerCase();
  const users = readUsers();
  const user  = users[clean];
  if (!user) return { ok: false, error: 'Username not found' };

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return { ok: false, error: 'Wrong password' };

  const token = createSession(clean);
  return { ok: true, token, username: clean, displayName: user.displayName || clean, balance: user.casinoBalance };
}

/**
 * Get user info from token.
 * Returns { ok, username, displayName, balance } or { ok: false }
 */
function getMe(token) {
  const username = validateToken(token);
  if (!username) return { ok: false, error: 'Invalid or expired session' };
  const users = readUsers();
  const user  = users[username];
  if (!user) return { ok: false, error: 'User not found' };
  return { ok: true, username, displayName: user.displayName || username, balance: user.casinoBalance };
}

/**
 * Sync balance from client.
 * Only updates if the provided balance is valid.
 */
function syncBalance(token, balance) {
  const username = validateToken(token);
  if (!username) return { ok: false, error: 'Invalid session' };
  if (typeof balance !== 'number' || balance < 0 || !isFinite(balance)) return { ok: false, error: 'Invalid balance' };

  const users = readUsers();
  if (!users[username]) return { ok: false, error: 'User not found' };
  users[username].casinoBalance = Math.floor(balance);
  writeUsers(users);
  return { ok: true, balance: users[username].casinoBalance };
}

/**
 * Claim daily reward (server authoritative).
 * Returns { ok, claimed, amount, balance, nextReset }
 */
function claimDaily(token) {
  const username = validateToken(token);
  if (!username) return { ok: false, error: 'Invalid session' };

  const users = readUsers();
  const user  = users[username];
  if (!user) return { ok: false, error: 'User not found' };

  const now      = new Date();
  const today8am = new Date(now);
  today8am.setHours(8, 0, 0, 0);
  const resetTime = now < today8am
    ? today8am.getTime() - 86400000
    : today8am.getTime();

  if (user.lastDaily >= resetTime) {
    const nextReset = resetTime + 86400000;
    return { ok: true, claimed: false, amount: 0, balance: user.casinoBalance, nextReset };
  }

  user.casinoBalance += DAILY_AMOUNT;
  user.lastDaily = Date.now();
  writeUsers(users);
  const nextReset = resetTime + 86400000;
  return { ok: true, claimed: true, amount: DAILY_AMOUNT, balance: user.casinoBalance, nextReset };
}

/**
 * Transfer casino balance between accounts.
 * Returns { ok, error, fromBalance, toBalance }
 */
function transfer(token, toUsername, amount) {
  const fromUsername = validateToken(token);
  if (!fromUsername) return { ok: false, error: 'Invalid session' };

  const amt = Math.floor(amount);
  if (!amt || amt < 1) return { ok: false, error: 'Amount must be at least $1' };
  if (amt > 1000000) return { ok: false, error: 'Amount too large' };

  const toClean = toUsername.trim().toLowerCase();
  if (toClean === fromUsername) return { ok: false, error: "Can't transfer to yourself" };

  const users = readUsers();
  const from  = users[fromUsername];
  const to    = users[toClean];

  if (!from) return { ok: false, error: 'Sender not found' };
  if (!to)   return { ok: false, error: `User "${toClean}" not found` };
  if (from.casinoBalance < amt) return { ok: false, error: `Insufficient balance ($${from.casinoBalance})` };

  from.casinoBalance -= amt;
  to.casinoBalance   += amt;
  writeUsers(users);

  return { ok: true, fromBalance: from.casinoBalance, toBalance: to.casinoBalance, amount: amt, to: toClean };
}

/**
 * Look up a username (for autocomplete / validation).
 */
function userExists(username) {
  const clean = username.trim().toLowerCase();
  const users = readUsers();
  return !!users[clean];
}

/**
 * Log out.
 */
function logout(token) {
  destroySession(token);
  return { ok: true };
}

module.exports = { register, login, getMe, syncBalance, claimDaily, transfer, logout, userExists };
