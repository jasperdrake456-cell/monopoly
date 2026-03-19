'use strict';
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const profanity = require('./profanity');

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

// ── In-memory user cache ──────────────────────────────────────────────────────
// All reads/writes go through _usersCache so concurrent requests never race on
// the file. The file is only the persistence layer, written atomically via a
// temp-file+rename to prevent corruption if the server is killed mid-write.
const BACKUP_FILE = path.join(DATA_DIR, 'users.backup.json');

function _loadUsersFromDisk() {
  // Try primary file first
  try {
    const raw  = fs.readFileSync(USERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // If primary is suspiciously empty but a backup exists, prefer the backup
      if (Object.keys(data).length === 0 && fs.existsSync(BACKUP_FILE)) {
        try {
          const bdata = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
          if (Object.keys(bdata).length > 0) {
            console.warn('[userStore] Primary users.json empty — recovering from backup');
            return bdata;
          }
        } catch { /* backup also empty or corrupt, keep going */ }
      }
      return data;
    }
  } catch { /* fall through */ }

  // Primary is corrupt — try backup
  if (fs.existsSync(BACKUP_FILE)) {
    try {
      const bdata = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
      if (bdata && typeof bdata === 'object' && !Array.isArray(bdata)) {
        console.error('[userStore] users.json corrupt — recovered from backup!');
        return bdata;
      }
    } catch { /* fall through */ }
  }

  console.error('[userStore] CRITICAL: both users.json and backup are corrupt. Starting empty.');
  return {};
}

// Single in-memory source of truth for all user data at runtime
let _usersCache = _loadUsersFromDisk();
const _accountCount = Object.keys(_usersCache).length;
console.log(`[userStore] Loaded ${_accountCount} accounts from ${DATA_DIR}`);

// ⚠️  PERSISTENCE WARNING
// If DATA_DIR is not set to a Railway Volume (or equivalent persistent disk),
// ALL USER DATA IS WIPED on every container restart — even without a deploy.
// Railway restarts containers for many reasons (memory, health checks, maintenance)
// and the container filesystem resets to the Git repo state (empty users.json).
//
// FIX: In Railway dashboard → your service → Variables, set:
//   DATA_DIR = /data
// Then in Railway dashboard → your service → Storage, create a Volume
// mounted at /data.  After that, accounts survive restarts indefinitely.
if (!process.env.DATA_DIR) {
  console.warn('');
  console.warn('╔══════════════════════════════════════════════════════════════╗');
  console.warn('║  ⚠️  WARNING: DATA_DIR env var is NOT set!                   ║');
  console.warn('║  User accounts are stored in server/data/ (container disk)   ║');
  console.warn('║  ALL ACCOUNTS WILL BE DELETED on every container restart.    ║');
  console.warn('║                                                               ║');
  console.warn('║  FIX: In Railway → Variables, add: DATA_DIR=/data            ║');
  console.warn('║       In Railway → Storage, create a Volume at /data         ║');
  console.warn('╚══════════════════════════════════════════════════════════════╝');
  console.warn('');
}

function readUsers() {
  return _usersCache; // always return the live in-memory copy
}

function writeUsers(users) {
  _usersCache = users;
  _flushToDisk();
}

// Atomic write: write to .tmp then fs.renameSync so a crash mid-write never
// leaves users.json truncated/corrupt.
function _flushToDisk() {
  const tmpFile = USERS_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(_usersCache, null, 2), 'utf8');
    fs.renameSync(tmpFile, USERS_FILE);
  } catch (err) {
    console.error('[userStore] Failed to flush users to disk:', err);
  }
}

// Rolling backup every 60 s — a known-good snapshot to fall back on
setInterval(() => {
  try {
    if (Object.keys(_usersCache).length === 0) return; // never overwrite backup with empty data
    const tmpBak = BACKUP_FILE + '.tmp';
    fs.writeFileSync(tmpBak, JSON.stringify(_usersCache, null, 2), 'utf8');
    fs.renameSync(tmpBak, BACKUP_FILE);
  } catch { /* non-fatal */ }
}, 60_000);

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
  if (!profanity.isClean(clean)) return { ok: false, error: 'Username contains prohibited words' };

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

  const newBalance = Math.floor(balance);

  if (newBalance <= 0) {
    // Mark when they first hit zero (don't overwrite if already set)
    if (!users[username].brokeAt) {
      users[username].brokeAt = Date.now();
    }
    users[username].casinoBalance = 0;
  } else {
    // Back in the game — clear the broke timer
    delete users[username].brokeAt;
    users[username].casinoBalance = newBalance;
  }

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
  if (!isAdmin && amt > 100000) return { ok: false, error: 'Maximum transfer is $100,000 per transaction' };
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
      username:    u.username,
      displayName: u.displayName,
      balance:     u.casinoBalance,
      createdAt:   u.createdAt,
      lastIP:      u.lastIP   || null,
      lastSeen:    u.lastSeen || null,
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

const BROKE_TTL_MS    = 5  * 60 * 1000; // balance must be $0 for this long
const OFFLINE_TTL_MS  = 30 * 60 * 1000; // AND user must have been offline this long

/**
 * Delete accounts that have BOTH:
 *   1. Been at $0 for 5+ minutes (brokeAt set by syncBalance)
 *   2. Been offline for 30+ minutes (lastSeen not updated recently)
 *
 * Condition 2 prevents deleting players who:
 *   - Are mid-bet (balance is temporarily $0 while a round resolves)
 *   - Close the tab briefly and come back
 *   - Have a sync race where the $0 is stale
 *
 * Returns the number of accounts deleted.
 */
function pruneZeroBalanceAccounts() {
  const now   = Date.now();
  const users = readUsers();
  const toDelete = Object.values(users).filter(u =>
    u.username !== ADMIN_USERNAME &&
    (u.casinoBalance || 0) <= 0 &&
    u.brokeAt && (now - u.brokeAt) >= BROKE_TTL_MS &&
    (!u.lastSeen || (now - u.lastSeen) >= OFFLINE_TTL_MS) // must also be offline 30+ min
  );
  if (toDelete.length === 0) return 0;

  for (const u of toDelete) {
    delete users[u.username];
    for (const [t, data] of sessions) {
      if (data.username === u.username) sessions.delete(t);
    }
    console.log(`[userStore] Deleted "${u.username}" — broke for 5+ minutes`);
  }
  writeUsers(users);
  writeSessionsToDisk();
  return toDelete.length;
}

/**
 * Server-internal: add chips to a user by username (no token required).
 * Returns { ok, balance } or { ok: false, error }
 */
function addBonusByAdmin(username, amount) {
  const clean = (username || '').trim().toLowerCase();
  const amt   = Math.floor(amount);
  if (!clean || !amt || amt < 1) return { ok: false, error: 'Invalid params' };
  const users = readUsers();
  if (!users[clean]) return { ok: false, error: 'User not found' };
  users[clean].casinoBalance = (users[clean].casinoBalance || 0) + amt;
  writeUsers(users);
  return { ok: true, balance: users[clean].casinoBalance };
}

/**
 * Admin: aggregate platform statistics.
 */
function adminGetStats() {
  const users  = readUsers();
  const all    = Object.values(users).filter(u => u.username !== ADMIN_USERNAME);
  const now    = Date.now();
  const DAY_MS = 86_400_000;
  const WEEK_MS = 7 * DAY_MS;
  const ONLINE_WINDOW_MS = 15 * 60_000; // 15 minutes

  const totalUsers    = all.length;
  const newToday      = all.filter(u => u.createdAt && (now - u.createdAt) < DAY_MS).length;
  const newThisWeek   = all.filter(u => u.createdAt && (now - u.createdAt) < WEEK_MS).length;
  const onlineNow     = all.filter(u => u.lastSeen && (now - u.lastSeen) < ONLINE_WINDOW_MS).length;
  const totalBalance  = all.reduce((s, u) => s + (u.casinoBalance || 0), 0);
  const avgBalance    = totalUsers > 0 ? Math.round(totalBalance / totalUsers) : 0;
  const richest       = all.reduce((best, u) => (!best || (u.casinoBalance || 0) > best.balance)
    ? { username: u.username, balance: u.casinoBalance || 0 } : best, null);
  const broke         = all.filter(u => (u.casinoBalance || 0) <= 100).length; // near-broke (≤$100)

  return {
    totalUsers, newToday, newThisWeek, onlineNow,
    totalBalance, avgBalance, richest, broke,
  };
}

/**
 * Reset ALL users' balances to a specific amount (for weekly resets).
 * Returns count of users affected.
 */
function bulkResetBalances(amount) {
  const val   = Math.max(0, Math.floor(amount));
  const users = readUsers();
  let count   = 0;
  for (const key of Object.keys(users)) {
    if (users[key].username === ADMIN_USERNAME) continue;
    users[key].casinoBalance = val;
    count++;
  }
  writeUsers(users);
  return count;
}

module.exports = {
  register, login, getMe, syncBalance, claimDaily, transfer, logout, userExists,
  deleteUser, adminGiveMoney, adminSetBalance, listUsers, isAdminToken, getTopBalances,
  recordIP, kickUser, addBonus, pruneZeroBalanceAccounts, adminGetStats, addBonusByAdmin,
  validateToken, bulkResetBalances,
};
