'use strict';
/**
 * Wishing Well — users throw in $1000 chips, every hour a random contributor
 * gets 10× their contribution. Simple, addictive, and rewards participation.
 *
 * Tick runs every minute and fires winner if >= 60 min since last draw.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'wishingWell.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE))     fs.writeFileSync(FILE, '{}', 'utf8');

const THROW_AMOUNT  = 1000;
const WIN_MULTI     = 10;
const DRAW_INTERVAL = 60 * 60 * 1000;  // 1 hour
const MAX_WISHES    = 1000;            // cap pool size

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { wishes: [], lastDraw: 0, history: [] }; }
}
function save(d) {
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {}
}

let state = load();
if (!state.wishes)  state.wishes  = [];
if (!state.history) state.history = [];
if (!state.lastDraw) state.lastDraw = Date.now();

function throwIn(username) {
  if (state.wishes.length >= MAX_WISHES) {
    return { ok: false, error: 'Well is full — wait for next draw' };
  }
  state.wishes.push({ username, at: Date.now() });
  save(state);
  return { ok: true, wishes: state.wishes.length, nextDrawIn: Math.max(0, state.lastDraw + DRAW_INTERVAL - Date.now()) };
}

function getStatus() {
  return {
    wishes: state.wishes.length,
    nextDrawIn: Math.max(0, state.lastDraw + DRAW_INTERVAL - Date.now()),
    lastDraw: state.lastDraw,
    history: state.history.slice(0, 10),
    throwAmount: THROW_AMOUNT,
    winMulti: WIN_MULTI,
  };
}

/** Returns { winner, prize } if drawn, else null. */
function draw() {
  if (Date.now() - state.lastDraw < DRAW_INTERVAL) return null;
  if (state.wishes.length === 0) {
    state.lastDraw = Date.now();
    save(state);
    return null;
  }
  // Pick random wish; each wish is one ticket (username may have multiple)
  const pick = state.wishes[Math.floor(Math.random() * state.wishes.length)];
  const winnings = THROW_AMOUNT * WIN_MULTI;
  const participants = state.wishes.length;

  state.history.unshift({
    winner: pick.username,
    prize: winnings,
    participants,
    at: Date.now(),
  });
  if (state.history.length > 50) state.history.length = 50;

  state.wishes = [];
  state.lastDraw = Date.now();
  save(state);
  return { winner: pick.username, prize: winnings, participants };
}

module.exports = { throwIn, getStatus, draw, THROW_AMOUNT, WIN_MULTI };
