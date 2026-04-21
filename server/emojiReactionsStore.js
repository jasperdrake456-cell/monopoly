'use strict';
// Stores emoji reactions for live win ticker entries.
// Keyed by win ID. Non-critical; in-memory only (resets on restart).

const ALLOWED_EMOJIS = ['🔥', '💰', '😂', '🚀', '👑', '💎', '🎉', '😱'];
const MAX_PER_WIN    = 50; // cap reactions per win entry

const _store = {}; // { winId: { emoji: count } }

function react(winId, emoji, username) {
  if (!ALLOWED_EMOJIS.includes(emoji)) return { ok: false, error: 'invalid_emoji' };
  if (!_store[winId]) _store[winId] = {};
  const total = Object.values(_store[winId]).reduce((s, n) => s + n, 0);
  if (total >= MAX_PER_WIN) return { ok: false, error: 'maxed' };
  _store[winId][emoji] = (_store[winId][emoji] || 0) + 1;
  return { ok: true, reactions: _store[winId] };
}

function getReactions(winId) {
  return _store[winId] || {};
}

function getAllowedEmojis() { return ALLOWED_EMOJIS; }

module.exports = { react, getReactions, getAllowedEmojis };
