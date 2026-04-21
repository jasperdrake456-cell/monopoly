import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(0) + 'k';
  return '$' + n.toLocaleString();
}

function fmtBonus(n) {
  if (n >= 1e3) return '+$' + (n/1e3).toFixed(1) + 'k';
  return '+$' + n;
}

export default function DailyGoals() {
  const { token } = useAuth();
  const [status,   setStatus]   = useState(null);
  const [claiming, setClaiming] = useState(null);
  const [claimed,  setClaimed]  = useState(null);

  function load() {
    if (!token) return;
    fetch(`${SERVER_URL}/api/daily-goals`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setStatus(d); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, [token]);

  async function claim(tierId) {
    if (!token) return;
    setClaiming(tierId);
    try {
      const r = await fetch(`${SERVER_URL}/api/daily-goals/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
      });
      const d = await r.json();
      if (d.ok) {
        setClaimed(d.tier);
        setTimeout(() => { setClaimed(null); load(); }, 2500);
      }
    } finally {
      setClaiming(null);
    }
  }

  if (!token || !status) return null;

  const { wageredToday, tiers, claimedTiers, nextTier } = status;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#0a1a2e,#0d1a0a)',
      border: '1px solid rgba(52,211,153,.2)',
      borderRadius: 14,
      padding: '14px 16px',
    }}>
      {claimed && (
        <div style={{
          position:'fixed', top:80, left:'50%', transform:'translateX(-50%)',
          background:'linear-gradient(135deg,#065f46,#047857)',
          border:'1px solid #34d399', borderRadius:12, padding:'14px 24px',
          color:'#6ee7b7', fontWeight:800, zIndex:9999, fontSize:'1rem', textAlign:'center',
        }}>
          🎯 Goal Complete! {fmtBonus(claimed.bonus)} + {claimed.xp} XP!
        </div>
      )}

      <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#34d399', marginBottom:10 }}>
        🎯 Daily Goals
      </div>

      {/* Progress toward next tier */}
      {nextTier && (
        <div style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', color:'#64748b', marginBottom:4 }}>
            <span>{fmt(wageredToday)} wagered</span>
            <span>Next: {fmt(nextTier.target)}</span>
          </div>
          <div style={{ height:6, background:'#1e293b', borderRadius:3, overflow:'hidden' }}>
            <div style={{
              height:'100%',
              width: Math.min(100, (wageredToday / nextTier.target) * 100) + '%',
              background: 'linear-gradient(90deg,#34d399,#059669)',
              borderRadius:3, transition:'width .4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Tier list */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {tiers.map(tier => {
          const done      = wageredToday >= tier.target;
          const isClaimed = claimedTiers.includes(tier.id);
          const canClaim  = done && !isClaimed;
          return (
            <div key={tier.id} style={{
              display:'flex', alignItems:'center', gap:10,
              background: done ? 'rgba(52,211,153,0.07)' : 'transparent',
              borderRadius:8, padding:'6px 8px',
              opacity: isClaimed ? 0.5 : 1,
            }}>
              <span style={{ fontSize:'1rem' }}>{isClaimed ? '✅' : done ? '🟡' : '⬜'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:'0.85rem', color: done ? '#34d399' : '#94a3b8' }}>{tier.label}</div>
                <div style={{ fontSize:'0.72rem', color:'#475569' }}>Wager {fmt(tier.target)}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#22c55e' }}>{fmtBonus(tier.bonus)}</div>
                <div style={{ fontSize:'0.7rem', color:'#475569' }}>+{tier.xp} XP</div>
              </div>
              {canClaim && (
                <button
                  onClick={() => claim(tier.id)}
                  disabled={claiming === tier.id}
                  style={{
                    background:'linear-gradient(135deg,#34d399,#059669)',
                    color:'#064e3b', border:'none', borderRadius:6,
                    padding:'4px 10px', fontWeight:800, cursor:'pointer', fontSize:'0.78rem',
                  }}
                >
                  {claiming === tier.id ? '…' : 'Claim'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
