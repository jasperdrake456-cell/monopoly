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

  // Auto-delete accounts that hit zero
  if (newBalance <= 0) {
    delete users[username];
    writeUsers(users);
    // Kill all sessions for this user
    for (const [t, data] of sessions) {
      if (data.username === username) sessions.delete(t);
    }
    writeSessionsToDisk();
    console.log(`[userStore] Auto-deleted "${username}" — balance reached zero`);
    return { ok: false, deleted: true, error: 'Account deleted — balance reached zero' };
  }

  users[username].casinoBalance = newBalance;
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

/**
 * Scan all accounts and delete any with balance <= 0 (excluding admin).
 * Returns the number of accounts deleted.
 */
function pruneZeroBalanceAccounts() {
  const users = readUsers();
  const toDelete = Object.values(users).filter(
    u => u.username !== ADMIN_USERNAME && (u.casinoBalance || 0) <= 0
  );
  if (toDelete.length === 0) return 0;

  for (const u of toDelete) {
    delete users[u.username];
    // Kill all sessions for this user
    for (const [t, data] of sessions) {
      if (data.username === u.username) sessions.delete(t);
    }
    console.log(`[userStore] Pruned "${u.username}" — zero balance`);
  }
  writeUsers(users);
  writeSessionsToDisk();
  return toDelete.length;
}

module.exports = {
  register, login, getMe, syncBalance, claimDaily, transfer, logout, userExists,
  deleteUser, adminGiveMoney, adminSetBalance, listUsers, isAdminToken, getTopBalances,
  recordIP, kickUser, addBonus, pruneZeroBalanceAccounts,
};
