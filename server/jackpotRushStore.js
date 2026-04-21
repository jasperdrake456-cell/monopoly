'use strict';
// Jackpot Rush: random 1-hour windows where slots jackpot seed grows 2× faster.
// A new rush can trigger once every 6 hours (random chance checked each hour).
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'jackpotRush.json');

const RUSH_DURATION_MS   = 60 * 60 * 1000;   // 1 hour
const COOLDOWN_MS        = 6 * 60 * 60 * 1000; // 6 hours between rushes
const TRIGGER_CHANCE     = 0.35;               // 35% chance per hourly check

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { activeUntil: 0, lastTriggered: 0 }; }
}
function write(d) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, FILE);
  } catch { /* non-fatal */ }
}

function getStatus() {
  const d   = read();
  const now = Date.now();
  const active    = now < d.activeUntil;
  const remaining = active ? Math.max(0, d.activeUntil - now) : 0;
  return { active, remaining, activeUntil: d.activeUntil, lastTriggered: d.lastTriggered };
}

// Called by a setInterval in index.js (every hour)
function tryTrigger() {
  const d   = read();
  const now = Date.now();
  if (now < d.activeUntil) return { triggered: false, reason: 'already_active' };
  if (now - d.lastTriggered < COOLDOWN_MS) return { triggered: false, reason: 'cooldown' };
  if (Math.random() > TRIGGER_CHANCE) return { triggered: false, reason: 'no_luck' };
  d.activeUntil     = now + RUSH_DURATION_MS;
  d.lastTriggered   = now;
  write(d);
  return { triggered: true, activeUntil: d.activeUntil };
}

// Admin-force start
function forceStart() {
  const d = read();
  d.activeUntil   = Date.now() + RUSH_DURATION_MS;
  d.lastTriggered = Date.now();
  write(d);
  return getStatus();
}

module.exports = { getStatus, tryTrigger, forceStart };
