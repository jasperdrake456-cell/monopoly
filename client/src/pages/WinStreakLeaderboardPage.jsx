import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TIER_COLORS = {
  god:       { label: '🌋 GOD MODE',  color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  legendary: { label: '⚡ LEGENDARY', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  fire:      { label: '🔥 ON FIRE',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
  hot:       { label: '♨️ HOT',       color: '#f97316', bg: 'rgba(249,115,22,0.08)'  },
  none:      { label: '',             color: '#94a3b8', bg: 'transparent'             },
};

function getTier(streak) {
  if (streak >= 10) return 'god';
  if (streak >= 7)  return 'legendary';
  if (streak >= 5)  return 'fire';
  if (streak >= 3)  return 'hot';
  return 'none';
}

export default function WinStreakLeaderboardPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/leaderboard/streaks`)
      .then(r => r.json())
      .then(d => { if (d.ok) setPlayers(d.players); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const page = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:600, margin:'0 auto' };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🔥 Win Streak Board</h1>
      </div>

      <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:14, padding:'12px 16px', marginBottom:20, fontSize:'0.85rem', color:'#fca5a5' }}>
        Live win streaks from all active players. Streaks reset when a player loses.
      </div>

      {loading ? (
        <div style={{ textAlign:'center', color:'#475569', padding:60 }}>Loading…</div>
      ) : players.length === 0 ? (
        <div style={{ background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:32, textAlign:'center', color:'#475569' }}>
          No active win streaks right now. Be the first!
        </div>
      ) : (
        <div style={{ background:'#12122a', border:'1px solid #1e293b', borderRadius:16, overflow:'hidden' }}>
          {players.map((p, i) => {
            const tier = getTier(p.streak);
            const meta = TIER_COLORS[tier];
            return (
              <div key={p.username} style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'14px 16px',
                borderBottom: i < players.length - 1 ? '1px solid #1e293b' : 'none',
                background: meta.bg,
              }}>
                <span style={{ color:'#475569', minWidth:28, fontWeight:700, fontSize:'0.88rem' }}>#{i+1}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700 }}>
                    <Link to={`/profile/${p.username}`} style={{ color:'#e2e8f0', textDecoration:'none' }}>
                      {p.username}
                    </Link>
                  </div>
                  {meta.label && (
                    <div style={{ fontSize:'0.72rem', color: meta.color, fontWeight:700 }}>{meta.label}</div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'1.8rem', fontWeight:900, color: meta.color, lineHeight:1 }}>
                    {p.streak}
                  </div>
                  <div style={{ fontSize:'0.7rem', color:'#475569' }}>win streak</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
