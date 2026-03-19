'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'champion.json');

const BROADCAST_LIMIT  = 3;    // per day
const MUTE_LIMIT       = 2;    // per day
const HAPPY_HOUR_MS    = 30 * 60 * 1000; // 30 minutes
const HAPPY_HOUR_BOOST = 1.5;
const AIRDROP_MAX      = 50000; // max coins per airdrop

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns today's date string "YYYY-MM-DD" (server local time)
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function defaultState() {
  return {
    champion:        null,  // { username, displayName, startedAt }
    // Daily-reset counters — each has a date stamp
    broadcasts:      { date: '', used: 0 },     // 3/day
    mutes:           { date: '', used: 0 },     // 2/day
    happyHour:       { date: '', used: false }, // 1/day
    gotd:            { date: '', used: false }, // 1/day
    airdrop:         { date: '', used: false }, // 1/day
    // Live happy-hour state
    happyHourActive: false,
    happyHourEndsAt: null,
  };
}

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return defaultState(); }
}

function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Auto-reset a daily counter if the stored date ≠ today.
function refreshDaily(counter, limit) {
  const t = today();
  if (counter.date !== t) {
    counter.date = t;
    counter.used = (typeof counter.used === 'boolean') ? false : 0;
  }
  return counter;
}

// ── Core state ────────────────────────────────────────────────────────────────

// Returns current state with daily counters refreshed and happy hour auto-expired.
function getState() {
  const data = read();

  // Ensure sub-objects exist (forward-compat with old data on disk)
  if (!data.broadcasts) data.broadcasts = { date: '', used: 0 };
  if (!data.mutes)      data.mutes      = { date: '', used: 0 };
  if (!data.happyHour)  data.happyHour  = { date: '', used: false };
  if (!data.gotd)       data.gotd       = { date: '', used: false };
  if (!data.airdrop)    data.airdrop    = { date: '', used: false };

  // Daily resets
  let dirty = false;
  const t = today();
  if (data.broadcasts.date !== t) { data.broadcasts = { date: t, used: 0 };        dirty = true; }
  if (data.mutes.date      !== t) { data.mutes      = { date: t, used: 0 };        dirty = true; }
  if (data.happyHour.date  !== t) { data.happyHour  = { date: t, used: false };    dirty = true; }
  if (data.gotd.date       !== t) { data.gotd       = { date: t, used: false };    dirty = true; }
  if (data.airdrop.date    !== t) { data.airdrop    = { date: t, used: false };    dirty = true; }

  // Happy hour expiry
  if (data.happyHourActive && data.happyHourEndsAt && Date.now() > data.happyHourEndsAt) {
    data.happyHourActive = false;
    dirty = true;
  }

  if (dirty) write(data);
  return data;
}

// Crown a new champion — fully resets all power counters.
// The old champion is implicitly removed (no separate storage).
function setChampion(username, displayName) {
  const state = defaultState();
  state.champion = {
    username:    username.toLowerCase(),
    displayName: displayName || username,
    startedAt:   Date.now(),
  };
  write(state);
  return state;
}

function clearChampion() {
  write(defaultState());
}

function isChampion(username) {
  const data = read();
  return !!(data.champion && data.champion.username === (username || '').toLowerCase());
}

// Returns 1.5 during active happy hour, else 1.0.
function getHappyHourMultiplier() {
  const data = read();
  if (data.happyHourActive && data.happyHourEndsAt && Date.now() < data.happyHourEndsAt) {
    return HAPPY_HOUR_BOOST;
  }
  return 1.0;
}

// ── Champion power actions ─────────────────────────────────────────────────────

function useBroadcast(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.broadcasts.used >= BROADCAST_LIMIT) {
    return { ok: false, error: `All ${BROADCAST_LIMIT} broadcasts used today — resets at midnight` };
  }
  data.broadcasts.used++;
  write(data);
  return { ok: true, used: data.broadcasts.used, limit: BROADCAST_LIMIT };
}

function useMute(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.mutes.used >= MUTE_LIMIT) {
    return { ok: false, error: `All ${MUTE_LIMIT} mutes used today — resets at midnight` };
  }
  data.mutes.used++;
  write(data);
  return { ok: true, used: data.mutes.used, limit: MUTE_LIMIT };
}

function useGotd(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.gotd.used) return { ok: false, error: 'Game of the Day override already used today — resets at midnight' };
  data.gotd.used = true;
  write(data);
  return { ok: true };
}

function useAirdrop(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.airdrop.used) return { ok: false, error: 'Airdrop already used today — resets at midnight' };
  data.airdrop.used = true;
  write(data);
  return { ok: true };
}

function triggerHappyHour(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.happyHour.used) return { ok: false, error: 'Happy hour already used today — resets at midnight' };
  data.happyHour.used  = true;
  data.happyHourActive = true;
  data.happyHourEndsAt = Date.now() + HAPPY_HOUR_MS;
  write(data);
  return { ok: true, endsAt: data.happyHourEndsAt };
}

module.exports = {
  getState,
  setChampion,
  clearChampion,
  isChampion,
  getHappyHourMultiplier,
  useBroadcast,
  useMute,
  triggerHappyHour,
  useGotd,
  useAirdrop,
  BROADCAST_LIMIT,
  MUTE_LIMIT,
  HAPPY_HOUR_MS,
  AIRDROP_MAX,
};
