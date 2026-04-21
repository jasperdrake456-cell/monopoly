'use strict';
/**
 * Meme Coin Creator — pay a launch fee to mint your own coin. Each coin has
 * a supply and a bonding-curve price that increases as users buy it. Holders
 * profit when others buy; the creator gets a small cut of every trade.
 *
 * Pricing model: simple constant-product-ish bonding curve. Each buy/sell
 * adjusts price proportionally to (volume / liquidity).
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE     = path.join(DATA_DIR, 'memeCoins.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{"coins":[],"holdings":{}}', 'utf8');

const CREATION_FEE = 10_000;
const INIT_PRICE   = 0.01;   // $0.01 starting price
const INIT_LIQ     = 5000;   // virtual liquidity (controls price volatility)
const CREATOR_FEE  = 0.02;   // 2% of every trade to creator

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { coins: [], holdings: {} }; }
}
function save(d) {
  try { fs.writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); } catch {}
}

let state = load();
if (!state.coins) state.coins = [];
if (!state.holdings) state.holdings = {};

function listCoins() {
  return state.coins.slice().sort((a, b) => b.marketCap - a.marketCap);
}

function getCoin(symbol) {
  return state.coins.find(c => c.symbol === symbol);
}

function createCoin(creator, { name, symbol, emoji = '🪙' }) {
  const safeName   = String(name || '').slice(0, 30).trim();
  const safeSymbol = String(symbol || '').slice(0, 10).trim().toUpperCase();
  if (!safeName || !safeSymbol) return { ok: false, error: 'Name and symbol required' };
  if (!/^[A-Z0-9]{2,10}$/.test(safeSymbol)) return { ok: false, error: 'Symbol must be 2-10 letters/digits' };
  if (state.coins.some(c => c.symbol === safeSymbol)) return { ok: false, error: 'Symbol already taken' };
  if (state.coins.length >= 500) return { ok: false, error: 'Coin limit reached' };

  const coin = {
    name: safeName,
    symbol: safeSymbol,
    emoji: String(emoji || '🪙').slice(0, 4),
    creator: (creator || '').toLowerCase(),
    createdAt: Date.now(),
    price: INIT_PRICE,
    liquidity: INIT_LIQ,
    totalVolume: 0,
    holders: 0,
    marketCap: INIT_PRICE * 1_000_000, // implied 1M supply
    priceHistory: [{ t: Date.now(), p: INIT_PRICE }],
  };
  state.coins.push(coin);
  save(state);
  return { ok: true, coin };
}

function buyCoin(username, symbol, amountUSD) {
  const coin = getCoin(symbol);
  if (!coin) return { ok: false, error: 'Coin not found' };
  const amt = Math.floor(amountUSD);
  if (amt < 100) return { ok: false, error: 'Min buy: 100' };

  // Price impact: price rises proportionally to buy-size/liquidity
  const impact = amt / coin.liquidity;
  const avgPrice = coin.price * (1 + impact / 2);
  const creatorCut = Math.floor(amt * CREATOR_FEE);
  const netBuy = amt - creatorCut;
  const tokensReceived = netBuy / avgPrice;

  coin.price *= (1 + impact);
  coin.liquidity += netBuy;
  coin.totalVolume += amt;
  coin.marketCap = coin.price * 1_000_000;
  coin.priceHistory.push({ t: Date.now(), p: coin.price });
  if (coin.priceHistory.length > 200) coin.priceHistory.shift();

  // Update holdings
  const key = (username || '').toLowerCase();
  if (!state.holdings[key]) state.holdings[key] = {};
  if (!state.holdings[key][symbol]) {
    state.holdings[key][symbol] = { tokens: 0, avgCost: 0 };
    coin.holders += 1;
  }
  const h = state.holdings[key][symbol];
  h.avgCost = ((h.avgCost * h.tokens) + (avgPrice * tokensReceived)) / (h.tokens + tokensReceived);
  h.tokens += tokensReceived;

  save(state);
  return { ok: true, coin, tokensReceived, creatorCut, avgPrice };
}

function sellCoin(username, symbol, tokenAmount) {
  const coin = getCoin(symbol);
  if (!coin) return { ok: false, error: 'Coin not found' };
  const key = (username || '').toLowerCase();
  const h = state.holdings[key] && state.holdings[key][symbol];
  if (!h || h.tokens <= 0) return { ok: false, error: 'No holdings' };

  const sell = Math.min(h.tokens, Number(tokenAmount) || h.tokens);
  // Price impact on sell
  const avgPrice = coin.price;
  const grossUSD = sell * avgPrice;
  const impact = grossUSD / coin.liquidity;
  const slippedPrice = coin.price * (1 - impact / 2);
  const netGross = sell * slippedPrice;
  const creatorCut = Math.floor(netGross * CREATOR_FEE);
  const payout = Math.floor(netGross - creatorCut);

  coin.price *= (1 - impact);
  if (coin.price < 0.0001) coin.price = 0.0001;
  coin.liquidity = Math.max(INIT_LIQ, coin.liquidity - netGross);
  coin.totalVolume += netGross;
  coin.marketCap = coin.price * 1_000_000;
  coin.priceHistory.push({ t: Date.now(), p: coin.price });
  if (coin.priceHistory.length > 200) coin.priceHistory.shift();

  h.tokens -= sell;
  if (h.tokens < 0.000001) {
    delete state.holdings[key][symbol];
    coin.holders = Math.max(0, coin.holders - 1);
  }
  save(state);
  return { ok: true, coin, payout, creatorCut, soldTokens: sell };
}

function getHoldings(username) {
  const key = (username || '').toLowerCase();
  const hs = state.holdings[key] || {};
  const result = [];
  for (const symbol of Object.keys(hs)) {
    const coin = getCoin(symbol);
    if (!coin) continue;
    const h = hs[symbol];
    const value = h.tokens * coin.price;
    result.push({
      symbol, name: coin.name, emoji: coin.emoji,
      tokens: h.tokens, avgCost: h.avgCost,
      currentPrice: coin.price, value,
      pnl: value - (h.avgCost * h.tokens),
    });
  }
  return result;
}

module.exports = {
  listCoins, getCoin, createCoin, buyCoin, sellCoin, getHoldings,
  CREATION_FEE,
};
