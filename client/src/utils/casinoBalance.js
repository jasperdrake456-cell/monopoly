// Shared casino balance — persisted in localStorage across all casino games
// Daily reward: $250 at 8:00 AM every day
// When logged in, balance is synced to server after every change.

const BALANCE_KEY    = 'casino_balance';
const DAILY_KEY      = 'casino_last_daily';
const DAILY_AMOUNT   = 250;
const STARTING_AMOUNT = 500; // New players start with $500

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// ── Auth token (set by AuthContext when user logs in) ─────────────────────────
let _authToken = null;
let _syncTimer  = null;

export function setAuthToken(token) {
  _authToken = token;
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

export function addBalance(amount) {
  setBalance(getBalance() + amount);
}

export function subtractBalance(amount) {
  setBalance(getBalance() - amount);
}

// ── Daily reward (client-side for guests; server handles logged-in users) ─────

// Returns the amount claimed (250) if daily was available, or 0 if already claimed.
export function checkAndClaimDaily() {
  const now = new Date();
  const today8am = new Date(now);
  today8am.setHours(8, 0, 0, 0);
  const resetTime = now < today8am
    ? new Date(today8am.getTime() - 86400000)
    : today8am;

  const lastDaily = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);
  if (lastDaily < resetTime.getTime()) {
    addBalance(DAILY_AMOUNT);
    localStorage.setItem(DAILY_KEY, String(Date.now()));
    return DAILY_AMOUNT;
  }
  return 0;
}

export function msUntilNextDaily() {
  const now = new Date();
  const next8am = new Date(now);
  next8am.setHours(8, 0, 0, 0);
  if (now >= next8am) next8am.setDate(next8am.getDate() + 1);
  return next8am.getTime() - now.getTime();
}
