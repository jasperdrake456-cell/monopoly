'use strict';
// Fake crypto portfolio — tracks long and short positions per user.
// Positions are persisted to data/cryptoPortfolios.json.
// P&L is calculated server-side using current cached prices.

const fs   = require('fs');
const path = require('path');
const feed = require('./cryptoPriceFeed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'cryptoPortfolios.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function write(d) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, FILE);
  } catch { /* non-fatal */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getUser(data, username) {
  const key = username.toLowerCase();
  if (!data[key]) data[key] = { positions: {}, history: [] };
  return data[key];
}

/** Get all positions with live P&L for a user */
function getPortfolio(username) {
  const data   = read();
  const user   = getUser(data, username);
  const prices = feed.getPrices();

  const positions = Object.entries(user.positions).map(([coinId, pos]) => {
    const currentPrice = prices[coinId]?.usd ?? pos.entryPrice;
    let pnl, pnlPct;
    if (pos.type === 'long') {
      pnl    = (currentPrice - pos.entryPrice) / pos.entryPrice * pos.amountUSD;
      pnlPct = (currentPrice - pos.entryPrice) / pos.entryPrice * 100;
    } else {
      // short: profit when price drops
      pnl    = (pos.entryPrice - currentPrice) / pos.entryPrice * pos.amountUSD;
      pnlPct = (pos.entryPrice - currentPrice) / pos.entryPrice * 100;
    }
    const coin = feed.COINS.find(c => c.id === coinId) || { id: coinId, symbol: coinId.toUpperCase(), name: coinId };
    return {
      coinId,
      symbol:       coin.symbol,
      name:         coin.name,
      icon:         coin.icon,
      type:         pos.type,
      amountUSD:    pos.amountUSD,
      quantity:     pos.quantity,
      entryPrice:   pos.entryPrice,
      currentPrice,
      pnl:          Math.round(pnl * 100) / 100,
      pnlPct:       Math.round(pnlPct * 100) / 100,
      openedAt:     pos.openedAt,
    };
  });

  const totalPnl   = positions.reduce((s, p) => s + p.pnl, 0);
  const totalInvested = positions.reduce((s, p) => s + p.amountUSD, 0);

  return {
    positions,
    totalPnl:      Math.round(totalPnl * 100) / 100,
    totalInvested: Math.round(totalInvested),
    history:       (user.history || []).slice(0, 50),
  };
}

/** Open a LONG position (buy) */
function buy(username, coinId, amountUSD) {
  const price = feed.getPrice(coinId);
  if (!price) return { ok: false, error: 'Price unavailable — try again in a moment' };
  if (amountUSD < 10) return { ok: false, error: 'Minimum trade is $10' };
  if (amountUSD > 50_000_000) return { ok: false, error: 'Maximum single trade is $50M' };

  const data = read();
  const user = getUser(data, username);

  // Allow adding to an existing long position (average down/up)
  const existing = user.positions[coinId];
  if (existing && existing.type === 'short') {
    return { ok: false, error: `Close your short position in ${coinId} first` };
  }

  if (existing && existing.type === 'long') {
    // Average the position
    const totalUSD    = existing.amountUSD + amountUSD;
    const avgPrice    = (existing.amountUSD * existing.entryPrice + amountUSD * price) / totalUSD;
    existing.amountUSD  = totalUSD;
    existing.quantity   = totalUSD / avgPrice;
    existing.entryPrice = Math.round(avgPrice * 100) / 100;
  } else {
    user.positions[coinId] = {
      type: 'long',
      amountUSD,
      quantity:   amountUSD / price,
      entryPrice: price,
      openedAt:   Date.now(),
    };
  }
  write(data);
  return { ok: true, entryPrice: price, amountUSD };
}

/** Close a LONG position (sell all or partial) */
function sell(username, coinId) {
  const price = feed.getPrice(coinId);
  if (!price) return { ok: false, error: 'Price unavailable' };

  const data = read();
  const user = getUser(data, username);
  const pos  = user.positions[coinId];
  if (!pos)              return { ok: false, error: 'No position in ' + coinId };
  if (pos.type !== 'long') return { ok: false, error: 'You have a short position — use Close Short' };

  const pnl     = (price - pos.entryPrice) / pos.entryPrice * pos.amountUSD;
  const payout  = Math.round((pos.amountUSD + pnl) * 100) / 100;

  // Add to history
  user.history = [{ coinId, type: 'sell', amountUSD: pos.amountUSD, entryPrice: pos.entryPrice, exitPrice: price, pnl: Math.round(pnl * 100) / 100, at: Date.now() }, ...(user.history || [])].slice(0, 50);
  delete user.positions[coinId];
  write(data);
  return { ok: true, pnl: Math.round(pnl * 100) / 100, payout, exitPrice: price };
}

/** Open a SHORT position */
function short(username, coinId, amountUSD) {
  const price = feed.getPrice(coinId);
  if (!price) return { ok: false, error: 'Price unavailable — try again in a moment' };
  if (amountUSD < 10) return { ok: false, error: 'Minimum trade is $10' };
  if (amountUSD > 50_000_000) return { ok: false, error: 'Maximum single trade is $50M' };

  const data = read();
  const user = getUser(data, username);

  const existing = user.positions[coinId];
  if (existing && existing.type === 'long') return { ok: false, error: `Sell your long position first` };
  if (existing && existing.type === 'short') {
    // Add to existing short
    const totalUSD    = existing.amountUSD + amountUSD;
    const avgPrice    = (existing.amountUSD * existing.entryPrice + amountUSD * price) / totalUSD;
    existing.amountUSD  = totalUSD;
    existing.quantity   = totalUSD / avgPrice;
    existing.entryPrice = Math.round(avgPrice * 100) / 100;
  } else {
    user.positions[coinId] = {
      type: 'short',
      amountUSD,
      quantity:   amountUSD / price,
      entryPrice: price,
      openedAt:   Date.now(),
    };
  }
  write(data);
  return { ok: true, entryPrice: price, amountUSD };
}

/** Close a SHORT position */
function closeShort(username, coinId) {
  const price = feed.getPrice(coinId);
  if (!price) return { ok: false, error: 'Price unavailable' };

  const data = read();
  const user = getUser(data, username);
  const pos  = user.positions[coinId];
  if (!pos)               return { ok: false, error: 'No position in ' + coinId };
  if (pos.type !== 'short') return { ok: false, error: 'You have a long — use Sell' };

  const pnl    = (pos.entryPrice - price) / pos.entryPrice * pos.amountUSD;
  const payout = Math.round((pos.amountUSD + pnl) * 100) / 100;

  user.history = [{ coinId, type: 'close-short', amountUSD: pos.amountUSD, entryPrice: pos.entryPrice, exitPrice: price, pnl: Math.round(pnl * 100) / 100, at: Date.now() }, ...(user.history || [])].slice(0, 50);
  delete user.positions[coinId];
  write(data);
  return { ok: true, pnl: Math.round(pnl * 100) / 100, payout, exitPrice: price };
}

module.exports = { getPortfolio, buy, sell, short, closeShort };
