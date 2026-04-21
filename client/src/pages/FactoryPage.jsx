import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './FactoryPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

const RARITY_COLORS = {
  common:    '#94a3b8',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#fbbf24',
};

export default function FactoryPage() {
  const { token, isLoggedIn } = useAuth();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/factories`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (d.ok) setData(d);
    } catch {}
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    const tick = setInterval(() => force(x => x + 1), 1000);
    return () => { clearInterval(id); clearInterval(tick); };
  }, [refresh]);

  async function buy(f) {
    if (busy) return;
    if (!window.confirm(`Buy ${f.name} for ${fmt(f.baseCost)}?`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/factories/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ factoryId: f.id }),
      });
      const d = await r.json();
      if (d.ok) { setBalanceFromServer(d.balance); setMsg(`✅ Bought ${f.name}!`); refresh(); }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function upgrade(f, owned) {
    if (busy) return;
    if (!window.confirm(`Upgrade ${f.name} to L${owned.level + 1} for ${fmt(owned.upgradeCost)}?`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/factories/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ factoryId: f.id }),
      });
      const d = await r.json();
      if (d.ok) { setBalanceFromServer(d.balance); setMsg(`⬆️ ${f.name} now L${d.newLevel}!`); refresh(); }
      else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function collectAll() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/factories/collect`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        if (d.balance) setBalanceFromServer(d.balance);
        if (d.amount > 0) setMsg(`💰 Collected ${fmt(d.amount)}!`);
        else setMsg('Nothing to collect yet.');
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  if (!data) {
    return <div className="fact-page"><div className="fact-loading">Loading…</div></div>;
  }

  return (
    <div className="fact-page">
      <div className="fact-header">
        <Link to="/" className="fact-back">← Home</Link>
        <div className="fact-title">🏭 Chip Factory</div>
        {isLoggedIn && <div className="fact-bal">Balance: <b>{fmt(getBalance())}</b></div>}
      </div>

      <div className="fact-hero">
        <div className="fact-hero-title">Build. Upgrade. Idle.</div>
        <div className="fact-hero-sub">
          Every factory generates chips passively — even while you're offline (up to {data.maxCollectHours}h).
          Level them up to scale yield by 1.5× per tier.
        </div>
      </div>

      {isLoggedIn && (
        <div className="fact-summary">
          <div className="fact-summary-box">
            <div className="fact-summary-label">Income</div>
            <div className="fact-summary-val">{fmt(data.totalYieldPerHour)}<span>/hr</span></div>
          </div>
          <div className="fact-summary-box fact-summary-box--pending">
            <div className="fact-summary-label">Pending</div>
            <div className="fact-summary-val">{fmt(data.totalPending)}</div>
          </div>
          <div className="fact-summary-box">
            <div className="fact-summary-label">Lifetime</div>
            <div className="fact-summary-val">{fmt(data.totalCollected)}</div>
          </div>
          <button className="gv-btn gv-btn--gold fact-collect"
            disabled={busy || data.totalPending <= 0}
            onClick={collectAll}>
            💰 Collect All {data.totalPending > 0 ? fmt(data.totalPending) : ''}
          </button>
        </div>
      )}

      {msg && <div className="fact-msg">{msg}</div>}

      <div className="fact-grid">
        {data.catalog.map(f => {
          const owned = data.owned[f.id];
          const color = RARITY_COLORS[f.rarity] || '#94a3b8';
          return (
            <div key={f.id} className={`fact-card fact-card--${f.rarity} ${owned ? 'fact-card--owned' : ''}`}>
              <div className="fact-card-top">
                <div className="fact-card-emoji">{f.emoji}</div>
                <div className="fact-card-rarity" style={{ color, borderColor: color }}>{f.rarity}</div>
              </div>
              <div className="fact-card-name" style={{ color }}>{f.name}</div>
              <div className="fact-card-desc">{f.description}</div>
              {owned ? (
                <>
                  <div className="fact-card-stats">
                    <div><span>Level</span><b>{owned.level}/10</b></div>
                    <div><span>Yield</span><b>{fmt(owned.yieldPerHour)}/hr</b></div>
                    <div><span>Pending</span><b>{fmt(owned.pending)}</b></div>
                  </div>
                  {owned.atMax ? (
                    <div className="fact-card-max">🌟 MAX LEVEL</div>
                  ) : (
                    <button className="gv-btn gv-btn--purple"
                      disabled={busy}
                      onClick={() => upgrade(f, owned)}>
                      ⬆️ Upgrade L{owned.level + 1} · {fmt(owned.upgradeCost)}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="fact-card-stats">
                    <div><span>Base yield</span><b>{fmt(f.yieldLvl1)}/hr</b></div>
                    <div><span>Cost</span><b>{fmt(f.baseCost)}</b></div>
                  </div>
                  <button className="gv-btn gv-btn--gold"
                    disabled={busy || !isLoggedIn}
                    onClick={() => buy(f)}>
                    🛒 Buy {fmt(f.baseCost)}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
