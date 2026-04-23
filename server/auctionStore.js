'use strict';
/**
 * Auction House for Jokers.
 *
 * Sellers list a Joker instance at a fixed price (instant-buy style).
 * Buyers purchase the listing; coins transfer, instance transfers.
 * The Joker instance is held in escrow (removed from seller inventory) while listed.
 * Sellers can cancel to return the instance.
 *
 * Also tracks market value per jokerId: rolling average of last N sale prices,
 * falling back to baseValue if no sales yet.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'auctions.json');
const HOUSE_FEE = 0.05; // 5% seller fee
const MAX_HISTORY = 20;  // per-joker sale history used for value tracker

let _cache = null;
function load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { _cache = { listings: [], history: {} }; }
  if (!_cache.listings) _cache.listings = [];
  if (!_cache.history)  _cache.history  = {};
  return _cache;
}
function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(_cache));
}

function genListingId() {
  return 'lst_' + crypto.randomBytes(6).toString('hex');
}

// ── Public helpers ─────────────────────────────────────────────────────────
function listAll() {
  return load().listings.slice().sort((a, b) => b.listedAt - a.listedAt);
}

function listByJoker(jokerId) {
  return load().listings.filter(l => l.jokerId === jokerId);
}

function listBySeller(username) {
  return load().listings.filter(l => l.seller === username);
}

function getListing(listingId) {
  return load().listings.find(l => l.id === listingId) || null;
}

function getHouseFee() { return HOUSE_FEE; }

// ── Market value tracker ───────────────────────────────────────────────────
// Returns dynamic market value — rolling avg of recent sales, or baseValue.
function marketValue(jokerId, baseValue) {
  const data = load();
  const history = data.history[jokerId] || [];
  if (history.length === 0) return baseValue;
  const sum = history.reduce((s, h) => s + h.price, 0);
  return Math.round(sum / history.length);
}

function marketSnapshot(jokerId, baseValue) {
  const data = load();
  const history = data.history[jokerId] || [];
  return {
    jokerId,
    marketValue: marketValue(jokerId, baseValue),
    recentSales: history.slice(-10).reverse(),
    salesCount: history.length,
  };
}

function recordSale(jokerId, price) {
  const data = load();
  if (!data.history[jokerId]) data.history[jokerId] = [];
  data.history[jokerId].push({ price, at: Date.now() });
  if (data.history[jokerId].length > MAX_HISTORY) {
    data.history[jokerId] = data.history[jokerId].slice(-MAX_HISTORY);
  }
  save();
}

// ── Create / cancel / buy ──────────────────────────────────────────────────
function createListing({ seller, instance, price }) {
  price = Math.floor(price);
  if (!seller || !instance || !price || price <= 0) {
    return { ok: false, error: 'Invalid listing params' };
  }
  if (price > 100_000_000_000) return { ok: false, error: 'Price too high' };
  const data = load();
  const listing = {
    id:        genListingId(),
    seller,
    instance,   // { instanceId, jokerId, acquiredAt }
    jokerId:   instance.jokerId,
    price,
    listedAt:  Date.now(),
  };
  data.listings.push(listing);
  save();
  return { ok: true, listing };
}

function cancelListing(listingId, seller) {
  const data = load();
  const idx = data.listings.findIndex(l => l.id === listingId);
  if (idx === -1) return { ok: false, error: 'Listing not found' };
  if (data.listings[idx].seller !== seller) return { ok: false, error: 'Not your listing' };
  const [removed] = data.listings.splice(idx, 1);
  save();
  return { ok: true, instance: removed.instance };
}

// Removes the listing WITHOUT paying escrow back — used when buy completes.
function consumeListing(listingId) {
  const data = load();
  const idx = data.listings.findIndex(l => l.id === listingId);
  if (idx === -1) return { ok: false, error: 'Listing not found' };
  const [removed] = data.listings.splice(idx, 1);
  save();
  return { ok: true, listing: removed };
}

module.exports = {
  HOUSE_FEE,
  listAll,
  listByJoker,
  listBySeller,
  getListing,
  getHouseFee,
  marketValue,
  marketSnapshot,
  recordSale,
  createListing,
  cancelListing,
  consumeListing,
};
