import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (n >= 1000) return '$' + (n/1000).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}
function ms2clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export default function WishingWell() {
  const { token, isLoggedIn } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const sockRef = useRef(null);

  const refresh = useCallback(() => {
    fetch(`${SERVER_URL}/api/wishing-well`).then(r => r.json()).then(d => { if (d.ok) setStatus(d); }).catch(()=>{});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    const s = io(SERVER_URL + '/chat', { autoConnect: false });
    sockRef.current = s;
    s.connect();
    s.on('wishingWellThrow', () => refresh());
    s.on('wishingWellWinner', () => refresh());
    return () => { clearInterval(id); s.disconnect(); };
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function throwIn() {
    if (!isLoggedIn || loading) return;
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/wishing-well/throw`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg(`✨ Wish tossed! (${d.wishes} in well)`);
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setLoading(false);
  }

  if (!status) return null;
  const nextIn = Math.max(0, status.nextDrawIn - (tick * 1000));

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(168,85,247,0.08))',
      border: '1px solid rgba(59,130,246,0.35)',
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize: '1.4rem' }}>💫</span>
        <span style={{ fontFamily: 'var(--gv-font-display)', fontWeight: 900, fontSize: '1rem', letterSpacing: '2px', color: '#93c5fd', textTransform: 'uppercase' }}>Wishing Well</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#fff', background: 'rgba(0,0,0,0.3)', padding: '3px 10px', borderRadius: 999, fontFamily: 'var(--gv-font-display)', fontWeight: 700 }}>
          ⏱ {ms2clock(nextIn)}
        </span>
      </div>
      <div style={{ fontSize: '0.88rem', color: 'var(--gv-text-dim)' }}>
        Throw {fmt(status.throwAmount)} — one random wisher wins <b style={{ color: '#FFD700' }}>{fmt(status.throwAmount * status.winMulti)}</b> every hour. {status.wishes} wishes in the well.
      </div>
      {isLoggedIn ? (
        <button
          className="gv-btn gv-btn--purple"
          onClick={throwIn}
          disabled={loading}
          style={{ justifyContent: 'center' }}>
          {loading ? '…' : `🌟 Toss ${fmt(status.throwAmount)} in`}
        </button>
      ) : (
        <div style={{ color:'var(--gv-text-mute)', fontSize:'0.85rem', textAlign: 'center' }}>Log in to wish</div>
      )}
      {msg && <div style={{ fontSize: '0.82rem', textAlign: 'center', color: 'var(--gv-text-dim)' }}>{msg}</div>}
      {status.history && status.history.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--gv-text-mute)', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: 6 }}>
          Last win: <b style={{ color: '#fff' }}>{status.history[0].winner}</b> took <b style={{ color: '#FFD700' }}>{fmt(status.history[0].prize)}</b> from {status.history[0].participants} wishes
        </div>
      )}
    </div>
  );
}
