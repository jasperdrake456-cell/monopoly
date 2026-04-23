'use strict';
/**
 * P2P trades: offerer and receiver each stake Joker instances + coins.
 * Coins are NOT held in escrow here — the balance is deducted at accept time.
 * Joker instances ARE held in escrow on the offerer side (removed from inventory
 * when offer is created, returned if cancelled/rejected).
 *
 * Lifecycle:
 *   - offer created → offerer's jokers removed from their inventory
 *   - receiver accepts → coin balances adjusted, items transferred both ways
 *   - receiver rejects / offerer cancels / expires → items returned to offerer
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'trades.json');
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = { offers: [] }; }
  if (!_cache.offers) _cache.offers = [];
  return _cache;
}
function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(_cache));
}

function genOfferId() {
  return 'tr_' + crypto.randomBytes(6).toString('hex');
}

function listByUser(username) {
  // Include both directions
  const now = Date.now();
  const all = load().offers.filter(o => o.status === 'open' && (now - o.createdAt) < EXPIRY_MS);
  return all.filter(o => o.offerer === username || o.receiver === username);
}

function getOffer(id) {
  return load().offers.find(o => o.id === id) || null;
}

/**
 * @param offererInstances  Array of instance objects (already removed from offerer inv by caller)
 * @param requestedJokerIds Array of jokerIds the receiver should send back
 */
function createOffer({ offerer, receiver, offererInstances, offererCoins, requestedJokerIds, requestedCoins, message }) {
  if (!offerer || !receiver || offerer === receiver) return { ok: false, error: 'Invalid parties' };
  offererCoins   = Math.max(0, Math.floor(offererCoins   || 0));
  requestedCoins = Math.max(0, Math.floor(requestedCoins || 0));
  if (!Array.isArray(offererInstances))  offererInstances  = [];
  if (!Array.isArray(requestedJokerIds)) requestedJokerIds = [];
  if (offererInstances.length === 0 && offererCoins === 0) {
    return { ok: false, error: 'Offer must include at least one joker or coins' };
  }
  const data = load();
  const offer = {
    id: genOfferId(),
    offerer,
    receiver,
    offererInstances,           // full instance objects in escrow
    offererCoins,               // deducted at accept time (verified then)
    requestedJokerIds,          // receiver must own at least one instance of each
    requestedCoins,
    message: (message || '').slice(0, 200),
    status: 'open',
    createdAt: Date.now(),
  };
  data.offers.push(offer);
  save();
  return { ok: true, offer };
}

function setStatus(offerId, status) {
  const data = load();
  const o = data.offers.find(x => x.id === offerId);
  if (!o) return { ok: false, error: 'Offer not found' };
  o.status = status;
  o.resolvedAt = Date.now();
  save();
  return { ok: true, offer: o };
}

function removeOffer(offerId) {
  const data = load();
  const idx = data.offers.findIndex(o => o.id === offerId);
  if (idx === -1) return { ok: false };
  const [removed] = data.offers.splice(idx, 1);
  save();
  return { ok: true, offer: removed };
}

module.exports = {
  EXPIRY_MS,
  listByUser,
  getOffer,
  createOffer,
  setStatus,
  removeOffer,
};
