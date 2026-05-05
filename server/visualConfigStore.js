'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'visualConfig.json');

/**
 * Site-wide visual settings. Persisted on disk, served publicly so every
 * client renders the same vibe. Tuning happens in the admin panel.
 *
 *   brightness     — 0.0–2.0 multiplier on the body filter (1.0 = normal)
 *   saturation     — 0.0–2.0 multiplier
 *   flashIntensity — 0.0–1.5 multiplier on glow opacity / shadow depth
 *   discoEnabled   — bool: rotating conic background overlay
 *   starsEnabled   — bool: twinkling starfield
 *   strobeEnabled  — bool: full-screen periodic flash
 *   pulseEnabled   — bool: nav-pill / heading pulse animations
 *   animationSpeed — 0.25–4.0 multiplier on animation durations (1.0 = normal,
 *                    higher = slower since durations are multiplied)
 */
const DEFAULTS = {
  brightness:     1.0,
  saturation:     1.0,
  flashIntensity: 1.0,
  discoEnabled:   true,
  starsEnabled:   true,
  strobeEnabled:  true,
  pulseEnabled:   true,
  animationSpeed: 1.0,
};

let _cache = null;

function read() {
  if (_cache) return _cache;
  try { _cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch { _cache = { ...DEFAULTS }; }
  return _cache;
}

function write(data) {
  _cache = data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getConfig() { return read(); }

function update(partial) {
  const cur = read();
  const next = { ...cur };
  for (const key of Object.keys(DEFAULTS)) {
    if (partial[key] === undefined) continue;
    if (typeof DEFAULTS[key] === 'boolean') {
      next[key] = !!partial[key];
    } else {
      const v = Number(partial[key]);
      if (Number.isFinite(v)) next[key] = Math.max(0, Math.min(4, v));
    }
  }
  write(next);
  return next;
}

function reset() {
  write({ ...DEFAULTS });
  return read();
}

module.exports = { getConfig, update, reset, DEFAULTS };
