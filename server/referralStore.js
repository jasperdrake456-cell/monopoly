'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR       = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE           = path.join(DATA_DIR, 'referrals.json');
const REFERRAL_BONUS = 10_000;  // $10k bonus for both referrer and new user

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { codes: {}, used: {} }; }
}
function write(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FILE);
}

/** Get or create a referral code for a user. */
function getCode(username) {
  const d    = read();
  const key  = username.toLowerCase();
  if (!d.codes[key]) {
    // Generate a short code: first 4 chars of username + random 4 chars
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    d.codes[key] = { code: key.slice(0, 4).toUpperCase() + rand, uses: 0, createdAt: Date.now() };
    write(d);
  }
  return d.codes[key].code;
}

/** Get stats for a user's referral code. */
function getStats(username) {
  const d   = read();
  const key = username.toLowerCase();
  const info = d.codes[key] || null;
  // Who used this code?
  const referrals = Object.entries(d.used)
    .filter(([, v]) => v.referredBy === key)
    .map(([newUser, v]) => ({ username: newUser, at: v.at }));
  return { code: info?.code || getCode(username), uses: info?.uses || 0, referrals };
}

/** Check if a code is valid. Returns the owner's username or null. */
function lookupCode(code) {
  const d = read();
  const entry = Object.entries(d.codes).find(([, v]) => v.code === code.toUpperCase());
  return entry ? entry[0] : null;
}

/** Mark a code as used by newUsername. Returns bonus amount if first use, else false. */
function useCode(code, newUsername) {
  const d   = read();
  const key = newUsername.toLowerCase();
  if (d.used[key]) return { ok: false, error: 'You have already used a referral code' };
  const owner = lookupCode(code);
  if (!owner) return { ok: false, error: 'Invalid referral code' };
  if (owner === key) return { ok: false, error: 'You cannot use your own referral code' };
  d.used[key] = { referredBy: owner, code, at: Date.now() };
  if (d.codes[owner]) d.codes[owner].uses++;
  write(d);
  return { ok: true, referredBy: owner, bonus: REFERRAL_BONUS };
}

module.exports = { getCode, getStats, lookupCode, useCode, REFERRAL_BONUS };
