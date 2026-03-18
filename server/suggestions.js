'use strict';
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'suggestions.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}
function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Returns null if user already has a pending suggestion
function addSuggestion(username, displayName, text) {
  const all = read();
  const hasPending = all.some(s => s.username === username && s.status === 'pending');
  if (hasPending) return { error: 'You already have a pending suggestion. Wait for it to be reviewed.' };
  const entry = {
    id: crypto.randomBytes(6).toString('hex'),
    username,
    displayName: displayName || username,
    text: String(text || '').trim().slice(0, 500),
    status: 'pending',
    createdAt: Date.now(),
  };
  all.unshift(entry);
  if (all.length > 1000) all.length = 1000;
  write(all);
  return { ok: true, suggestion: entry };
}

function getSuggestions() { return read(); }
function getUserSuggestion(username) {
  return read().find(s => s.username === username) || null;
}
function reviewSuggestion(id, status) {
  const all = read();
  const s = all.find(s => s.id === id);
  if (!s) return { error: 'Not found' };
  s.status = status;
  s.reviewedAt = Date.now();
  write(all);
  return { ok: true, suggestion: s };
}
function deleteSuggestion(id) {
  const all = read().filter(s => s.id !== id);
  write(all);
  return { ok: true };
}

module.exports = { addSuggestion, getSuggestions, getUserSuggestion, reviewSuggestion, deleteSuggestion };
