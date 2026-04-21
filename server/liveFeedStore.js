'use strict';
/**
 * Live Events Feed — an in-memory ring buffer of recent exciting events for
 * the homepage ticker. Event types:
 *   big-win            — player won a big amount
 *   crypto-buy         — crypto purchase
 *   crypto-sell        — crypto sale
 *   meme-launch        — new meme coin launched
 *   meme-trade         — meme coin buy/sell
 *   prediction-buy     — shares bought on a prediction market
 *   prediction-resolve — market resolved
 *   bank-deposit       — big vault deposit (> 100k)
 *   wishing-well-win   — wishing well winner
 */

const MAX = 100;
const events = [];

function push(type, data) {
  events.unshift({ type, data, at: Date.now() });
  if (events.length > MAX) events.length = MAX;
}

function recent(limit = 30) {
  return events.slice(0, Math.min(MAX, limit));
}

module.exports = { push, recent };
