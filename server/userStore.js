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
// Permanent record of every registration by IP — survives account deletions
const REG_LOG_FILE  = path.join(DATA_DIR, 'registrationLog.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    '{}', 'utf8');
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '{}', 'utf8');
if (!fs.existsSync(REG_LOG_FILE))  fs.writeFileSync(REG_LOG_FILE,  '[]', 'utf8');

console.log(`[userStore] Data directory: ${DATA_DIR}`);

// ── Migration: backfill registerIP for accounts that predate the IP-limit feature ──
(function migrateRegisterIP() {
  const users = readUsers();
  let changed = 0;
  for (const u of Object.values(users)) {
    if (!u.registerIP && u.lastIP) {
      u.registerIP = u.lastIP;
      changed++;
    }
  }
  if (changed > 0) {
    writeUsers(users);
    console.log(`[userStore] Migrated registerIP for ${changed} account(s)`);
  }
})();


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
const STARTING_BALANCE = 2000;
const DAILY_AMOUNT     = 1000;
const HOURLY_MS        = 60 * 60 * 1000; // 1 hour
const ADMIN_USERNAME   = 'jasper';
const ADMIN_BALANCE    = 999_999_999; // effectively infinite

// ── Migration: seed registrationLog from existing accounts ────────────────────
// Ensures accounts created before the log existed are counted by the new check.
// Must run AFTER ADMIN_USERNAME is declared (constants block above).
(function seedRegLog() {
  const users = readUsers();
  const log   = readRegLog();
  const logged = new Set(log.map(e => e.username));
  let added = 0;
  for (const u of Object.values(users)) {
    if (u.username === ADMIN_USERNAME) continue;
    if (logged.has(u.username)) continue;
    const ip = u.registerIP || u.lastIP;
    if (!ip) continue;
    log.push({ ip: normalizeIP(ip), username: u.username, createdAt: u.createdAt || Date.now() });
    added++;
  }
  if (added > 0) {
    writeRegLog(log);
    console.log(`[userStore] Seeded registrationLog with ${added} existing account(s)`);
  }
})();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * Returns { ok, error, token, username, balance }
 */
function register(username, password, ip = null) {
  if (!username || typeof username !== 'string') return { ok: false, error: 'Invalid username' };
  if (!password || typeof password !== 'string') return { ok: false, error: 'Invalid password' };

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (clean.length < 3) return { ok: false, error: 'Username must be 3+ characters (letters, numbers, _ -)' };
  if (clean.length > 20) return { ok: false, error: 'Username max 20 characters' };
  if (password.length < 4) return { ok: false, error: 'Password must be 4+ characters' };

  const users = readUsers();
  if (users[clean]) return { ok: false, error: 'Username already taken' };

  const salt = makeSalt();
  const normIP = ip ? normalizeIP(ip) : null;
  users[clean] = {
    username: clean,
    displayName: username.trim().slice(0, 20),
    passwordHash: hashPassword(password, salt),
    salt,
    casinoBalance: STARTING_BALANCE,
    lastDaily: 0,
    createdAt: Date.now(),
    // registerIP is set once at creation and never overwritten — used for account-per-IP limits
    registerIP: normIP,
    lastIP: normIP,
    lastSeen: normIP ? Date.now() : null,
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
  const isAdmin = clean === ADMIN_USERNAME;
  const balance = isAdmin ? ADMIN_BALANCE : user.casinoBalance;
  return { ok: true, token, username: clean, displayName: user.displayName || clean, balance, isAdmin };
}

/**
 * Get user info from token.
 * Returns { ok, username, displayName, balance, isAdmin } or { ok: false }
 */
function getMe(token) {
  const username = validateToken(token);
  if (!username) return { ok: false, error: 'Invalid or expired session' };
  const users = readUsers();
  const user  = users[username];
  if (!user) return { ok: false, error: 'User not found' };
  const isAdmin = username === ADMIN_USERNAME;
  const balance = isAdmin ? ADMIN_BALANCE : user.casinoBalance;
  return { ok: true, username, displayName: user.displayName || username, balance, isAdmin };
}

/**
 * Sync balance from client.
 * Only updates if the provided balance is valid. Skipped for admin.
 */
function syncBalance(token, balance) {
  const username = validateToken(token);
  if (!username) return { ok: false, error: 'Invalid session' };
  if (username === ADMIN_USERNAME) return { ok: true, balance: ADMIN_BALANCE }; // admin never syncs
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

  const now       = Date.now();
  const lastClaim = user.lastDaily || 0;
  const nextReset = lastClaim + HOURLY_MS;

  if (now < nextReset) {
    return { ok: true, claimed: false, amount: 0, balance: user.casinoBalance, nextReset };
  }

  user.casinoBalance += DAILY_AMOUNT;
  user.lastDaily = now;
  writeUsers(users);
  return { ok: true, claimed: true, amount: DAILY_AMOUNT, balance: user.casinoBalance, nextReset: now + HOURLY_MS };
}

/**
 * Transfer casino balance between accounts.
 * Admin (jasper) can transfer any amount regardless of their own balance.
 * Returns { ok, error, fromBalance, toBalance }
 */
function transfer(token, toUsername, amount) {
  const fromUsername = validateToken(token);
  if (!fromUsername) return { ok: false, error: 'Invalid session' };

  const amt = Math.floor(amount);
  if (!amt || amt < 1) return { ok: false, error: 'Amount must be at least $1' };

  const toClean = toUsername.trim().toLowerCase();
  if (toClean === fromUsername) return { ok: false, error: "Can't transfer to yourself" };

  const users = readUsers();
  const from  = users[fromUsername];
  const to    = users[toClean];
  const isAdmin = fromUsername === ADMIN_USERNAME;

  if (!from) return { ok: false, error: 'Sender not found' };
  if (!to)   return { ok: false, error: `User "${toClean}" not found` };
  if (!isAdmin && amt > 750) return { ok: false, error: 'Maximum transfer is $750 per transaction' };
  if (!isAdmin && from.casinoBalance < amt) return { ok: false, error: `Insufficient balance ($${from.casinoBalance})` };

  if (!isAdmin) from.casinoBalance -= amt;
  to.casinoBalance += amt;
  writeUsers(users);

  const fromBalance = isAdmin ? ADMIN_BALANCE : from.casinoBalance;
  return { ok: true, fromBalance, toBalance: to.casinoBalance, amount: amt, to: toClean };
}

/**
 * Admin only: delete a user account.
 */
function deleteUser(adminToken, targetUsername) {
  const callerUsername = validateToken(adminToken);
  if (callerUsername !== ADMIN_USERNAME) return { ok: false, error: 'Forbidden' };

  const clean = targetUsername.trim().toLowerCase();
  if (clean === ADMIN_USERNAME) return { ok: false, error: "Cannot delete admin account" };

  const users = readUsers();
  if (!users[clean]) return { ok: false, error: 'User not found' };

  delete users[clean];
  writeUsers(users);
  return { ok: true };
}

/**
 * Admin only: give money to any user.
 */
function adminGiveMoney(adminToken, targetUsername, amount) {
  const callerUsername = validateToken(adminToken);
  if (callerUsername !== ADMIN_USERNAME) return { ok: false, error: 'Forbidden' };

  const amt = Math.floor(amount);
  if (!amt || amt < 1) return { ok: false, error: 'Invalid amount' };

  const clean = targetUsername.trim().toLowerCase();
  const users = readUsers();
  if (!users[clean]) return { ok: false, error: 'User not found' };

  users[clean].casinoBalance += amt;
  writeUsers(users);
  return { ok: true, balance: users[clean].casinoBalance };
}

/** Normalise IPv6-mapped IPv4 "::ffff:1.2.3.4" → "1.2.3.4" */
function normalizeIP(ip) {
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/**
 * Record the last known IP for a user (called on login/register).
 */
function recordIP(username, ip) {
  const normIP = normalizeIP(ip);
  if (!normIP || normIP === 'unknown') return;
  const users = readUsers();
  if (!users[username]) return;
  users[username].lastIP = normIP;
  users[username].lastSeen = Date.now();
  writeUsers(users);
}

// ── Registration log helpers ───────────────────────────────────────────────────
// The log is a permanent record of every registration, keyed by IP.
// Accounts can be deleted, but the log entry stays — preventing re-registration.

function readRegLog() {
  try { return JSON.parse(fs.readFileSync(REG_LOG_FILE, 'utf8')); }
  catch { return []; }
}

function writeRegLog(log) {
  try { fs.writeFileSync(REG_LOG_FILE, JSON.stringify(log, null, 2), 'utf8'); }
  catch (e) { console.error('[regLog] write error:', e.message); }
}

/**
 * Append a registration event to the log.
 * Called once per successful registration.
 */
function logRegistration(ip, username) {
  const normIP = normalizeIP(ip);
  const log = readRegLog();
  log.push({ ip: normIP, username, createdAt: Date.now() });
  writeRegLog(log);
  console.log(`[regLog] Logged registration for "${username}" from IP ${normIP} (total entries: ${log.length})`);
}

/**
 * Count how many times accounts were registered from this IP.
 * Combines the registration log (permanent) with the current account store
 * (catches cases where the log doesn't exist yet for old accounts).
 * Returns { blocked: true, count } if at/over the limit.
 */
function checkIPAccountLimit(ip, maxAccounts = 3) {
  const normIP = normalizeIP(ip);

  // Localhost / dev bypass — ::1 and 127.x.x.x are local machines
  const isLocalhost = normIP === '::1' || normIP === '127.0.0.1' || normIP.startsWith('127.');
  if (isLocalhost) {
    console.log(`[ipCheck] Localhost IP ${normIP} — skipping limit`);
    return { blocked: false };
  }

  if (normIP === 'unknown') {
    // Can't determine IP — block registration to prevent header-stripping abuse
    console.log(`[ipCheck] Unknown IP — blocking registration`);
    return { blocked: true, count: 0, reason: 'unknown_ip' };
  }

  // ── 1. Check the persistent registration log (most reliable) ──────────────
  const log = readRegLog();
  const logCount = log.filter(e => e.ip === normIP || e.ip === ip).length;

  // ── 2. Check the current account store (catches pre-log accounts) ─────────
  const users = readUsers();
  const storeCount = Object.values(users).filter(u => {
    if (u.username === ADMIN_USERNAME) return false;
    return u.registerIP === normIP || u.registerIP === ip ||
           u.lastIP     === normIP || u.lastIP     === ip;
  }).length;

  // Take the higher of the two counts (belt-and-suspenders)
  const count = Math.max(logCount, storeCount);

  console.log(`[ipCheck] IP ${normIP}: logCount=${logCount} storeCount=${storeCount} effective=${count} (limit ${maxAccounts})`);
  return count >= maxAccounts ? { blocked: true, count } : { blocked: false, count };
}

/**
 * Add bonus chips to a user's casino balance (used for online-player bonuses).
 */
function addBonus(username, amount) {
  if (!username || username === ADMIN_USERNAME) return;
  const users = readUsers();
  if (!users[username]) return;
  users[username].casinoBalance = (users[username].casinoBalance || 0) + amount;
  writeUsers(users);
}

/**
 * Admin only: list all users.
 */
function listUsers(adminToken) {
  const callerUsername = validateToken(adminToken);
  if (callerUsername !== ADMIN_USERNAME) return { ok: false, error: 'Forbidden' };

  const users = readUsers();
  return {
    ok: true,
    users: Object.values(users).map(u => ({
      username: u.username,
      displayName: u.displayName,
      balance: u.casinoBalance,
      createdAt: u.createdAt,
      lastIP: u.lastIP || null,
      lastSeen: u.lastSeen || null,
    })),
  };
}

/**
 * Admin only: set a user's balance to an exact value.
 */
function adminSetBalance(adminToken, username, amount) {
  const callerUsername = validateToken(adminToken);
  if (callerUsername !== ADMIN_USERNAME) return { ok: false, error: 'Forbidden' };

  const newBalance = Math.floor(amount);
  if (isNaN(newBalance) || newBalance < 0 || !isFinite(newBalance)) return { ok: false, error: 'Invalid amount' };

  const clean = username.trim().toLowerCase();
  const users = readUsers();
  if (!users[clean]) return { ok: false, error: 'User not found' };

  users[clean].casinoBalance = newBalance;
  writeUsers(users);
  return { ok: true, balance: newBalance };
}

/**
 * Public: top N users by casino balance (excludes admin).
 */
function getTopBalances(limit = 20) {
  const users = readUsers();
  return Object.values(users)
    .filter(u => u.username !== ADMIN_USERNAME)
    .map(u => ({ username: u.username, displayName: u.displayName || u.username, balance: u.casinoBalance || 0 }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

/**
 * Check if a token belongs to the admin.
 */
function isAdminToken(token) {
  return validateToken(token) === ADMIN_USERNAME;
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


/**
 * Admin only: destroy all active sessions for a user (kick them out).
 * Returns { ok, sessionsKilled }
 */
function kickUser(adminToken, targetUsername) {
  const callerUsername = validateToken(adminToken);
  if (callerUsername !== ADMIN_USERNAME) return { ok: false, error: 'Forbidden' };

  const clean = targetUsername.trim().toLowerCase();
  if (clean === ADMIN_USERNAME) return { ok: false, error: 'Cannot kick admin' };

  let killed = 0;
  for (const [token, data] of sessions) {
    if (data.username === clean) {
      sessions.delete(token);
      killed++;
    }
  }
  if (killed > 0) writeSessionsToDisk();
  return { ok: true, sessionsKilled: killed };
}

module.exports = {
  register, login, getMe, syncBalance, claimDaily, transfer, logout, userExists,
  deleteUser, adminGiveMoney, adminSetBalance, listUsers, isAdminToken, getTopBalances,
  recordIP, kickUser, checkIPAccountLimit, logRegistration, addBonus,
};
