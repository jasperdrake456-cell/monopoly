'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'champion.json');

const BROADCAST_LIMIT  = 3;   // broadcasts per week
const MUTE_LIMIT       = 3;   // mutes per week
const HAPPY_HOUR_MS    = 30 * 60 * 1000; // 30 minutes
const HAPPY_HOUR_BOOST = 2.0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultState() {
  return {
    champion:        null,  // { username, displayName, startedAt }
    broadcastsUsed:  0,
    mutesUsed:       0,
    happyHourUsed:   false,
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

// ── Core state ────────────────────────────────────────────────────────────────

// Returns current state, auto-expiring happy hour if it has elapsed.
function getState() {
  const data = read();
  if (data.happyHourActive && data.happyHourEndsAt && Date.now() > data.happyHourEndsAt) {
    data.happyHourActive = false;
    write(data);
  }
  return data;
}

// Crown a new champion — resets all weekly power counters.
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

// Happy hour multiplier — returns 2.0 during active happy hour, else 1.0.
function getHappyHourMultiplier() {
  const data = read();
  if (data.happyHourActive && data.happyHourEndsAt && Date.now() < data.happyHourEndsAt) {
    return HAPPY_HOUR_BOOST;
  }
  return 1.0;
}

// ── Champion power actions ────────────────────────────────────────────────────

function useBroadcast(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.broadcastsUsed >= BROADCAST_LIMIT) {
    return { ok: false, error: `All ${BROADCAST_LIMIT} broadcasts used for this week` };
  }
  data.broadcastsUsed++;
  write(data);
  return { ok: true, used: data.broadcastsUsed, limit: BROADCAST_LIMIT };
}

function useMute(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.mutesUsed >= MUTE_LIMIT) {
    return { ok: false, error: `All ${MUTE_LIMIT} mutes used for this week` };
  }
  data.mutesUsed++;
  write(data);
  return { ok: true, used: data.mutesUsed, limit: MUTE_LIMIT };
}

function triggerHappyHour(username) {
  if (!isChampion(username)) return { ok: false, error: 'Not the current champion' };
  const data = getState();
  if (data.happyHourUsed) return { ok: false, error: 'Happy hour already used this week' };
  data.happyHourUsed   = true;
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
  BROADCAST_LIMIT,
  MUTE_LIMIT,
  HAPPY_HOUR_MS,
};
