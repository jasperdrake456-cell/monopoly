'use strict';
// Server-side crypto price cache — fetches from CoinGecko every 60s.
// All trades use these server prices so the client can't inject fake prices.

const COINS = [
  { id: 'bitcoin',      symbol: 'BTC', name: 'Bitcoin',    icon: '₿' },
  { id: 'ethereum',     symbol: 'ETH', name: 'Ethereum',   icon: 'Ξ' },
  { id: 'solana',       symbol: 'SOL', name: 'Solana',     icon: '◎' },
  { id: 'dogecoin',     symbol: 'DOGE',name: 'Dogecoin',   icon: 'Ð' },
  { id: 'binancecoin',  symbol: 'BNB', name: 'BNB',        icon: '🔶' },
  { id: 'ripple',       symbol: 'XRP', name: 'XRP',        icon: '✕' },
  { id: 'cardano',      symbol: 'ADA', name: 'Cardano',    icon: '₳' },
  { id: 'avalanche-2',  symbol: 'AVAX',name: 'Avalanche',  icon: '🔺' },
];

const IDS = COINS.map(c => c.id).join(',');

// Current prices: { coinId: { usd, usd_24h_change } }
let _prices     = {};
let _lastFetch  = 0;
let _fetchError = false;

async function fetchPrices() {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${IDS}&vs_currencies=usd&include_24hr_change=true`;
    const res  = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _prices     = data;
    _lastFetch  = Date.now();
    _fetchError = false;
  } catch (e) {
    console.warn('[cryptoPriceFeed] Fetch error:', e.message);
    _fetchError = true;
  }
}

// Initial fetch + every 60s
fetchPrices();
setInterval(fetchPrices, 60_000);

function getPrices() { return _prices; }
function getPrice(coinId) { return _prices[coinId]?.usd ?? null; }
function hasError() { return _fetchError; }
function getLastFetch() { return _lastFetch; }

// Return full price info for all coins (with metadata)
function getPriceList() {
  return COINS.map(c => ({
    ...c,
    price:  _prices[c.id]?.usd         ?? null,
    change: _prices[c.id]?.usd_24h_change ?? null,
  }));
}

module.exports = { COINS, getPrices, getPrice, getPriceList, hasError, getLastFetch };
