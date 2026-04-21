import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './MemeCoinsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();
const fmtP = (p) => {
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
};

function MiniChart({ history }) {
  if (!history || history.length < 2) return null;
  const vals = history.map(h => h.p);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 100, H = 28;
  const pts = history.map((h, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - ((h.p - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  const up = vals[vals.length-1] >= vals[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width:'100%', height: 28 }}>
      <polyline fill="none" stroke={up ? '#22c55e' : '#ef4444'} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

export default function MemeCoinsPage() {
  const { token, isLoggedIn } = useAuth();
  const [coins, setCoins] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [creationFee, setCreationFee] = useState(10000);
  const [balance, setBalance] = useState(getBalance());
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newEmoji, setNewEmoji] = useState('🪙');

  const [buyAmt, setBuyAmt] = useState({});

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/meme-coins`);
      const d = await r.json();
      if (d.ok) { setCoins(d.coins); setCreationFee(d.creationFee); }
    } catch {}
    if (token) {
      try {
        const r = await fetch(`${SERVER_URL}/api/meme-coins/holdings`, { headers: { Authorization: `Bearer ${token}` }});
        const d = await r.json();
        if (d.ok) setHoldings(d.holdings);
      } catch {}
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { refresh(); setBalance(getBalance()); }, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  async function createCoin() {
    if (!newName.trim() || !newSymbol.trim()) return;
    setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/meme-coins/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName, symbol: newSymbol, emoji: newEmoji }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        setNewName(''); setNewSymbol(''); setNewEmoji('🪙');
        setShowCreate(false);
        refresh();
        setMsg(`✅ Launched $${d.coin.symbol}!`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
  }

  async function buy(symbol) {
    const amt = Math.floor(buyAmt[symbol] || 500);
    setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/meme-coins/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, amountUSD: amt }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        refresh();
        setMsg(`✅ Bought ${d.tokensReceived.toFixed(2)} $${symbol}`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
  }

  async function sell(symbol, tokens) {
    setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/meme-coins/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, tokens }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        refresh();
        setMsg(`✅ Sold for ${fmt(d.payout)}`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
  }

  return (
    <div className="meme-page">
      <div className="meme-header">
        <Link to="/" className="meme-back">← Home</Link>
        <div className="meme-title">🪙 Meme Coin Factory</div>
        {isLoggedIn && <div className="meme-bal">Balance: <b>{fmt(balance)}</b></div>}
      </div>

      <div className="meme-hero">
        <div className="meme-hero-title">Launch your own coin. To the moon. 🚀</div>
        <div className="meme-hero-sub">
          Pay {fmt(creationFee)} to launch. Price moves with buy/sell volume. Creators earn 2% of every trade.
        </div>
        {isLoggedIn && (
          <button className="gv-btn gv-btn--gold" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? '✖ Cancel' : '🚀 Launch Coin'}
          </button>
        )}
      </div>

      {showCreate && (
        <div className="meme-create">
          <input className="gv-input" placeholder="Coin name (e.g. DogeGod)" maxLength={30}
            value={newName} onChange={e => setNewName(e.target.value)} />
          <input className="gv-input" placeholder="Symbol (e.g. DGOD)" maxLength={10}
            value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <input className="gv-input" placeholder="Emoji" maxLength={4}
            value={newEmoji} onChange={e => setNewEmoji(e.target.value)} />
          <button className="gv-btn gv-btn--gold" onClick={createCoin}>🚀 Launch for {fmt(creationFee)}</button>
        </div>
      )}

      {msg && <div className="meme-msg">{msg}</div>}

      {holdings.length > 0 && (
        <>
          <h2 className="meme-section-title">💼 Your Holdings</h2>
          <div className="meme-holdings">
            {holdings.map(h => (
              <div key={h.symbol} className="meme-holding">
                <div className="meme-holding-top">
                  <span style={{ fontSize:'1.6rem' }}>{h.emoji}</span>
                  <div>
                    <div className="meme-holding-sym">${h.symbol}</div>
                    <div className="meme-holding-tokens">{h.tokens.toFixed(2)} tokens</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div className="meme-holding-val">{fmt(h.value)}</div>
                    <div className={h.pnl >= 0 ? 'meme-pnl-pos' : 'meme-pnl-neg'}>
                      {h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)}
                    </div>
                  </div>
                </div>
                <button className="gv-btn gv-btn--red" onClick={() => sell(h.symbol, h.tokens)}>
                  💸 Sell all
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="meme-section-title">🔥 Top Coins</h2>
      {coins.length === 0 ? (
        <div className="meme-empty">No coins launched yet. Be the first! 🚀</div>
      ) : (
        <div className="meme-list">
          {coins.map(c => {
            const firstPrice = c.priceHistory[0]?.p || c.price;
            const change = ((c.price - firstPrice) / firstPrice) * 100;
            return (
              <div key={c.symbol} className="meme-coin">
                <div className="meme-coin-emoji">{c.emoji}</div>
                <div className="meme-coin-info">
                  <div className="meme-coin-sym">${c.symbol}</div>
                  <div className="meme-coin-name">{c.name}</div>
                  <div className="meme-coin-creator">by {c.creator}</div>
                </div>
                <div className="meme-coin-chart">
                  <MiniChart history={c.priceHistory} />
                </div>
                <div className="meme-coin-price">
                  <div className="meme-coin-p">{fmtP(c.price)}</div>
                  <div className={change >= 0 ? 'meme-pnl-pos' : 'meme-pnl-neg'}>
                    {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                  </div>
                  <div className="meme-coin-mcap">MC: {fmt(c.marketCap)}</div>
                </div>
                {isLoggedIn && (
                  <div className="meme-coin-buy">
                    <input className="gv-input" type="number" min={100} step={100}
                      value={buyAmt[c.symbol] || 500}
                      onChange={e => setBuyAmt({ ...buyAmt, [c.symbol]: e.target.value })}
                      style={{ width: 90 }} />
                    <button className="gv-btn gv-btn--green" onClick={() => buy(c.symbol)}>Buy</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
