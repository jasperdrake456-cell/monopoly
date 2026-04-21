import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './PredictionMarketsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

export default function PredictionMarketsPage() {
  const { token, user, isLoggedIn } = useAuth();
  const isAdmin = user?.username === 'jasper';
  const [markets, setMarkets] = useState([]);
  const [sharePrice, setSharePrice] = useState(500);
  const [payout, setPayout] = useState(1000);
  const [balance, setBalance] = useState(getBalance());
  const [msg, setMsg] = useState('');

  // Admin form
  const [newQuestion, setNewQuestion] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDays, setNewDays] = useState(7);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/prediction-markets`);
      const d = await r.json();
      if (d.ok) { setMarkets(d.markets); setSharePrice(d.sharePrice); setPayout(d.payout); }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { refresh(); setBalance(getBalance()); }, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  async function buy(marketId, side, shares = 1) {
    if (!isLoggedIn) return;
    setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/prediction-markets/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marketId, side, shares }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        refresh();
        setMsg(`✅ Bought ${shares} ${side.toUpperCase()} share(s)`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
  }

  async function createMarket() {
    if (!newQuestion.trim()) return;
    try {
      const endsAt = Date.now() + newDays * 86_400_000;
      const r = await fetch(`${SERVER_URL}/api/admin/prediction-markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: newQuestion, description: newDesc, endsAt }),
      });
      const d = await r.json();
      if (d.ok) {
        setNewQuestion(''); setNewDesc(''); setNewDays(7);
        refresh();
      }
    } catch {}
  }

  async function resolve(id, outcome) {
    if (!window.confirm(`Resolve this market as ${outcome.toUpperCase()}?`)) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/prediction-markets/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ outcome }),
      });
      await r.json();
      refresh();
    } catch {}
  }

  function statusInfo(m) {
    if (m.status === 'resolved-yes') return { label: '✅ Resolved YES', color: '#22c55e' };
    if (m.status === 'resolved-no')  return { label: '❌ Resolved NO',  color: '#ef4444' };
    if (m.status === 'cancelled')    return { label: '🚫 Cancelled — refunded', color: '#aaa' };
    if (Date.now() >= m.endsAt)      return { label: '⏱ Awaiting resolution', color: '#fbbf24' };
    return { label: '🟢 Open', color: '#22c55e' };
  }

  return (
    <div className="pred-page">
      <div className="pred-header">
        <Link to="/" className="pred-back">← Home</Link>
        <div className="pred-title">🔮 Prediction Markets</div>
        {isLoggedIn && <div className="pred-bal">Balance: <b>{fmt(balance)}</b></div>}
      </div>

      <div className="pred-hero">
        <div className="pred-hero-title">Bet on the future.</div>
        <div className="pred-hero-sub">
          Buy {fmt(sharePrice)} shares — winners get {fmt(payout)} ({((payout/sharePrice)).toFixed(1)}× return).
        </div>
      </div>

      {isAdmin && (
        <div className="pred-admin">
          <div className="pred-admin-label">⚙️ Admin — create market</div>
          <input className="gv-input" placeholder="Question (e.g. Will BTC close above $100k by Friday?)"
            value={newQuestion} onChange={e => setNewQuestion(e.target.value)} />
          <input className="gv-input" placeholder="Optional description/resolution criteria"
            value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ color:'var(--gv-text-dim)', fontSize:'0.85rem' }}>Ends in</span>
            <input className="gv-input" type="number" min={1} max={365}
              value={newDays} onChange={e => setNewDays(Math.max(1, Number(e.target.value)||1))}
              style={{ width:80 }} />
            <span style={{ color:'var(--gv-text-dim)', fontSize:'0.85rem' }}>days</span>
            <button className="gv-btn gv-btn--gold" onClick={createMarket}>Create</button>
          </div>
        </div>
      )}

      {msg && <div className="pred-msg">{msg}</div>}

      {markets.length === 0 ? (
        <div className="pred-empty">No markets yet. Check back soon.</div>
      ) : (
        <div className="pred-list">
          {markets.map(m => {
            const total = m.yesShares + m.noShares;
            const yesPct = total > 0 ? (m.yesShares / total) * 100 : 50;
            const noPct  = 100 - yesPct;
            const open = m.status === 'open' && Date.now() < m.endsAt;
            const s = statusInfo(m);
            return (
              <div key={m.id} className="pred-card">
                <div className="pred-card-question">{m.question}</div>
                {m.description && <div className="pred-card-desc">{m.description}</div>}
                <div className="pred-card-status" style={{ color: s.color }}>{s.label}</div>

                <div className="pred-card-bar">
                  <div className="pred-card-bar-yes" style={{ width: `${yesPct}%` }}>
                    YES {yesPct.toFixed(0)}%
                  </div>
                  <div className="pred-card-bar-no" style={{ width: `${noPct}%` }}>
                    NO {noPct.toFixed(0)}%
                  </div>
                </div>
                <div className="pred-card-volume">
                  {m.yesShares + m.noShares} total shares · {fmt((m.yesShares + m.noShares) * sharePrice)} volume
                </div>

                {open && isLoggedIn && (
                  <div className="pred-card-buys">
                    <button className="gv-btn gv-btn--green" onClick={() => buy(m.id, 'yes', 1)}>
                      BUY YES · {fmt(sharePrice)}
                    </button>
                    <button className="gv-btn gv-btn--red" onClick={() => buy(m.id, 'no', 1)}>
                      BUY NO · {fmt(sharePrice)}
                    </button>
                    <button className="gv-btn gv-btn--ghost" onClick={() => buy(m.id, 'yes', 10)}>YES ×10</button>
                    <button className="gv-btn gv-btn--ghost" onClick={() => buy(m.id, 'no', 10)}>NO ×10</button>
                  </div>
                )}

                {isAdmin && (m.status === 'open' || m.status === 'closed') && (
                  <div className="pred-card-admin-row">
                    <button className="gv-btn gv-btn--green" onClick={() => resolve(m.id, 'yes')}>Resolve YES</button>
                    <button className="gv-btn gv-btn--red"   onClick={() => resolve(m.id, 'no')}>Resolve NO</button>
                    <button className="gv-btn gv-btn--ghost" onClick={() => resolve(m.id, 'cancel')}>Cancel (refund)</button>
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
