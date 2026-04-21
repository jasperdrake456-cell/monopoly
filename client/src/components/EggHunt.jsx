import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';
import './EggHunt.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const RARITY_COLORS = {
  common:    '#94a3b8',
  uncommon:  '#22c55e',
  rare:      '#3b82f6',
  epic:      '#a855f7',
  legendary: '#f59e0b',
  mythic:    '#ec4899',
  jackpot:   '#ffd700',
};

function fmt(n) { return '$' + Math.floor(n || 0).toLocaleString(); }

export default function EggHunt() {
  const { token, isLoggedIn } = useAuth();
  const [status, setStatus] = useState(null);
  const [popup, setPopup] = useState(null); // {reward, at}
  const [cracking, setCracking] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/eggs`, { headers: { Authorization: `Bearer ${token}` }})
      .then(r => r.json())
      .then(d => { if (d.ok) setStatus(d); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  async function crack() {
    if (cracking || !isLoggedIn || !status || status.eggsLeft <= 0) return;
    setCracking(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/eggs/crack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setPopup(d.reward);
        setStatus(s => s ? ({ ...s, eggsLeft: d.eggsLeft, totalToday: (s.totalToday || 0) + 1, history: [{ ...d.reward, at: Date.now() }, ...(s.history || [])].slice(0, 10) }) : s);
        setTimeout(() => setPopup(null), 4500);
      }
    } catch {}
    setCracking(false);
  }

  if (!isLoggedIn || !status) return null;

  return (
    <div className="egg-hunt">
      <div className="egg-hunt-top">
        <span style={{ fontSize: '1.3rem' }}>🥚</span>
        <span className="egg-hunt-label">DAILY EGG HUNT</span>
        <span className="egg-hunt-count">{status.eggsLeft}/{status.dailyMax || 3}</span>
      </div>
      <div className="egg-hunt-sub">
        Crack eggs for prizes up to <b style={{ color: '#FFD700' }}>$500,000</b>. Resets daily.
      </div>
      <button
        className={`gv-btn ${status.eggsLeft > 0 ? 'gv-btn--gold' : 'gv-btn--ghost'} egg-hunt-btn`}
        onClick={crack}
        disabled={cracking || status.eggsLeft === 0}>
        {cracking ? 'Cracking…' : status.eggsLeft === 0 ? '✔ Come back tomorrow' : `🔨 Crack an egg (${status.eggsLeft} left)`}
      </button>

      {popup && (
        <div className="egg-hunt-popup" style={{ borderColor: RARITY_COLORS[popup.rarity] }}>
          <div className="egg-hunt-popup-emoji">{popup.emoji}</div>
          <div className="egg-hunt-popup-rarity" style={{ color: RARITY_COLORS[popup.rarity] }}>
            {popup.rarity.toUpperCase()}
          </div>
          <div className="egg-hunt-popup-label">{popup.label}</div>
          <div className="egg-hunt-popup-amount">+{fmt(popup.amount)}</div>
        </div>
      )}

      {status.history && status.history.length > 0 && (
        <div className="egg-hunt-history">
          {status.history.slice(0, 3).map((h, i) => (
            <span key={i} className="egg-hunt-hist-pill" style={{ color: RARITY_COLORS[h.rarity] }}>
              {h.emoji} +{fmt(h.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
