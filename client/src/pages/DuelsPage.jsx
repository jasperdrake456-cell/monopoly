import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './DuelsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

function ms2clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export default function DuelsPage() {
  const { token, user, isLoggedIn } = useAuth();
  const me = user?.username?.toLowerCase();
  const [data, setData] = useState({ open: [], history: [], minWager: 100, maxWager: 500000, houseCut: 0.02, expiryMinutes: 10 });
  const [form, setForm] = useState({ wager: 5000, side: 'heads' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(null); // most recent settled duel to animate
  const [, force] = useState(0);
  const sockRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/duels`);
      const d = await r.json();
      if (d.ok) setData(d);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const s = io(SERVER_URL + '/chat', { autoConnect: false });
    sockRef.current = s;
    s.connect();
    s.on('duelCreated', refresh);
    s.on('duelCancelled', refresh);
    s.on('duelSettled', ({ duel }) => {
      setFlipping(duel);
      setTimeout(() => setFlipping(null), 4500);
      refresh();
    });
    const tick = setInterval(() => force(x => x + 1), 1000);
    return () => { clearInterval(tick); s.disconnect(); };
  }, [refresh]);

  async function create() {
    if (busy) return;
    if (!isLoggedIn) return setMsg('❌ Log in to create duels');
    if (form.wager < data.minWager) return setMsg(`❌ Min wager is ${fmt(data.minWager)}`);
    if (getBalance() < form.wager) return setMsg('❌ Insufficient balance');
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/duels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ wager: Math.floor(form.wager), side: form.side }),
      });
      const d = await r.json();
      if (d.ok) { setBalanceFromServer(d.balance); setMsg(`⚔️ Duel posted! Waiting for challenger…`); refresh(); }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function cancel(id) {
    if (busy) return;
    if (!window.confirm('Cancel this duel and refund your wager?')) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/duels/cancel/${id}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) { setBalanceFromServer(d.balance); setMsg(`↩️ Refunded ${fmt(d.refund)}`); refresh(); }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function accept(duel) {
    if (busy) return;
    if (!isLoggedIn) return setMsg('❌ Log in to accept');
    if (getBalance() < duel.wager) return setMsg('❌ Insufficient balance');
    const otherSide = duel.side === 'heads' ? 'tails' : 'heads';
    if (!window.confirm(`Accept duel vs ${duel.createdBy} for ${fmt(duel.wager)}? You take ${otherSide}.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/duels/accept/${duel.id}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) { setMsg(`🎲 Flipping…`); setFlipping(d.duel); setTimeout(() => setFlipping(null), 4500); refresh(); }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  return (
    <div className="duels-page">
      <div className="duels-header">
        <Link to="/" className="duels-back">← Home</Link>
        <div className="duels-title">⚔️ Duels</div>
        {isLoggedIn && <div className="duels-bal">Balance: <b>{fmt(getBalance())}</b></div>}
      </div>

      <div className="duels-hero">
        <div className="duels-hero-title">Head-to-head. Winner takes (almost) all.</div>
        <div className="duels-hero-sub">
          Pick a side. Post a wager. First challenger to accept flips the coin. Winner takes the pot — {(data.houseCut * 100).toFixed(0)}% house cut.
        </div>
      </div>

      {isLoggedIn && (
        <div className="duels-create">
          <div className="duels-create-label">⚔️ Post New Duel</div>
          <div className="duels-create-row">
            <label>
              <span>Wager</span>
              <input className="gv-input" type="number" min={data.minWager} max={data.maxWager} step={100}
                value={form.wager} onChange={e => setForm({...form, wager: Number(e.target.value)})} />
            </label>
            <div className="duels-side-picker">
              <span className="duels-side-label">Your side</span>
              <div className="duels-side-buttons">
                <button type="button" className={`duels-side ${form.side === 'heads' ? 'duels-side--active' : ''}`}
                  onClick={() => setForm({...form, side: 'heads'})}>🪙 Heads</button>
                <button type="button" className={`duels-side ${form.side === 'tails' ? 'duels-side--active' : ''}`}
                  onClick={() => setForm({...form, side: 'tails'})}>🎯 Tails</button>
              </div>
            </div>
            <button className="gv-btn gv-btn--gold" disabled={busy} onClick={create}>
              🚀 Post Duel
            </button>
          </div>
          <div className="duels-create-hint">
            Pot: {fmt(form.wager * 2)} · Net win (after {(data.houseCut*100).toFixed(0)}% cut): {fmt(form.wager * 2 * (1 - data.houseCut))}
          </div>
        </div>
      )}

      {msg && <div className="duels-msg">{msg}</div>}

      {flipping && (
        <div className="duels-flip-overlay">
          <div className="duels-flip-box">
            <div className="duels-coin">
              <div className="duels-coin-face duels-coin-face--h">🪙</div>
              <div className="duels-coin-face duels-coin-face--t">🎯</div>
            </div>
            <div className="duels-flip-result">
              Coin: <b>{flipping.coin?.toUpperCase()}</b>
            </div>
            <div className="duels-flip-winner">
              🏆 <b>{flipping.winner}</b> wins {fmt(flipping.winnerPayout)}
            </div>
            <div className="duels-flip-sub">vs {flipping.loser}</div>
          </div>
        </div>
      )}

      <h2 className="duels-section">🔥 Open Duels ({data.open.length})</h2>
      {data.open.length === 0 ? (
        <div className="duels-empty">No open duels right now — be the first to post one!</div>
      ) : (
        <div className="duels-grid">
          {data.open.map(d => {
            const left = d.expiresAt - Date.now();
            const mine = d.createdBy === me;
            return (
              <div key={d.id} className={`duels-card ${mine ? 'duels-card--mine' : ''}`}>
                <div className="duels-card-top">
                  <div className="duels-card-user">{mine ? '👤 You' : '🎭 ' + d.createdBy}</div>
                  <div className="duels-card-time">⏳ {ms2clock(left)}</div>
                </div>
                <div className="duels-card-wager">{fmt(d.wager)}</div>
                <div className="duels-card-side">
                  {d.createdBy} takes <b>{d.side.toUpperCase()}</b>
                </div>
                <div className="duels-card-pot">
                  Pot: {fmt(d.wager * 2)} · Win: {fmt(d.wager * 2 * (1 - data.houseCut))}
                </div>
                {mine ? (
                  <button className="gv-btn gv-btn--ghost" disabled={busy} onClick={() => cancel(d.id)}>
                    ✖ Cancel
                  </button>
                ) : (
                  <button className="gv-btn gv-btn--gold" disabled={busy || !isLoggedIn} onClick={() => accept(d)}>
                    ⚔️ Accept as {d.side === 'heads' ? 'TAILS 🎯' : 'HEADS 🪙'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="duels-section">📜 Recent Settlements</h2>
      {data.history.length === 0 ? (
        <div className="duels-empty">No duels yet.</div>
      ) : (
        <div className="duels-history">
          {data.history.map(d => {
            const youWin  = me && d.winner === me;
            const youLose = me && d.loser === me;
            return (
              <div key={d.id} className={`duels-hist ${youWin ? 'duels-hist--win' : youLose ? 'duels-hist--lose' : ''}`}>
                <div className="duels-hist-coin">{d.coin === 'heads' ? '🪙' : '🎯'}</div>
                <div className="duels-hist-text">
                  <b>{d.winner}</b> beat <span className="duels-loser">{d.loser}</span>
                </div>
                <div className="duels-hist-amt">+{fmt(d.winnerPayout)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
