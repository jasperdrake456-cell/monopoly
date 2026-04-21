import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';
import './DailyCheckIn.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const REWARDS = [1_000, 2_500, 5_000, 7_500, 10_000, 20_000, 50_000];

function fmt(n) { return '$' + (n || 0).toLocaleString(); }

export default function DailyCheckIn() {
  const { token, isLoggedIn } = useAuth();
  const [status,  setStatus]  = useState(null);
  const [claimed, setClaimed] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/checkin`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) setStatus(d); }).catch(() => {});
  }, [token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function checkIn() {
    if (!token || loading || !status?.canClaim) return;
    setLoading(true);
    const r = await fetch(`${SERVER_URL}/api/checkin`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json()).catch(() => ({ ok: false }));
    setLoading(false);
    if (r.ok) {
      setClaimed(r);
      if (typeof r.newBalance === 'number') setBalanceFromServer(r.newBalance);
      setStatus(prev => prev ? { ...prev, canClaim: false, streak: r.streak } : prev);
    }
  }

  if (!isLoggedIn || !status) return null;

  return (
    <div className="dci">
      {claimed && (
        <div className="dci-claimed-overlay" onClick={() => setClaimed(null)}>
          <div className="dci-claimed-modal">
            <div className="dci-claimed-emoji">{claimed.isWeekly ? '🎉' : '✅'}</div>
            <div className="dci-claimed-title">{claimed.isWeekly ? 'Week Complete!' : 'Checked In!'}</div>
            <div className="dci-claimed-reward">{fmt(claimed.reward)}</div>
            <div className="dci-claimed-streak">Day {claimed.streak} streak</div>
            <button className="dci-claimed-btn">Sweet!</button>
          </div>
        </div>
      )}

      <div className="dci-header">
        <span className="dci-icon">📅</span>
        <div>
          <div className="dci-title">Daily Check-in</div>
          <div className="dci-sub">Streak: <strong style={{ color:'#f59e0b' }}>{status.streak} days</strong></div>
        </div>
      </div>

      {/* 7-day reward track */}
      <div className="dci-track">
        {REWARDS.map((r, i) => {
          const day      = i + 1;
          const isToday  = !status.alreadyClaimed && ((status.streak % 7) === i);
          const isPast   = status.streak > 0 && (status.streak % 7 > i || status.streak >= 7 && i < status.streak % 7);
          const isClaimed = status.streak % 7 > i || (status.streak > 0 && status.streak % 7 === 0);
          return (
            <div key={i} className={`dci-day ${isToday ? 'dci-day--today' : ''} ${isClaimed ? 'dci-day--past' : ''}`}>
              <div className="dci-day-num">Day {day}</div>
              <div className="dci-day-icon">{day === 7 ? '🎁' : '⭐'}</div>
              <div className="dci-day-reward">{r >= 1000 ? fmt(r) : fmt(r)}</div>
            </div>
          );
        })}
      </div>

      {status.canClaim ? (
        <button className="dci-btn" onClick={checkIn} disabled={loading}>
          {loading ? '⏳ Claiming…' : `📅 Check In — ${fmt(status.nextReward)}`}
        </button>
      ) : (
        <div className="dci-done">✅ Checked in today! Come back tomorrow.</div>
      )}
    </div>
  );
}
