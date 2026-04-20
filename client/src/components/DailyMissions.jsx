import React, { useState, useEffect } from 'react';
import './DailyMissions.css';
import { setBalanceFromServer } from '../utils/casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function progressPct(m) {
  if (m.completed) return 100;
  const val = Math.min(m.progress || 0, m.target);
  return Math.floor((val / m.target) * 100);
}

function formatVal(m) {
  if (m.type === 'wager' || m.type === 'game_wager') {
    return `$${(m.progress || 0).toLocaleString()} / $${m.target.toLocaleString()}`;
  }
  if (m.type === 'big_win') return m.completed ? 'Done!' : 'Not yet';
  return `${m.progress || 0} / ${m.target}`;
}

export default function DailyMissions({ token, onRewardClaimed }) {
  const [missions, setMissions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [claiming, setClaiming] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/missions`, { headers: authHeaders(token) })
      .then(r => r.json())
      .then(d => { if (d.ok) setMissions(d.missions); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function claim(missionId) {
    if (claiming) return;
    setClaiming(missionId);
    try {
      const res  = await fetch(`${SERVER_URL}/api/missions/claim/${missionId}`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (data.ok) {
        setMissions(prev => prev.map(m => m.id === missionId ? { ...m, rewardClaimed: true } : m));
        if (data.newBalance != null) setBalanceFromServer(data.newBalance);
        if (onRewardClaimed) onRewardClaimed(data.reward);
      }
    } catch {}
    setClaiming(null);
  }

  if (loading) return null;
  if (!missions.length) return null;

  const completedCount = missions.filter(m => m.completed).length;

  return (
    <div className="dm-wrap">
      <div className="dm-header">
        <span className="dm-title">📋 Daily Missions</span>
        <span className="dm-progress">{completedCount}/{missions.length} done</span>
      </div>
      <div className="dm-list">
        {missions.map(m => (
          <div key={m.id} className={`dm-item ${m.completed ? 'dm-item--done' : ''} ${m.rewardClaimed ? 'dm-item--claimed' : ''}`}>
            <div className="dm-item-icon">{m.icon}</div>
            <div className="dm-item-body">
              <div className="dm-item-desc">{m.desc}</div>
              <div className="dm-item-bar-wrap">
                <div className="dm-item-bar">
                  <div className="dm-item-bar-fill" style={{ width: `${progressPct(m)}%` }} />
                </div>
                <span className="dm-item-val">{formatVal(m)}</span>
              </div>
            </div>
            <div className="dm-item-right">
              <div className="dm-item-reward">+${m.reward.toLocaleString()}</div>
              {m.completed && !m.rewardClaimed && (
                <button className="dm-claim-btn" onClick={() => claim(m.id)} disabled={claiming === m.id}>
                  {claiming === m.id ? '…' : 'Claim'}
                </button>
              )}
              {m.rewardClaimed && <span className="dm-claimed-label">✓</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="dm-footer">Resets at midnight UTC</div>
    </div>
  );
}
