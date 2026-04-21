'use strict';
/**
 * Bank / Vault store — users deposit balance into locked savings that accrue
 * interest over time. Three tiers:
 *   instant  — no lock,  0.5%/day  (accrued hourly)
 *   7-day    — 7-day lock, 1.5%/day
 *   30-day   — 30-day lock, 5%/day
 *
 * Interest is continuously accrued. The more you lock, the more you earn.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'bank.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}', 'utf8');

const DAY_MS = 24 * 60 * 60 * 1000;

// Tier config: apy is effective daily rate (compounds continuously via accrue)
const TIERS = {
  instant: { name: 'Instant Access', lockDays: 0,  dailyRate: 0.005, emoji: '💵' }, // 0.5%
  short:   { name: '7-Day Lock',     lockDays: 7,  dailyRate: 0.015, emoji: '🏦' }, // 1.5%
  long:    { name: '30-Day Vault',   lockDays: 30, dailyRate: 0.05,  emoji: '💎' }, // 5%
};

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function save(d) {
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {}
}

let cache = load();

function getPositions(username) {
  const key = (username || '').toLowerCase();
  if (!cache[key]) cache[key] = [];
  // Accrue interest for all active positions
  accruePositions(cache[key]);
  return cache[key];
}

function accruePositions(positions) {
  const now = Date.now();
  for (const p of positions) {
    const elapsedMs  = now - (p.lastAccrue || p.openedAt);
    if (elapsedMs <= 0) continue;
    const tier = TIERS[p.tier];
    if (!tier) continue;
    // rate per ms = dailyRate / DAY_MS
    const interest = p.principal * tier.dailyRate * (elapsedMs / DAY_MS);
    p.accruedInterest = (p.accruedInterest || 0) + interest;
    p.lastAccrue = now;
  }
}

function deposit(username, tierKey, amount) {
  if (!TIERS[tierKey]) return { ok: false, error: 'Invalid tier' };
  const amt = Math.floor(amount);
  if (amt < 1000) return { ok: false, error: 'Minimum deposit: 1,000' };
  const positions = getPositions(username);
  const now = Date.now();
  const tier = TIERS[tierKey];
  positions.push({
    id: `bnk_${now}_${Math.random().toString(36).slice(2, 8)}`,
    tier: tierKey,
    principal: amt,
    accruedInterest: 0,
    openedAt: now,
    unlocksAt: now + tier.lockDays * DAY_MS,
    lastAccrue: now,
  });
  save(cache);
  return { ok: true, positions };
}

function withdraw(username, positionId) {
  const positions = getPositions(username);
  const idx = positions.findIndex(p => p.id === positionId);
  if (idx === -1) return { ok: false, error: 'Position not found' };
  const pos = positions[idx];
  if (Date.now() < pos.unlocksAt) {
    const waitMs = pos.unlocksAt - Date.now();
    return { ok: false, error: `Still locked for ${Math.ceil(waitMs / 1000 / 60)} min` };
  }
  const payout = Math.floor(pos.principal + (pos.accruedInterest || 0));
  positions.splice(idx, 1);
  save(cache);
  return { ok: true, payout, positions };
}

function totalDeposited(username) {
  const positions = getPositions(username);
  return positions.reduce((s, p) => s + p.principal + (p.accruedInterest || 0), 0);
}

function getTiers() {
  return TIERS;
}

module.exports = { deposit, withdraw, getPositions, totalDeposited, getTiers };
