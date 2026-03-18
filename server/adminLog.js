'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, 'data');
const LOG_FILE  = path.join(DATA_DIR, 'adminLog.json');
const MAX_ENTRIES = 500;

function read() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return []; }
}

function write(entries) {
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), 'utf8'); }
  catch { /* non-fatal */ }
}

/**
 * Log an admin action.
 * @param {string} action   — short action name, e.g. "give_money"
 * @param {object} details  — free-form metadata object
 */
function log(action, details = {}) {
  const entries = read();
  entries.unshift({
    id:        crypto.randomBytes(6).toString('hex'),
    action,
    details,
    timestamp: Date.now(),
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  write(entries);
}

function getLogs() {
  return read();
}

function clearLogs() {
  write([]);
}

module.exports = { log, getLogs, clearLogs };
