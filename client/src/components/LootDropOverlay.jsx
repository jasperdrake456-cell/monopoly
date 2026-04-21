import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';
import './LootDropOverlay.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TIER_STYLE = {
  common:    { color: '#94a3b8', glow: 'rgba(148,163,184,0.5)' },
  rare:      { color: '#60a5fa', glow: 'rgba(96,165,250,0.55)' },
  epic:      { color: '#c084fc', glow: 'rgba(192,132,252,0.55)' },
  legendary: { color: '#fbbf24', glow: 'rgba(251,191,36,0.6)' },
};

export default function LootDropOverlay() {
  const { token, isLoggedIn } = useAuth();
  const [drop, setDrop] = useState(null);
  const [banner, setBanner] = useState(null);
  const [grabbing, setGrabbing] = useState(false);
  const [tickMs, setTickMs] = useState(0);
  const pos = useRef({ left: '50%', top: '35%' });
  const sockRef = useRef(null);

  // Roll a random screen position on spawn
  const pickPosition = () => {
    pos.current = {
      left: `${15 + Math.random() * 70}%`,
      top:  `${15 + Math.random() * 60}%`,
    };
  };

  // Initial fetch in case a drop is already active when we mount
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/loot`);
      const d = await r.json();
      if (d.ok && d.current) {
        pickPosition();
        setDrop(d.current);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const s = io(SERVER_URL + '/chat', { autoConnect: false });
    sockRef.current = s;
    s.connect();
    s.on('lootDropSpawned', ({ drop: d }) => { pickPosition(); setDrop(d); });
    s.on('lootDropClaimed', ({ drop: d }) => {
      setDrop(null);
      setBanner({ tier: d.tier, winner: d.winner, amount: d.amount, emoji: d.emoji });
      setTimeout(() => setBanner(null), 4200);
    });
    s.on('lootDropExpired', () => setDrop(null));
    const tick = setInterval(() => setTickMs(Date.now()), 250);
    return () => { clearInterval(tick); s.disconnect(); };
  }, [refresh]);

  async function grab() {
    if (!drop || grabbing || !isLoggedIn) return;
    setGrabbing(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/loot/grab/${drop.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        if (d.balance) setBalanceFromServer(d.balance);
        setBanner({
          tier: d.drop.tier, winner: 'You!', amount: d.drop.amount,
          emoji: d.drop.emoji, self: true,
        });
        setTimeout(() => setBanner(null), 4200);
      }
    } catch {}
    setDrop(null);
    setGrabbing(false);
  }

  // Expired locally? hide
  if (drop && drop.expiresAt <= tickMs && tickMs !== 0) {
    setDrop(null);
  }

  const style = drop ? TIER_STYLE[drop.tier] || TIER_STYLE.common : null;
  const pctLeft = drop ? Math.max(0, Math.min(100, ((drop.expiresAt - (tickMs || Date.now())) / (drop.ttl * 1000)) * 100)) : 0;
  const secondsLeft = drop ? Math.max(0, Math.ceil((drop.expiresAt - (tickMs || Date.now())) / 1000)) : 0;

  return (
    <>
      {drop && (
        <button
          className={`lootdrop lootdrop--${drop.tier}`}
          style={{
            left: pos.current.left,
            top: pos.current.top,
            '--lootdrop-color': style.color,
            '--lootdrop-glow': style.glow,
          }}
          onClick={grab}
          disabled={grabbing || !isLoggedIn}
          title={isLoggedIn ? `Grab ${drop.tier} loot — $${drop.amount.toLocaleString()}` : 'Log in to grab loot'}>
          <div className="lootdrop-ring" />
          <div className="lootdrop-ring lootdrop-ring--2" />
          <div className="lootdrop-emoji">{drop.emoji}</div>
          <div className="lootdrop-amount">${drop.amount.toLocaleString()}</div>
          <div className="lootdrop-timer">
            <div className="lootdrop-timer-bar" style={{ width: `${pctLeft}%` }} />
          </div>
          <div className="lootdrop-sub">{drop.tier.toUpperCase()} · {secondsLeft}s</div>
        </button>
      )}

      {banner && (
        <div className={`lootdrop-banner lootdrop-banner--${banner.tier} ${banner.self ? 'lootdrop-banner--self' : ''}`}>
          <span className="lootdrop-banner-emoji">{banner.emoji}</span>
          <span className="lootdrop-banner-text">
            <b>{banner.winner}</b> grabbed the {banner.tier} drop!
          </span>
          <span className="lootdrop-banner-amount">+${banner.amount.toLocaleString()}</span>
        </div>
      )}
    </>
  );
}
