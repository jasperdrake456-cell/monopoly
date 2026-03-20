'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'gameOdds.json');

// Known casino game slugs
const CASINO_SLUGS = [
  'crash','plinko','dice','roulette','blackjack','baccarat',
  'mines','ride-the-bus','slots','chicken-cross','hilo','tower',
  'wheel','video-poker','keno','dragon-tiger',
];

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { overrides: {}, wildcardOverride: null, wildcardBoost: 1.5 }; }
}
function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Returns "YYYY-MM-DD" in server local time
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Deterministic daily wildcard — picks based on date unless admin/champion overrides
// Champion overrides are auto-expired at midnight (wildcardOverrideDate must match today)
function getDailyWildcard() {
  const data = read();
  // Admin overrides are permanent; champion GOTD overrides expire at midnight
  if (data.wildcardOverride) {
    if (data.wildcardOverridePermanent || data.wildcardOverrideDate === todayStr()) {
      return data.wildcardOverride;
    }
  }
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return CASINO_SLUGS[seed % CASINO_SLUGS.length];
}

function getWildcardBoost() { return read().wildcardBoost ?? 1.5; }

function getGameBoost(slug) {
  const data = read();
  const wildcard = getDailyWildcard();
  const wildcardBoost = data.wildcardBoost ?? 1.5;
  const adminBoost = data.overrides?.[slug] ?? 1.0;
  // If it's the wildcard, apply wildcard boost on top of admin boost
  return slug === wildcard ? adminBoost * wildcardBoost : adminBoost;
}

function setGameBoost(slug, multiplier) {
  const data = read();
  if (!data.overrides) data.overrides = {};
  data.overrides[slug] = Math.max(0.1, Math.min(5.0, Number(multiplier)));
  write(data);
  return { ok: true };
}

function resetGameBoost(slug) {
  const data = read();
  if (data.overrides) delete data.overrides[slug];
  write(data);
  return { ok: true };
}

// permanent = true for admin overrides (never auto-expires); false for champion GOTD (expires at midnight)
function setWildcardOverride(slug, permanent = false) {
  const data = read();
  data.wildcardOverride = slug || null;
  data.wildcardOverridePermanent = slug ? permanent : false;
  data.wildcardOverrideDate = (slug && !permanent) ? todayStr() : null;
  write(data);
  return { ok: true };
}

function setWildcardBoost(multiplier) {
  const data = read();
  data.wildcardBoost = Math.max(1.0, Math.min(5.0, Number(multiplier)));
  write(data);
  return { ok: true };
}

function getAllBoosts() {
  const data = read();
  return { overrides: data.overrides || {}, wildcardOverride: data.wildcardOverride, wildcardBoost: data.wildcardBoost ?? 1.5, wildcard: getDailyWildcard() };
}

module.exports = { getDailyWildcard, getWildcardBoost, getGameBoost, setGameBoost, resetGameBoost, setWildcardOverride, setWildcardBoost, getAllBoosts, CASINO_SLUGS };
