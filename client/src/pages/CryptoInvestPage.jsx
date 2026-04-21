import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './CryptoInvestPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmtPrice(n) {
  if (n == null) return '—';
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1)    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return '$' + n.toFixed(6);
}

function fmtUSD(n, sign = false) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const s   = sign ? (n >= 0 ? '+' : '-') : (n < 0 ? '-' : '');
  if (abs >= 1e9) return s + '$' + (abs/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return s + '$' + (abs/1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return s + '$' + (abs/1e3).toFixed(1) + 'k';
  return s + '$' + abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const TRADE_PRESETS = [1000, 5000, 25000, 100000, 500000];

export default function CryptoInvestPage() {
  const { token, isLoggedIn } = useAuth();
  const [prices,    setPrices]    = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [balance,   setBalance]   = useState(null);
  const [selected,  setSelected]  = useState(null); // coinId being traded
  const [amount,    setAmount]    = useState('');
  const [tradeType, setTradeType] = useState('long'); // 'long' | 'short'
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState(null);   // { text, ok }
  const [tab,       setTab]       = useState('trade'); // 'trade' | 'portfolio' | 'history'
  const [priceAge,  setPriceAge]  = useState(0);

  const loadPrices = useCallback(() => {
    fetch(`${SERVER_URL}/api/crypto/prices`)
      .then(r => r.json())
      .then(d => { if (d.ok) { setPrices(d.prices); setPriceAge(0); } })
      .catch(() => {});
  }, []);

  const loadPortfolio = useCallback(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/crypto/portfolio`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setPortfolio(d); })
      .catch(() => {});
  }, [token]);

  const loadBalance = useCallback(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/accounts/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setBalance(d.balance); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    loadPrices();
    loadPortfolio();
    loadBalance();
    const pi = setInterval(loadPrices, 60_000);
    const fi = setInterval(() => setPriceAge(a => a + 1), 1000);
    const pf = setInterval(loadPortfolio, 30_000);
    return () => { clearInterval(pi); clearInterval(fi); clearInterval(pf); };
  }, [loadPrices, loadPortfolio, loadBalance]);

  // Auto-select first coin if none selected
  useEffect(() => {
    if (!selected && prices.length > 0) setSelected(prices[0].id);
  }, [prices, selected]);

  function flash(text, ok) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function executeTrade(action) {
    if (!token || loading) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { flash('Enter a valid amount', false); return; }
    setLoading(true);
    try {
      const endpoint = action === 'sell' ? '/api/crypto/sell'
                     : action === 'close-short' ? '/api/crypto/close-short'
                     : action === 'short' ? '/api/crypto/short'
                     : '/api/crypto/buy';
      const body = { coinId: selected };
      if (action !== 'sell' && action !== 'close-short') body.amountUSD = amt;
      const r   = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.ok) {
        const coin    = prices.find(p => p.id === selected);
        const symName = coin?.symbol || selected;
        if (action === 'buy') flash(`✅ Bought $${amt.toLocaleString()} of ${symName} @ ${fmtPrice(d.entryPrice)}`, true);
        else if (action === 'short') flash(`✅ Shorted $${amt.toLocaleString()} of ${symName} @ ${fmtPrice(d.entryPrice)}`, true);
        else if (action === 'sell')  flash(`✅ Sold ${symName}: P&L ${fmtUSD(d.pnl, true)} (payout ${fmtUSD(d.payout)})`, d.pnl >= 0);
        else flash(`✅ Closed short on ${symName}: P&L ${fmtUSD(d.pnl, true)}`, d.pnl >= 0);
        setAmount('');
        loadPortfolio();
        loadBalance();
        setTab('portfolio');
      } else {
        flash(`❌ ${d.error || 'Trade failed'}`, false);
      }
    } catch { flash('❌ Network error', false); }
    finally { setLoading(false); }
  }

  async function closePosition(coinId, type) {
    if (!token || loading) return;
    setLoading(true);
    try {
      const endpoint = type === 'short' ? '/api/crypto/close-short' : '/api/crypto/sell';
      const r = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coinId }),
      });
      const d = await r.json();
      if (d.ok) {
        flash(`✅ Closed ${coinId}: P&L ${fmtUSD(d.pnl, true)}`, d.pnl >= 0);
        loadPortfolio();
        loadBalance();
      } else {
        flash(`❌ ${d.error}`, false);
      }
    } catch { flash('❌ Network error', false); }
    finally { setLoading(false); }
  }

  const selectedCoin = prices.find(p => p.id === selected);
  const existingPos  = portfolio?.positions?.find(p => p.coinId === selected);
  const totalPnl     = portfolio?.totalPnl ?? 0;

  return (
    <div className="ci-page">
      {/* ── Header ── */}
      <div className="ci-header">
        <Link to="/" className="ci-back">← Home</Link>
        <h1 className="ci-title">📈 Crypto Trading</h1>
        <div className="ci-header-right">
          {balance != null && (
            <div className="ci-balance">
              <span className="ci-balance-label">Balance</span>
              <span className="ci-balance-val">{fmtUSD(balance)}</span>
            </div>
          )}
          {portfolio && (
            <div className={`ci-pnl-badge${totalPnl >= 0 ? ' ci-pnl-badge--pos' : ' ci-pnl-badge--neg'}`}>
              Unrealized P&L: {fmtUSD(totalPnl, true)}
            </div>
          )}
          <div className="ci-price-age">
            Prices {priceAge < 5 ? 'live' : `${priceAge}s old`}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`ci-msg${msg.ok ? ' ci-msg--ok' : ' ci-msg--err'}`}>{msg.text}</div>
      )}

      {/* ── Prices bar ── */}
      <div className="ci-prices-bar">
        {prices.map(c => (
          <button
            key={c.id}
            className={`ci-price-chip${selected === c.id ? ' ci-price-chip--sel' : ''}`}
            onClick={() => { setSelected(c.id); setTab('trade'); }}
          >
            <span className="ci-chip-icon">{c.icon}</span>
            <span className="ci-chip-sym">{c.symbol}</span>
            <span className="ci-chip-price">{fmtPrice(c.price)}</span>
            <span className={`ci-chip-chg${(c.change ?? 0) >= 0 ? ' pos' : ' neg'}`}>
              {(c.change ?? 0) >= 0 ? '▲' : '▼'}{Math.abs(c.change ?? 0).toFixed(1)}%
            </span>
          </button>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="ci-tabs">
        {['trade', 'portfolio', 'history'].map(t => (
          <button key={t} className={`ci-tab${tab === t ? ' ci-tab--active' : ''}`} onClick={() => setTab(t)}>
            {t === 'trade' ? '💹 Trade' : t === 'portfolio' ? `📂 Positions (${portfolio?.positions?.length ?? 0})` : '📋 History'}
          </button>
        ))}
      </div>

      {/* ── Trade Panel ── */}
      {tab === 'trade' && selectedCoin && (
        <div className="ci-trade-panel">
          <div className="ci-trade-coin">
            <span className="ci-coin-icon">{selectedCoin.icon}</span>
            <div>
              <div className="ci-coin-name">{selectedCoin.name} ({selectedCoin.symbol})</div>
              <div className="ci-coin-price">{fmtPrice(selectedCoin.price)}</div>
            </div>
            {existingPos && (
              <div className={`ci-existing-badge ci-existing-badge--${existingPos.type}`}>
                {existingPos.type === 'long' ? '📈 LONG' : '📉 SHORT'} · {fmtUSD(existingPos.amountUSD)} · P&L {fmtUSD(existingPos.pnl, true)}
              </div>
            )}
          </div>

          {/* Long / Short toggle */}
          <div className="ci-type-toggle">
            <button
              className={`ci-type-btn${tradeType === 'long' ? ' ci-type-btn--long' : ''}`}
              onClick={() => setTradeType('long')}
            >📈 Long (Buy)</button>
            <button
              className={`ci-type-btn${tradeType === 'short' ? ' ci-type-btn--short' : ''}`}
              onClick={() => setTradeType('short')}
            >📉 Short (Sell)</button>
          </div>

          {/* Amount input */}
          <div className="ci-amount-row">
            <span className="ci-amount-prefix">$</span>
            <input
              className="ci-amount-input"
              type="number"
              min="10"
              placeholder="Amount in USD"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          {/* Preset buttons */}
          <div className="ci-presets">
            {TRADE_PRESETS.map(v => (
              <button key={v} className="ci-preset-btn" onClick={() => setAmount(String(v))}>
                {v >= 1000 ? '$' + (v/1000) + 'k' : '$' + v}
              </button>
            ))}
            {balance != null && (
              <button className="ci-preset-btn ci-preset-btn--all" onClick={() => setAmount(String(Math.floor(balance)))}>
                All In
              </button>
            )}
          </div>

          {/* P&L preview */}
          {amount && !isNaN(parseFloat(amount)) && selectedCoin.price && (
            <div className="ci-preview">
              <span>Buying {(parseFloat(amount) / selectedCoin.price).toFixed(6)} {selectedCoin.symbol}</span>
              <span style={{ color:'#64748b' }}>· avg {fmtPrice(selectedCoin.price)}</span>
            </div>
          )}

          <button
            className={`ci-open-btn${tradeType === 'short' ? ' ci-open-btn--short' : ''}`}
            onClick={() => executeTrade(tradeType === 'long' ? 'buy' : 'short')}
            disabled={loading || !isLoggedIn || !amount}
          >
            {loading ? '…' : tradeType === 'long'
              ? `Buy ${selectedCoin.symbol}`
              : `Short ${selectedCoin.symbol}`}
          </button>

          {/* Close existing position */}
          {existingPos && (
            <div className="ci-close-row">
              <div style={{ fontSize:'0.82rem', color:'#64748b' }}>
                You have an open {existingPos.type} → Current P&L: <strong style={{ color: existingPos.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtUSD(existingPos.pnl, true)}</strong>
              </div>
              <button
                className={`ci-close-btn${existingPos.pnl >= 0 ? ' ci-close-btn--profit' : ' ci-close-btn--loss'}`}
                onClick={() => closePosition(existingPos.coinId, existingPos.type)}
                disabled={loading}
              >
                {existingPos.type === 'short' ? 'Close Short' : 'Sell All'} → {fmtUSD(existingPos.pnl, true)}
              </button>
            </div>
          )}

          {/* How it works */}
          <div className="ci-explainer">
            <strong>How it works:</strong> Trades use in-game currency. <strong>Long</strong> = profit when price goes up. <strong>Short</strong> = profit when price goes down. Positions use real-time prices. Prices update every 60 seconds.
          </div>
        </div>
      )}

      {/* ── Portfolio Panel ── */}
      {tab === 'portfolio' && (
        <div className="ci-positions-panel">
          {!portfolio || portfolio.positions.length === 0 ? (
            <div className="ci-empty">
              No open positions. Go to Trade to open one!
            </div>
          ) : (
            <>
              <div className="ci-pos-summary">
                <div className="ci-pos-stat">
                  <span>Total Invested</span>
                  <strong>{fmtUSD(portfolio.totalInvested)}</strong>
                </div>
                <div className="ci-pos-stat">
                  <span>Unrealized P&L</span>
                  <strong style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtUSD(totalPnl, true)}</strong>
                </div>
              </div>
              {portfolio.positions.map(pos => (
                <div key={pos.coinId} className={`ci-pos-card ci-pos-card--${pos.type}`}>
                  <div className="ci-pos-top">
                    <span className="ci-pos-icon">{pos.icon}</span>
                    <div className="ci-pos-info">
                      <div className="ci-pos-title">
                        <span>{pos.symbol}</span>
                        <span className={`ci-pos-type-badge ci-pos-type-badge--${pos.type}`}>
                          {pos.type === 'long' ? '📈 LONG' : '📉 SHORT'}
                        </span>
                      </div>
                      <div className="ci-pos-sub">
                        Opened {timeAgo(pos.openedAt)} · {fmtUSD(pos.amountUSD)} invested
                      </div>
                    </div>
                    <div className={`ci-pos-pnl${pos.pnl >= 0 ? ' pos' : ' neg'}`}>
                      {fmtUSD(pos.pnl, true)}
                      <div className="ci-pos-pnl-pct">{pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="ci-pos-prices">
                    <span>Entry: <strong>{fmtPrice(pos.entryPrice)}</strong></span>
                    <span>Now: <strong>{fmtPrice(pos.currentPrice)}</strong></span>
                    <span>Qty: <strong>{pos.quantity.toFixed(6)} {pos.symbol}</strong></span>
                  </div>
                  <button
                    className="ci-pos-close-btn"
                    onClick={() => closePosition(pos.coinId, pos.type)}
                    disabled={loading}
                  >
                    {pos.type === 'short' ? 'Close Short' : 'Sell'} · Receive {fmtUSD(pos.amountUSD + pos.pnl)}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── History Panel ── */}
      {tab === 'history' && (
        <div className="ci-history-panel">
          {!portfolio || portfolio.history.length === 0 ? (
            <div className="ci-empty">No trade history yet.</div>
          ) : (
            <div className="ci-history-list">
              {portfolio.history.map((h, i) => {
                const coin = prices.find(p => p.id === h.coinId);
                return (
                  <div key={i} className="ci-hist-row">
                    <span className="ci-hist-icon">{coin?.icon || '💰'}</span>
                    <div className="ci-hist-info">
                      <div className="ci-hist-title">
                        {h.type === 'sell' ? 'Sold' : 'Closed Short'} {coin?.symbol || h.coinId}
                      </div>
                      <div className="ci-hist-sub">
                        Entry {fmtPrice(h.entryPrice)} → Exit {fmtPrice(h.exitPrice)} · {fmtUSD(h.amountUSD)} invested · {timeAgo(h.at)}
                      </div>
                    </div>
                    <div className={`ci-hist-pnl${h.pnl >= 0 ? ' pos' : ' neg'}`}>
                      {fmtUSD(h.pnl, true)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
