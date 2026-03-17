'use strict';
const fs = require('fs');
const path = require('path');
const { isClean } = require('./profanity');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!require('fs').existsSync(DATA_DIR)) require('fs').mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'leaderboards.json');
const MAX = 10;

let store = {};

// Load from file on startup
try {
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
} catch (e) {
  store = {};
}

function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); } catch (e) {}
}

function getLeaderboard(gameId) {
  return store[gameId] || [];
}

function isHighScore(gameId, score, higherIsBetter = true) {
  const lb = getLeaderboard(gameId);
  if (lb.length < MAX) return true;
  const worst = lb[lb.length - 1].score;
  return higherIsBetter ? score > worst : score < worst;
}

function addScore(gameId, score, name, higherIsBetter = true) {
  if (!isClean(name)) return getLeaderboard(gameId); // silently reject offensive names
  const lb = getLeaderboard(gameId);
  lb.push({ name, score, date: new Date().toLocaleDateString() });
  lb.sort((a, b) => higherIsBetter ? b.score - a.score : a.score - b.score);
  store[gameId] = lb.slice(0, MAX);
  save();
  return store[gameId];
}

function getRank(gameId, score, higherIsBetter = true) {
  const lb = getLeaderboard(gameId);
  const sorted = [...lb, { score }].sort((a, b) =>
    higherIsBetter ? b.score - a.score : a.score - b.score
  );
  return sorted.findIndex(e => e.score === score) + 1;
}

function overwriteLeaderboard(gameId, entries) {
  store[gameId] = entries.slice(0, MAX);
  save();
}

module.exports = { getLeaderboard, isHighScore, addScore, getRank, overwriteLeaderboard };
