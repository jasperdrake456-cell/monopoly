'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'news.json');
const MAX_ITEMS = 20;

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return []; }
}
function write(d) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, FILE);
}

function getNews() { return read(); }

function postNews({ title, body, type = 'info', pinned = false, adminName }) {
  const items = read();
  const item = {
    id:        `${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    title:     String(title || '').slice(0, 120),
    body:      String(body  || '').slice(0, 500),
    type,      // 'info' | 'event' | 'update' | 'warning'
    pinned:    !!pinned,
    author:    adminName,
    createdAt: Date.now(),
  };
  items.unshift(item);
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  write(items);
  return item;
}

function deleteNews(id) {
  write(read().filter(i => i.id !== id));
}

function pinNews(id, pinned) {
  const items = read().map(i => i.id === id ? { ...i, pinned } : i);
  write(items);
}

module.exports = { getNews, postNews, deleteNews, pinNews };
