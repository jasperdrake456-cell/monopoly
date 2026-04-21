import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './CommunityRainPool.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const AMOUNTS = [500, 1000, 2500, 5000, 10000];
const TARGET  = 500_000;

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'k';
  return '$' + n.toLocaleString();
}

export default function CommunityRainPool() {
  const { token, isLoggedIn } = useAuth();
  const [status,     setStatus]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState('');
  const [selected,   setSelected]   = useState(1000);
  const [rain,       setRain]       = useState(null); // { perUser, total, players }
  const socketRef = useRef(null);

  const fetchStatus = useCallback(() => {
    fetch(`${SERVER_URL}/api/rain/status`)
      .then(r => r.json())
      .then(d => { if (d.ok) setStatus(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15_000);

    // Real-time updates
    const sock = io(SERVER_URL + '/chat', { autoConnect: false });
    socketRef.current = sock;
    sock.connect();
    sock.on('rainPoolUpdate', (d) => {
      setStatus(prev => prev ? { ...prev, pool: d.pool, progress: Math.min(100, Math.floor((d.pool / TARGET) * 100)) } : prev);
    });
    sock.on('communityRain', (d) => {
      setRain(d);
      // Update local balance
      fetchStatus();
      // Auto-dismiss after 8s
      setTimeout(() => setRain(null), 8000);
    });
    sock.on('balanceReset', (d) => {
      if (d.username === token /* crude check */ ) return;
      // handled by AccountWidget already
    });

    return () => { clearInterval(id); sock.disconnect(); };
  }, [fetchStatus, token]);

  async function contribute() {
    if (!isLoggedIn || !token || loading) return;
    setLoading(true);
    setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/rain/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amount: selected }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus(d);
        setMsg(`✅ You added ${fmt(selected)} to the pool!`);
      } else {
        setMsg(`❌ ${d.error || 'Failed'}`);
      }
    } catch {
      setMsg('❌ Connection error');
    }
    setLoading(false);
  }

  if (!status) return null;
  const { pool = 0, progress = 0, contributors = [], history = [] } = status;

  return (
    <div className="crp">
      {/* Rain explosion overlay */}
      {rain && (
        <div className="crp-rain-overlay" onClick={() => setRain(null)}>
          <div className="crp-rain-modal">
            <div className="crp-rain-emoji">🌧️</div>
            <div className="crp-rain-title">COMMUNITY RAIN!</div>
            <div className="crp-rain-amount">{fmt(rain.perUser)}</div>
            <div className="crp-rain-sub">dropped to all {rain.players} online players</div>
            <div className="crp-rain-total">Total pool: {fmt(rain.totalPool)}</div>
            <button className="crp-rain-close" onClick={() => setRain(null)}>🎉 Collect!</button>
          </div>
        </div>
      )}

      <div className="crp-header">
        <span className="crp-title">🌧️ Community Rain Pool</span>
        <span className="crp-subtitle">Fill the pool — everyone online gets a share!</span>
      </div>

      {/* Progress bar */}
      <div className="crp-progress-wrap">
        <div className="crp-progress-bar" style={{ width: `${progress}%` }}></div>
        <div className="crp-progress-label">
          <span>{fmt(pool)}</span>
          <span className="crp-progress-target">/ {fmt(TARGET)}</span>
        </div>
      </div>

      {/* Amount selector + contribute */}
      {isLoggedIn ? (
        <>
          <div className="crp-amounts">
            {AMOUNTS.map(a => (
              <button key={a}
                className={`crp-amt-btn ${selected === a ? 'crp-amt-btn--active' : ''}`}
                onClick={() => setSelected(a)}>{fmt(a)}</button>
            ))}
          </div>
          <button className="crp-contribute-btn" onClick={contribute} disabled={loading}>
            {loading ? 'Contributing…' : `💧 Contribute ${fmt(selected)}`}
          </button>
          {msg && <div className="crp-msg">{msg}</div>}
        </>
      ) : (
        <div className="crp-login-note">Log in to contribute to the pool</div>
      )}

      {/* Recent contributors */}
      {contributors.length > 0 && (
        <div className="crp-contributors">
          <div className="crp-contrib-label">Recent contributors</div>
          <div className="crp-contrib-list">
            {contributors.slice().reverse().slice(0, 8).map((c, i) => (
              <span key={i} className="crp-contrib-chip">
                {c.username} <span className="crp-contrib-amt">{fmt(c.amount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="crp-history">
          <div className="crp-history-label">Last rains</div>
          {history.map((h, i) => (
            <div key={i} className="crp-history-row">
              <span>{fmt(h.perUser)} each</span>
              <span className="crp-history-meta">· {h.players} players · {fmt(h.totalPool)} total</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
