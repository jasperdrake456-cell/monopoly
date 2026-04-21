import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}

export default function PlayerSearchPage() {
  const [query,   setQuery]   = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [top,     setTop]     = useState([]);
  const navigate = useNavigate();

  // Load top players for suggestions
  useEffect(() => {
    fetch(`${SERVER_URL}/api/stats/global`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.topPlayers) setTop(d.topPlayers.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setResult(null);
    fetch(`${SERVER_URL}/api/xp/profile/${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setResult({ ...d.profile, username: q });
        } else setError('Player not found.');
      })
      .catch(() => setError('Error searching. Try again.'))
      .finally(() => setLoading(false));
  }

  const page = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:600, margin:'0 auto' };
  const card = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:20, marginBottom:16 };

  const VIP_COLORS = { diamond:'#60a5fa', platinum:'#a78bfa', gold:'#fbbf24', silver:'#94a3b8', bronze:'#cd7f32' };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🔍 Player Search</h1>
      </div>

      <form onSubmit={search} style={{ display:'flex', gap:8, marginBottom:24 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by username…"
          style={{
            flex:1, background:'#12122a', border:'1px solid #1e293b',
            borderRadius:10, padding:'10px 14px', color:'#e2e8f0', fontSize:'1rem',
            outline:'none',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            background:'linear-gradient(135deg,#6366f1,#4f46e5)',
            color:'#fff', border:'none', borderRadius:10,
            padding:'10px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.95rem',
          }}
        >
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {error && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:10, padding:'12px 16px', color:'#fca5a5', marginBottom:16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem', fontWeight:900 }}>
              {result.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight:900, fontSize:'1.2rem', display:'flex', alignItems:'center', gap:8 }}>
                {result.username}
                {result.vipTier && result.vipTier !== 'none' && (
                  <span style={{ fontSize:'0.75rem', background:'rgba(251,191,36,0.15)', color: VIP_COLORS[result.vipTier] || '#fbbf24', borderRadius:6, padding:'2px 8px', fontWeight:700 }}>
                    👑 {result.vipTier.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ fontSize:'0.85rem', color:'#64748b' }}>
                Level {result.level} · {result.xp?.toLocaleString()} XP
              </div>
            </div>
            <Link to={`/profile/${result.username}`} style={{ marginLeft:'auto', background:'rgba(99,102,241,0.2)', color:'#818cf8', borderRadius:8, padding:'6px 14px', textDecoration:'none', fontWeight:700, fontSize:'0.85rem' }}>
              View Profile →
            </Link>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[
              { label:'Total Wagered', value: fmt(result.totalWagered) },
              { label:'Total Won',     value: fmt(result.totalWon) },
              { label:'Win Streak',    value: (result.winStreak || 0).toString() },
            ].map(s => (
              <div key={s.label} style={{ background:'#0f0f1a', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontWeight:800, fontSize:'1rem', color:'#e2e8f0' }}>{s.value}</div>
                <div style={{ fontSize:'0.7rem', color:'#475569', marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {top.length > 0 && !result && (
        <div style={card}>
          <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#475569', marginBottom:12 }}>Top Players</div>
          {top.map((p, i) => (
            <div
              key={p.username || i}
              onClick={() => { setQuery(p.username || ''); navigate(`/profile/${p.username}`); }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid #1e293b', cursor:'pointer' }}
            >
              <span style={{ color:'#475569', minWidth:24, fontWeight:700 }}>#{i+1}</span>
              <span style={{ flex:1, fontWeight:600 }}>{p.username}</span>
              <span style={{ color:'#22c55e', fontSize:'0.85rem' }}>{fmt(p.totalWon)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
