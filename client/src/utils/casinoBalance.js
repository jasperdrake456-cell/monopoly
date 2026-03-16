// Shared casino balance — persisted in localStorage across all casino games
// Daily reward: $250 at 8:00 AM every day

const BALANCE_KEY   = 'casino_balance';
const DAILY_KEY     = 'casino_last_daily';
const DAILY_AMOUNT  = 250;
const STARTING_AMOUNT = 250; // New players start with $250

export function getBalance() {
  const raw = localStorage.getItem(BALANCE_KEY);
  if (raw === null) {
    // First time — seed with starting amount
    localStorage.setItem(BALANCE_KEY, String(STARTING_AMOUNT));
    return STARTING_AMOUNT;
  }
  return Math.max(0, parseInt(raw, 10) || 0);
}

export function setBalance(amount) {
  localStorage.setItem(BALANCE_KEY, String(Math.max(0, Math.round(amount))));
}

export function addBalance(amount) {
  setBalance(getBalance() + amount);
}

export function subtractBalance(amount) {
  setBalance(getBalance() - amount);
}

// Returns the amount claimed (250) if daily was available, or 0 if already claimed.
// "Daily" resets at 8:00 AM each day.
export function checkAndClaimDaily() {
  const now = new Date();

  // Find today's 8am
  const today8am = new Date(now);
  today8am.setHours(8, 0, 0, 0);

  // If it's before 8am, the relevant reset was yesterday at 8am
  const resetTime = now < today8am
    ? new Date(today8am.getTime() - 86400000)
    : today8am;

  const lastDaily = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);

  if (lastDaily < resetTime.getTime()) {
    // Not yet claimed since last 8am reset
    addBalance(DAILY_AMOUNT);
    localStorage.setItem(DAILY_KEY, String(Date.now()));
    return DAILY_AMOUNT;
  }

  return 0; // already claimed
}

// How many ms until the next 8am reset
export function msUntilNextDaily() {
  const now = new Date();
  const next8am = new Date(now);
  next8am.setHours(8, 0, 0, 0);
  if (now >= next8am) next8am.setDate(next8am.getDate() + 1);
  return next8am.getTime() - now.getTime();
}
