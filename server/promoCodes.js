'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const CODES_FILE = path.join(DATA_DIR, 'promoCodes.json');

function read() {
  try { return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); }
  catch { return {}; }
}

function write(data) {
  try { fs.writeFileSync(CODES_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch { /* non-fatal */ }
}

/**
 * Create a promo code.
 * @param {string} code     — the code string (e.g. "WELCOME500")
 * @param {number} amount   — chips to award on redeem
 * @param {number} maxUses  — 0 = unlimited
 */
function createCode(code, amount, maxUses = 0) {
  const key = code.trim().toUpperCase();
  if (!key) return { ok: false, error: 'Empty code' };
  if (typeof amount !== 'number' || amount < 1) return { ok: false, error: 'Invalid amount' };
  const data = read();
  if (data[key]) return { ok: false, error: 'Code already exists' };
  data[key] = {
    code:      key,
    amount:    Math.floor(amount),
    maxUses:   Math.max(0, Math.floor(maxUses || 0)),
    uses:      0,
    redeemedBy: [],
    createdAt: Date.now(),
    active:    true,
  };
  write(data);
  return { ok: true, code: data[key] };
}

/** List all codes (admin view). */
function getCodes() {
  const data = read();
  return Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
}

/** Delete a code. */
function deleteCode(code) {
  const key  = code.trim().toUpperCase();
  const data = read();
  if (!data[key]) return { ok: false, error: 'Code not found' };
  delete data[key];
  write(data);
  return { ok: true };
}

/**
 * Attempt to redeem a code for a username.
 * Returns { ok, amount, error }
 */
function redeemCode(code, username) {
  const key  = (code || '').trim().toUpperCase();
  const user = (username || '').trim().toLowerCase();
  if (!key)  return { ok: false, error: 'Enter a code' };
  if (!user) return { ok: false, error: 'Not logged in' };

  const data = read();
  const entry = data[key];
  if (!entry || !entry.active) return { ok: false, error: 'Invalid or expired code' };
  if (entry.redeemedBy.includes(user)) return { ok: false, error: 'You already redeemed this code' };
  if (entry.maxUses > 0 && entry.uses >= entry.maxUses) return { ok: false, error: 'Code has reached its usage limit' };

  entry.uses++;
  entry.redeemedBy.push(user);
  // Auto-deactivate once maxUses reached
  if (entry.maxUses > 0 && entry.uses >= entry.maxUses) entry.active = false;
  write(data);
  return { ok: true, amount: entry.amount };
}

module.exports = { createCode, getCodes, deleteCode, redeemCode };
