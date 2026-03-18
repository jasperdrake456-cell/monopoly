'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'riggedUsers.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}
function write(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function isRigged(username) { return read().includes(username); }
function getRiggedList() { return read(); }
function addRigged(username) {
  const list = read();
  if (!list.includes(username)) { list.push(username); write(list); }
  return { ok: true };
}
function removeRigged(username) {
  write(read().filter(u => u !== username));
  return { ok: true };
}

module.exports = { isRigged, getRiggedList, addRigged, removeRigged };
