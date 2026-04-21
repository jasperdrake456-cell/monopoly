import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './PetsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

const RARITY_COLORS = {
  common:    '#94a3b8',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#fbbf24',
};

export default function PetsPage() {
  const { token, isLoggedIn } = useAuth();
  const [data, setData] = useState({ catalog: [], mine: null });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedAmt, setFeedAmt] = useState(1000);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/pets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (d.ok) setData({ catalog: d.catalog, mine: d.mine });
    } catch {}
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function adopt(p) {
    if (busy) return;
    if (!window.confirm(`Adopt ${p.name} for ${fmt(p.cost)}? Replaces your current pet if any.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/pets/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ petId: p.id }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg(`✅ Adopted ${p.name}! ${p.emoji}`);
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function feed() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/pets/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: Math.floor(feedAmt) }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg(d.leveledUp ? `🎉 Leveled up to ${d.level}!` : `🍖 +${d.xpGained} XP`);
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function collect() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/pets/collect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg(`💰 Collected ${fmt(d.amount)}!`);
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  const mine = data.mine;
  const hasPet = !!mine?.pet;

  return (
    <div className="pets-page">
      <div className="pets-header">
        <Link to="/" className="pets-back">← Home</Link>
        <div className="pets-title">🐾 Pet Companions</div>
        {isLoggedIn && <div className="pets-bal">Balance: <b>{fmt(getBalance())}</b></div>}
      </div>

      <div className="pets-hero">
        <div className="pets-hero-title">Adopt. Feed. Profit.</div>
        <div className="pets-hero-sub">
          Your pet earns passive chips every hour, levels up from your wagering, and provides a unique perk.
        </div>
      </div>

      {hasPet && (
        <div className="pets-mine">
          <div className="pets-mine-left">
            <div className="pets-mine-emoji">{mine.pet.emoji}</div>
            <div>
              <div className="pets-mine-name" style={{ color: RARITY_COLORS[mine.pet.rarity] }}>{mine.pet.name}</div>
              <div className="pets-mine-rarity">{mine.pet.rarity.toUpperCase()}</div>
              <div className="pets-mine-perk">✨ {mine.pet.perk}</div>
            </div>
          </div>
          <div className="pets-mine-right">
            <div className="pets-mine-level">Level <b>{mine.level}</b> / 50</div>
            <div className="pets-mine-progress">
              <div className="pets-mine-progress-bar"
                style={{ width: `${Math.min(100, ((mine.xp % 400) / 400) * 100)}%` }} />
            </div>
            <div className="pets-mine-xp">
              {(mine.xp % 400).toLocaleString()} / 400 XP to next level
            </div>
            <div className="pets-mine-actions">
              <button className="gv-btn gv-btn--gold" disabled={busy || mine.pendingTip <= 0} onClick={collect}>
                💰 Collect {fmt(mine.pendingTip)}
              </button>
              <div className="pets-mine-feed">
                <input className="gv-input" type="number" min={100} step={500}
                  value={feedAmt} onChange={e => setFeedAmt(Number(e.target.value))}
                  placeholder="Amount" />
                <button className="gv-btn gv-btn--purple" disabled={busy || feedAmt < 100} onClick={feed}>🍖 Feed</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {msg && <div className="pets-msg">{msg}</div>}

      <h2 className="pets-section">{hasPet ? 'Swap Pets' : 'Choose Your Companion'}</h2>

      <div className="pets-grid">
        {data.catalog.map(p => {
          const isMine = mine?.pet?.id === p.id;
          return (
            <div key={p.id} className={`pets-card pets-card--${p.rarity} ${isMine ? 'pets-card--mine' : ''}`}>
              <div className="pets-card-emoji">{p.emoji}</div>
              <div className="pets-card-name" style={{ color: RARITY_COLORS[p.rarity] }}>{p.name}</div>
              <div className="pets-card-rarity" style={{ color: RARITY_COLORS[p.rarity], borderColor: RARITY_COLORS[p.rarity] }}>
                {p.rarity}
              </div>
              <div className="pets-card-perk">✨ {p.perk}</div>
              <div className="pets-card-cost">{fmt(p.cost)}</div>
              {isMine ? (
                <div className="pets-card-mine-badge">✓ Currently Adopted</div>
              ) : (
                <button className="gv-btn gv-btn--gold" disabled={busy || !isLoggedIn} onClick={() => adopt(p)}>
                  {isLoggedIn ? 'Adopt' : 'Log in to adopt'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
