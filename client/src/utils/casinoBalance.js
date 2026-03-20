// Shared casino balance — persisted in localStorage across all casino games
// Periodic reward: $1000 every 10 minutes
// When logged in, balance is synced to server after every change.

const BALANCE_KEY     = 'casino_balance';
const DAILY_KEY       = 'casino_last_daily';
const HOURLY_AMOUNT   = 1000;
const HOURLY_MS       = 10 * 60 * 1000; // 10 minutes in ms
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
    }).then(r => r.ok ? r.json() : null).then(data => {
      // If server rejected our value (e.g. admin lock), it returns the real balance — respect it
      if (data?.ok && typeof data.balance === 'number' && data.balance !== balance) {
        setBalanceFromServer(data.balance);
      }
    }).catch(() => { /* silent */ });
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
// a sync back. Server is always the source of truth — this ensures admin
// resets/clears are immediately respected regardless of cached local values.
export function setBalanceFromServer(amount) {
  if (typeof amount !== 'number' || !isFinite(amount) || amount < 0) return;
  const val = Math.max(0, Math.round(amount));
  localStorage.setItem(BALANCE_KEY, String(val));
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
