'use strict';
/**
 * Crypto Limit Orders — users queue buy/sell/short/close-short orders at a
 * target price. An external tick function (called from the price feed)
 * evaluates pending orders on each price update and fires matching ones.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'cryptoOrders.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf8');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(d) {
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {}
}

let orders = load();

/**
 * Place a limit order.
 *   type      — 'buy' | 'sell' | 'short' | 'close-short'
 *   direction — 'above' | 'below' (trigger when price crosses in this direction)
 */
function placeOrder(username, { type, coinId, amountUSD, targetPrice, direction }) {
  if (!['buy', 'sell', 'short', 'close-short'].includes(type)) {
    return { ok: false, error: 'Invalid order type' };
  }
  if (!['above', 'below'].includes(direction)) {
    return { ok: false, error: 'Invalid direction' };
  }
  const tPrice = Number(targetPrice);
  if (!Number.isFinite(tPrice) || tPrice <= 0) return { ok: false, error: 'Invalid target price' };

  const order = {
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: (username || '').toLowerCase(),
    type,
    coinId,
    amountUSD: Math.floor(amountUSD || 0),
    targetPrice: tPrice,
    direction,
    status: 'pending',
    createdAt: Date.now(),
  };
  orders.push(order);
  save(orders);
  return { ok: true, order };
}

function getUserOrders(username) {
  const clean = (username || '').toLowerCase();
  return orders.filter(o => o.username === clean);
}

function cancelOrder(username, id) {
  const idx = orders.findIndex(o => o.id === id && o.username === (username || '').toLowerCase());
  if (idx === -1) return { ok: false, error: 'Order not found' };
  if (orders[idx].status !== 'pending') return { ok: false, error: 'Order already executed' };
  orders[idx].status = 'cancelled';
  orders[idx].closedAt = Date.now();
  save(orders);
  return { ok: true };
}

/**
 * Check every pending order against currentPrices (map from coinId -> price).
 * Returns array of triggered orders (caller handles actual buy/sell execution).
 */
function checkTriggers(currentPrices) {
  const triggered = [];
  for (const o of orders) {
    if (o.status !== 'pending') continue;
    const price = currentPrices[o.coinId];
    if (!Number.isFinite(price)) continue;
    const hit =
      (o.direction === 'above' && price >= o.targetPrice) ||
      (o.direction === 'below' && price <= o.targetPrice);
    if (hit) {
      o.status = 'triggered';
      o.triggeredAt = Date.now();
      o.triggeredPrice = price;
      triggered.push(o);
    }
  }
  if (triggered.length) save(orders);
  return triggered;
}

function markExecuted(id, result) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.status = result.ok ? 'executed' : 'failed';
  o.result = result;
  o.closedAt = Date.now();
  save(orders);
}

module.exports = { placeOrder, getUserOrders, cancelOrder, checkTriggers, markExecuted };
