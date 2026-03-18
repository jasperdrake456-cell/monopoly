'use strict';

const fs   = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', 'data', 'chatStore.json');
const MAX_HISTORY = 300; // messages kept in storage

const DEFAULT_SETTINGS = {
  strictness:      'strict',  // 'strict' | 'moderate' | 'relaxed'
  slowMode:        0,         // seconds between messages per user (0 = off)
  maxLength:       200,       // max chars per message
  blockLinks:      true,      // block URLs / invite links
  blockAllCaps:    true,      // block messages >70% uppercase
  blockCharSpam:   true,      // block repeated chars (aaaaaaa)
  blockRepeat:     true,      // block duplicate message spam
  repeatWindow:    3,         // N identical messages = blocked
  maxEmojis:       6,         // 0 = unlimited
  shadowMute:      true,      // shadow-mute (sender sees msg, no one else does)
  autoMuteAfter:   3,         // violations before auto-mute (0 = disabled)
  muteEnabled:     true,      // enable auto-mute system
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      messages:   Array.isArray(raw.messages)  ? raw.messages  : [],
      chatBans:   Array.isArray(raw.chatBans)  ? raw.chatBans  : [],
      settings:   { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      violations: typeof raw.violations === 'object' ? raw.violations : {},
    };
  } catch {
    return { messages: [], chatBans: [], settings: { ...DEFAULT_SETTINGS }, violations: {} };
  }
}

function write(data) {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8'); }
  catch { /* non-fatal */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

function getSettings()  { return read().settings; }
function getMessages()  { return read().messages; }
function getChatBans()  { return read().chatBans; }

function updateSettings(patch) {
  const data = read();
  data.settings = { ...data.settings, ...patch };
  write(data);
  return data.settings;
}

function addMessage(msg) {
  const data = read();
  data.messages.push(msg);
  if (data.messages.length > MAX_HISTORY) {
    data.messages = data.messages.slice(-MAX_HISTORY);
  }
  write(data);
}

function clearMessages() {
  const data = read();
  data.messages = [];
  write(data);
}

function addSystemMessage(text) {
  const crypto = require('crypto');
  const msg = {
    id:        crypto.randomBytes(8).toString('hex'),
    username:  'system',
    displayName: '📢 Announcement',
    text,
    timestamp: Date.now(),
    isSystem:  true,
  };
  addMessage(msg);
  return msg;
}

// ── Chat bans ─────────────────────────────────────────────────────────────────

function isChatBanned(username) {
  const data = read();
  const lc   = username.toLowerCase();
  const ban  = data.chatBans.find(b => b.username.toLowerCase() === lc);
  if (!ban) return null;
  if (ban.expiresAt && Date.now() > ban.expiresAt) {
    data.chatBans = data.chatBans.filter(b => b.username.toLowerCase() !== lc);
    write(data);
    return null;
  }
  return ban;
}

function addChatBan(username, reason, expiresAt, bannedBy) {
  const data = read();
  const lc   = username.toLowerCase();
  data.chatBans = data.chatBans.filter(b => b.username.toLowerCase() !== lc);
  data.chatBans.push({
    username:  lc,
    reason:    reason   || '',
    bannedAt:  Date.now(),
    expiresAt: expiresAt || null,
    bannedBy:  bannedBy  || 'system',
  });
  write(data);
}

function removeChatBan(username) {
  const data = read();
  data.chatBans = data.chatBans.filter(b => b.username.toLowerCase() !== username.toLowerCase());
  write(data);
}

// ── Violations ────────────────────────────────────────────────────────────────

function getViolations(username) {
  return read().violations[username.toLowerCase()] || 0;
}

function addViolation(username) {
  const data = read();
  const key  = username.toLowerCase();
  data.violations[key] = (data.violations[key] || 0) + 1;
  write(data);
  return data.violations[key];
}

function resetViolations(username) {
  const data = read();
  delete data.violations[username.toLowerCase()];
  write(data);
}

function getAllViolations() {
  const data = read();
  return Object.entries(data.violations)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([username, count]) => ({ username, count }));
}

module.exports = {
  getSettings, getMessages, getChatBans,
  updateSettings, addMessage, clearMessages, addSystemMessage,
  isChatBanned, addChatBan, removeChatBan,
  getViolations, addViolation, resetViolations, getAllViolations,
};
