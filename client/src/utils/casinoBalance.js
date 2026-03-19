// Shared casino balance — persisted in localStorage across all casino games
// Hourly reward: $1000 every hour
// When logged in, balance is synced to server after every change.

const BALANCE_KEY     = 'casino_balance';
const DAILY_KEY       = 'casino_last_daily';
const HOURLY_AMOUNT   = 1000;
const HOURLY_MS       = 60 * 60 * 1000; // 1 hour in ms
const STARTING_AMOUNT = 2000; // New players start with $2,000

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// ── Auth token (set by AuthContext when user logs in) ─────────────────────────
let _authToken = null;
let _syncTimer  = null;

export function setAuthToken(token) {
  _authToken = token;
}

// ── Rigged-user gate (set by useBalance hook after fetching game-config) ──────
let _rigged = false;

export function setRiggedMode(val) {
  _rigged = !!val;
}

export function isRiggedMode() {
  return _rigged;
}

// Debounced server sync — fires 800ms after last balance change
function scheduleSync() {
  if (!_authToken) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    const balance = getBalance();
    fetch(SERVER_URL + '/api/accounts/balance/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_authToken}`,
      },
      body: JSON.stringify({ balance }),
    }).catch(() => { /* silent — localStorage is source of truth */ });
  }, 800);
}

// ── Core balance functions ────────────────────────────────────────────────────

export function getBalance() {
  const raw = localStorage.getItem(BALANCE_KEY);
  if (raw === null) {
    localStorage.setItem(BALANCE_KEY, String(STARTING_AMOUNT));
    return STARTING_AMOUNT;
  }
  return Math.max(0, parseInt(raw, 10) || 0);
}

export function setBalance(amount) {
  const val = Math.max(0, Math.round(amount));
  localStorage.setItem(BALANCE_KEY, String(val));
  scheduleSync();
}

// Write the server's authoritative value to localStorage WITHOUT scheduling
// a sync back. Used by AuthContext on login/mount so we don't echo the
// server's own value back to it (which could race with in-flight bets).
export function setBalanceFromServer(amount) {
  if (typeof amount !== 'number' || !isFinite(amount) || amount < 0) return;
  const val = Math.max(0, Math.round(amount));
  // Only overwrite if the server value is higher than current local value,
  // OR if local value is 0/missing (fresh load). This prevents a stale server
  // value from wiping out winnings the client hasn't synced yet.
  const current = getBalance();
  if (current === 0 || val >= current) {
    localStorage.setItem(BALANCE_KEY, String(val));
    // Don't call scheduleSync — the server already has this value.
  }
}

export function addBalance(amount) {
  // Rigged users never receive winnings — the call is silently dropped.
  if (_rigged) return;
  setBalance(getBalance() + amount);
}

export function subtractBalance(amount) {
  setBalance(getBalance() - amount);
}

// ── Hourly reward (client-side for guests; server handles logged-in users) ────

// Returns amount claimed (1000) if an hour has passed, or 0 if not yet.
export function checkAndClaimDaily() {
  const now = Date.now();
  const lastClaim = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);
  if (now - lastClaim >= HOURLY_MS) {
    addBalance(HOURLY_AMOUNT);
    localStorage.setItem(DAILY_KEY, String(now));
    return HOURLY_AMOUNT;
  }
  return 0;
}

// Returns ms until next hourly reward is available
export function msUntilNextDaily() {
  const lastClaim = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);
  const next = lastClaim + HOURLY_MS;
  return Math.max(0, next - Date.now());
}

// ── Big win reporting ─────────────────────────────────────────────────────────
// Silently fires to the server when profit >= $50,000 in a single round.
// game     — slug e.g. 'crash', 'mines', 'slots'
// bet      — amount wagered
// payout   — total returned (bet + profit)
// multiplier — final multiplier (can be null for games without one)
// details  — human-readable string e.g. "24 mines · 1 safe tile · 97×"
const BIG_WIN_THRESHOLD = 50_000;
export function reportBigWin(game, bet, payout, multiplier, details) {
  const profit = payout - bet;
  if (profit < BIG_WIN_THRESHOLD || !_authToken) return;
  fetch(SERVER_URL + '/api/accounts/big-win', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_authToken}`,
    },
    body: JSON.stringify({ game, bet, payout, profit, multiplier, details }),
  }).catch(() => { /* non-fatal */ });
}
