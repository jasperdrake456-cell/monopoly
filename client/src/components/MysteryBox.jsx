import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './MysteryBox.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TIER_COLORS = {
  common:    '#94a3b8',
  uncommon:  '#22c55e',
  rare:      '#3b82f6',
  epic:      '#a855f7',
  legendary: '#fbbf24',
};

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}

function useCd(ms) {
  const [left, setLeft] = useState(ms);
  useEffect(() => {
    if (ms <= 0) return;
    setLeft(ms);
    const id = setInterval(() => setLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [ms]);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1_000);
  const pad = n => String(n).padStart(2, '0');
  return left > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : '';
}

export default function MysteryBox() {
  const { token, isLoggedIn } = useAuth();
  const [status,  setStatus]  = useState(null);
  const [reward,  setReward]  = useState(null);   // just-claimed reward
  const [opening, setOpening] = useState(false);  // animation
  const [loading, setLoading] = useState(false);
  const cdStr = useCd(status?.remaining || 0);

  const fetchStatus = useCallback(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/mystery-box`, {
      headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json()).then(d => { if (d.ok) setStatus(d); }).catch(() => {});
  }, [token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  // Refresh every minute
  useEffect(() => {
    const id = setInterval(fetchStatus, 60_000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function openBox() {
    if (!token || loading || !status?.canClaim) return;
    setLoading(true);
    setOpening(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/mystery-box/claim`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const d = await r.json();
      // Delay reveal for animation
      setTimeout(() => {
        setOpening(false);
        if (d.ok) {
          setReward(d.reward);
          setStatus(prev => prev ? { ...prev, canClaim: false, remaining: 4 * 3600 * 1000, lastReward: d.reward } : prev);
        }
        setLoading(false);
      }, 1200);
    } catch {
      setOpening(false);
      setLoading(false);
    }
  }

  if (!isLoggedIn) return null;
  if (!status) return null;

  return (
    <div className="mbox">
      {/* Result reveal */}
      {reward && (
        <div className="mbox-reveal" onClick={() => setReward(null)}>
          <div className="mbox-reveal-inner" style={{ '--tc': TIER_COLORS[reward.tier] }}>
            <div className="mbox-reveal-emoji">{reward.emoji}</div>
            <div className="mbox-reveal-tier" style={{ color: TIER_COLORS[reward.tier] }}>{reward.tier.toUpperCase()}</div>
            <div className="mbox-reveal-label">{reward.label}</div>
            <div className="mbox-reveal-amount">{fmt(reward.amount)}</div>
            <div className="mbox-reveal-sub">added to your balance!</div>
            <button className="mbox-reveal-close" onClick={() => setReward(null)}>Sweet! 🎉</button>
          </div>
        </div>
      )}

      <div className="mbox-header">
        <span className="mbox-icon">🎁</span>
        <div>
          <div className="mbox-title">Mystery Box</div>
          <div className="mbox-sub">Free reward every 4 hours</div>
        </div>
      </div>

      {status.canClaim ? (
        <button className={`mbox-btn ${opening ? 'mbox-btn--shake' : ''}`}
                onClick={openBox} disabled={loading}>
          {opening ? '✨ Opening…' : '🎁 Open Box!'}
        </button>
      ) : (
        <div className="mbox-cd">
          <div className="mbox-cd-label">Next box in</div>
          <div className="mbox-cd-time">{cdStr || 'Ready soon…'}</div>
          {status.lastReward && (
            <div className="mbox-last">
              Last: <span style={{ color: TIER_COLORS[status.lastReward.tier] }}>
                {status.lastReward.emoji} {fmt(status.lastReward.amount)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
