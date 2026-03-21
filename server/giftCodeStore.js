'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'giftCodes.json');

let _cache = null;

function read() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = []; }
  return _cache;
}
function write(data) {
  _cache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data));
}

/**
 * Admin: create a new gift code.
 * maxUses = 0 means unlimited.
 */
function createCode({ code, amount, maxUses = 1, expiresAt = null, note = '' }) {
  const codes = read();
  const clean = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return { ok: false, error: 'Invalid code — use letters and numbers only' };
  if (codes.find(c => c.code === clean)) return { ok: false, error: 'Code already exists' };
  const amt = Math.floor(Number(amount));
  if (!amt || amt < 1) return { ok: false, error: 'Invalid amount' };

  const entry = {
    code:      clean,
    amount:    amt,
    maxUses:   Math.max(0, Math.floor(Number(maxUses))), // 0 = unlimited
    uses:      0,
    usedBy:    [],
    note:      String(note || '').slice(0, 120),
    expiresAt: expiresAt || null,
    createdAt: Date.now(),
  };
  codes.push(entry);
  write(codes);
  return { ok: true, entry };
}

/**
 * Player: redeem a gift code.
 * Returns { ok, amount } or { ok: false, error }.
 */
function redeemCode(code, username) {
  const codes = read();
  const clean = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const entry = codes.find(c => c.code === clean);
  if (!entry) return { ok: false, error: 'Invalid code' };
  if (entry.usedBy.includes(username)) return { ok: false, error: 'You have already redeemed this code' };
  if (entry.maxUses > 0 && entry.uses >= entry.maxUses) return { ok: false, error: 'This code has run out of uses' };
  if (entry.expiresAt && Date.now() > entry.expiresAt) return { ok: false, error: 'This code has expired' };

  entry.uses++;
  entry.usedBy.push(username);
  write(codes);
  return { ok: true, amount: entry.amount, code: entry.code };
}

function listCodes() {
  return read().map(c => ({
    ...c,
    usedBy: c.usedBy, // include for admin view
    remaining: c.maxUses === 0 ? '∞' : c.maxUses - c.uses,
  }));
}

function deleteCode(code) {
  write(read().filter(c => c.code !== (code || '').toUpperCase()));
  return { ok: true };
}

module.exports = { createCode, redeemCode, listCodes, deleteCode };
