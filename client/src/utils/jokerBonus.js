/**
 * Joker bonus helper — computes equipped-joker bonuses locally and credits
 * them via the existing casinoBalance utilities, matching the architecture
 * where the client is the source of truth for balance and syncs up to the
 * server every ~800ms.
 *
 * Cached abilities (fetched once per mount via initJokerBonuses) so every
 * bet doesn't round-trip the server.
 */

import { addBalance } from './casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const TOKEN_KEY  = 'gv_auth_token';

let _abilities = {
  payoutMultiplier: 0,
  luckBoost: 0,
  cashbackPct: 0,
  xpMultiplier: 0,
  crateDiscountPct: 0,
  jackpotChance: 0,
};
let _loaded = false;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Fetch the viewer's equipped-joker abilities. Call once when a game mounts.
 * Subsequent calls return the cached value unless `force` is true.
 */
export async function initJokerBonuses(force = false) {
  if (_loaded && !force) return _abilities;
  const token = getToken();
  if (!token) { _loaded = true; return _abilities; }
  try {
    const res = await fetch(`${SERVER_URL}/api/jokers/inventory`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const d = await res.json();
    if (d.ok && d.abilities) _abilities = { ..._abilities, ...d.abilities };
  } catch {}
  _loaded = true;
  return _abilities;
}

/** Returns cached abilities object (zeroed if not yet initialized). */
export function getAbilities() { return _abilities; }

/**
 * Apply joker bonuses to a game outcome and credit the bonus to the player's
 * balance via addBalance. Returns the bonus amount.
 *
 * @param {number} bet       bet size
 * @param {number} basePayout gross payout (0 on loss, else includes original bet)
 * @param {boolean} won      true on win, false on loss
 */
export function applyJokerBonus(bet, basePayout, won) {
  if (!_loaded) return 0;
  const a = _abilities;
  let bonus = 0;

  if (won && basePayout > bet) {
    const profit = basePayout - bet;
    if (a.payoutMultiplier > 0) bonus += Math.floor(profit * a.payoutMultiplier);
    if (a.jackpotChance > 0 && Math.random() < a.jackpotChance) bonus += profit;
  }
  if (!won && bet > 0 && a.cashbackPct > 0) {
    bonus += Math.floor(bet * a.cashbackPct);
  }

  if (bonus > 0) {
    addBalance(bonus);
    flashBonusToast(bonus);
  }
  return bonus;
}

export function flashBonusToast(amount) {
  if (!amount || amount <= 0) return;
  const t = document.createElement('div');
  t.textContent = `🃏 Joker bonus: +$${amount.toLocaleString()}`;
  Object.assign(t.style, {
    position: 'fixed', top: '80px', right: '20px',
    background: 'linear-gradient(135deg, #f472b6, #c084fc)',
    color: '#0a0a0f',
    padding: '12px 18px',
    borderRadius: '10px',
    fontWeight: '900',
    boxShadow: '0 4px 20px rgba(244,114,182,0.5)',
    zIndex: '10000',
    fontSize: '14px',
    transition: 'transform 0.4s, opacity 0.4s',
    transform: 'translateX(120%)',
    opacity: '0',
  });
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
  setTimeout(() => {
    t.style.transform = 'translateX(120%)';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 500);
  }, 3000);
}
