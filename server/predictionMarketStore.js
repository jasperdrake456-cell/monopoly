'use strict';
/**
 * Prediction Markets — admin creates YES/NO markets. Users buy $0.50 shares
 * on either side. When admin resolves the market, winning shares pay out $1.
 * The losing side's stakes fund the winners (plus a tiny house edge).
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'predictionMarkets.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]', 'utf8');

const SHARE_PRICE = 500;   // cost to buy 1 share = $500 chips
const PAYOUT      = 1000;  // winning share pays $1000 = 2x

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(d) {
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {}
}

let markets = load();

function listMarkets() { return markets; }

function getMarket(id) { return markets.find(m => m.id === id) || null; }

function createMarket({ question, description = '', endsAt }) {
  if (!question) return { ok: false, error: 'Question required' };
  const m = {
    id: `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    question: String(question).slice(0, 200),
    description: String(description).slice(0, 500),
    createdAt: Date.now(),
    endsAt: Number(endsAt) || (Date.now() + 24 * 60 * 60 * 1000),
    status: 'open', // 'open' | 'closed' | 'resolved-yes' | 'resolved-no' | 'cancelled'
    yesShares: 0,
    noShares: 0,
    bets: [], // { id, username, side, shares, at }
  };
  markets.unshift(m);
  save(markets);
  return { ok: true, market: m };
}

function buyShares(username, marketId, side, shareCount) {
  const m = getMarket(marketId);
  if (!m) return { ok: false, error: 'Market not found' };
  if (m.status !== 'open') return { ok: false, error: 'Market closed' };
  if (Date.now() >= m.endsAt) return { ok: false, error: 'Market expired' };
  if (!['yes', 'no'].includes(side)) return { ok: false, error: 'Invalid side' };
  const n = Math.floor(shareCount);
  if (n < 1 || n > 10000) return { ok: false, error: 'Invalid share count' };

  const cost = n * SHARE_PRICE;
  m.bets.push({
    id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: (username || '').toLowerCase(),
    side,
    shares: n,
    at: Date.now(),
  });
  if (side === 'yes') m.yesShares += n;
  else m.noShares += n;
  save(markets);
  return { ok: true, cost, market: m };
}

/** Admin: resolve a market. outcome = 'yes' | 'no' | 'cancel' */
function resolveMarket(marketId, outcome) {
  const m = getMarket(marketId);
  if (!m) return { ok: false, error: 'Market not found' };
  if (m.status !== 'open' && m.status !== 'closed') return { ok: false, error: 'Already resolved' };

  const payouts = []; // [{ username, amount }]

  if (outcome === 'cancel') {
    // Refund all bets
    for (const b of m.bets) {
      payouts.push({ username: b.username, amount: b.shares * SHARE_PRICE });
    }
    m.status = 'cancelled';
  } else if (outcome === 'yes' || outcome === 'no') {
    // Winners get $1000 per share
    for (const b of m.bets) {
      if (b.side === outcome) {
        payouts.push({ username: b.username, amount: b.shares * PAYOUT });
      }
    }
    m.status = outcome === 'yes' ? 'resolved-yes' : 'resolved-no';
  } else {
    return { ok: false, error: 'Invalid outcome' };
  }

  m.resolvedAt = Date.now();
  m.outcome = outcome;
  save(markets);
  return { ok: true, market: m, payouts };
}

function getMyBets(username) {
  const clean = (username || '').toLowerCase();
  const result = [];
  for (const m of markets) {
    const mine = m.bets.filter(b => b.username === clean);
    if (mine.length) {
      const shares = mine.reduce((s, b) => s + (b.side === 'yes' ? b.shares : -b.shares), 0);
      result.push({
        marketId: m.id,
        question: m.question,
        status: m.status,
        endsAt: m.endsAt,
        yesShares: mine.filter(b => b.side === 'yes').reduce((s, b) => s + b.shares, 0),
        noShares:  mine.filter(b => b.side === 'no').reduce((s, b) => s + b.shares, 0),
        netShares: shares,
      });
    }
  }
  return result;
}

module.exports = {
  listMarkets, getMarket, createMarket, buyShares, resolveMarket, getMyBets,
  SHARE_PRICE, PAYOUT,
};
