import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return '$' + (n/1e3).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}

export default function HouseStatsPage() {
  const [stats,  setStats]  = useState(null);
  const [wins,   setWins]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/api/stats/global`).then(r => r.json()),
      fetch(`${SERVER_URL}/api/wins/recent`).then(r => r.json()),
      fetch(`${SERVER_URL}/api/wins/today`).then(r => r.json()),
    ]).then(([s, r, t]) => {
      if (s.ok)  setStats(s);
      if (t.ok)  setWins(t.wins.slice(0, 10));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const page  = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:800, margin:'0 auto' };
  const card  = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:20, marginBottom:16 };
  const scard = { background:'#12122a', border:'1px solid #1e293b', borderRadius:12, padding:16, textAlign:'center' };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🏛️ House Statistics</h1>
      </div>

      {loading ? <div style={{ textAlign:'center', color:'#475569', padding:60 }}>Loading…</div> : stats && (
        <>
          {/* Key metrics */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:16 }}>
            {[
              { label:'Total Profits Paid', value: fmt(stats.totalProfitPaid), color:'#22c55e' },
              { label:'Big Wins Logged',    value: (stats.bigWinCount || 0).toLocaleString(), color:'#f59e0b' },
              { label:'Lottery Jackpot',    value: fmt(stats.lotteryJackpot), color:'#a855f7' },
              { label:'Wager Race Pool',    value: fmt(stats.wagerRacePool), color:'#f59e0b' },
              { label:'Players Online',     value: (stats.onlineNow || 0).toString(), color:'#22c55e' },
              { label:'Total Players',      value: (stats.totalUsers || 0).toLocaleString(), color:'#94a3b8' },
            ].map(s => (
              <div key={s.label} style={scard}>
                <div style={{ fontSize:'1.4rem', fontWeight:900, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:'0.7rem', color:'#64748b', marginTop:4, textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Biggest win ever */}
          {stats.biggestWinEver && (
            <div style={{ ...card, background:'linear-gradient(135deg,#1a1200,#2a1a00)', borderColor:'rgba(245,158,11,.3)' }}>
              <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#f59e0b', marginBottom:10 }}>🏆 All-Time Biggest Win</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <div style={{ fontSize:'2.5rem', fontWeight:900, color:'#fbbf24' }}>{fmt(stats.biggestWinEver.profit)}</div>
                <div>
                  <div style={{ fontWeight:700 }}>{stats.biggestWinEver.username}</div>
                  <div style={{ color:'#64748b', fontSize:'0.82rem' }}>{stats.biggestWinEver.game} · {stats.biggestWinEver.multiplier ? `${stats.biggestWinEver.multiplier}×` : ''}</div>
                </div>
              </div>
            </div>
          )}

          {/* Today's top wins */}
          {wins.length > 0 && (
            <div style={card}>
              <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>Today's Top Winners</div>
              <div>
                {wins.map((w, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e293b', fontSize:'0.85rem' }}>
                    <span style={{ color:'#475569', minWidth:24, fontWeight:700 }}>#{i+1}</span>
                    <span style={{ flex:1, fontWeight:600 }}>{w.username}</span>
                    <span style={{ color:'#94a3b8' }}>{w.game}</span>
                    <span style={{ color:'#22c55e', fontWeight:700 }}>{fmt(w.profit)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
