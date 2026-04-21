import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function JackpotRushBanner() {
  const [rush, setRush] = useState(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function fetchStatus() {
      fetch(`${SERVER_URL}/api/jackpot-rush`)
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.active) {
            setRush(d);
            setRemaining(d.remaining);
          } else {
            setRush(null);
          }
        })
        .catch(() => {});
    }
    fetchStatus();
    const poll = setInterval(fetchStatus, 60_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!rush?.active) return;
    const tick = setInterval(() => {
      setRemaining(r => {
        if (r <= 1000) { setRush(null); return 0; }
        return r - 1000;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [rush]);

  if (!rush) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#1a0a00,#2a1400)',
      border: '1px solid rgba(251,191,36,.5)',
      borderRadius: 14,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      animation: 'pulse 2s infinite',
    }}>
      <span style={{ fontSize: '1.5rem' }}>⚡</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.95rem', letterSpacing: '.02em' }}>
          JACKPOT RUSH ACTIVE
        </div>
        <div style={{ fontSize: '0.78rem', color: '#d97706' }}>
          Slots jackpot growing 2× faster right now! Ends in <strong style={{ color: '#fbbf24' }}>{fmt(remaining)}</strong>
        </div>
      </div>
      <Link to="/slots" style={{
        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
        color: '#1a0a00',
        fontWeight: 900,
        padding: '6px 14px',
        borderRadius: 8,
        textDecoration: 'none',
        fontSize: '0.85rem',
        flexShrink: 0,
      }}>
        🎰 Play Slots
      </Link>
    </div>
  );
}
