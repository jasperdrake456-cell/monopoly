import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
function fmt(n) { return '$' + (n || 0).toLocaleString(); }

export default function PrestigePage() {
  const { token } = useAuth();
  const [data,    setData]    = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/prestige`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) setData(d); }).catch(() => {});
  }, [token]);

  async function doPrestige() {
    if (loading) return;
    setLoading(true); setError('');
    const r = await fetch(`${SERVER_URL}/api/prestige`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }));
    setLoading(false);
    if (r.ok) {
      setResult(r);
      if (typeof r.newBalance === 'number') setBalanceFromServer(r.newBalance);
      setData(prev => ({ ...prev, prestige: r.prestige, canPrestige: false }));
    } else setError(r.error || 'Failed');
    setConfirm(false);
  }

  const page = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:600, margin:'0 auto' };
  const card = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:24, marginBottom:16 };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:28 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>⭐ Prestige</h1>
      </div>

      {/* What is prestige */}
      <div style={{ ...card, background:'linear-gradient(135deg,#2a1a00,#1a1000)', borderColor:'rgba(251,191,36,.3)' }}>
        <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#fbbf24', marginBottom:8 }}>What is Prestige?</div>
        <p style={{ margin:0, color:'#94a3b8', fontSize:'0.88rem', lineHeight:1.6 }}>
          Once you reach <strong style={{ color:'#fbbf24' }}>Level 10</strong>, you can Prestige. Your XP resets to 0 but you earn an exclusive title, a massive coin bonus, and bragging rights. Up to 5 prestige levels!
        </p>
      </div>

      {/* Current status */}
      {data && (
        <div style={card}>
          <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>Your Prestige Status</div>
          {data.prestige.level > 0 ? (
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ fontSize:'2.5rem' }}>⭐</div>
              <div>
                <div style={{ fontSize:'1.2rem', fontWeight:900, color: data.prestige.color }}>{data.prestige.title}</div>
                <div style={{ fontSize:'0.82rem', color:'#64748b' }}>Prestige Level {data.prestige.level}</div>
              </div>
            </div>
          ) : (
            <div style={{ color:'#64748b', marginBottom:16 }}>No prestige yet — reach Level 10 to unlock!</div>
          )}

          {data.canPrestige && !result && (
            <>
              {!confirm ? (
                <button onClick={() => setConfirm(true)}
                  style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#d97706,#fbbf24)', border:'none', borderRadius:12, color:'#0f172a', fontWeight:900, fontSize:'1rem', cursor:'pointer' }}>
                  ⭐ Prestige Now!
                </button>
              ) : (
                <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.4)', borderRadius:12, padding:16 }}>
                  <div style={{ fontWeight:700, color:'#fca5a5', marginBottom:8 }}>⚠️ Your XP will reset to 0!</div>
                  <div style={{ color:'#94a3b8', fontSize:'0.85rem', marginBottom:12 }}>
                    You'll receive the prestige title and <strong style={{ color:'#fbbf24' }}>{fmt((data.titles[(data.prestige.level || 0)]?.bonus || 500000))}</strong> bonus.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={doPrestige} disabled={loading}
                      style={{ flex:1, padding:11, background:'linear-gradient(135deg,#d97706,#fbbf24)', border:'none', borderRadius:10, color:'#0f172a', fontWeight:900, cursor:'pointer', opacity:loading?.4:1 }}>
                      {loading ? 'Processing…' : 'Yes, Prestige!'}
                    </button>
                    <button onClick={() => setConfirm(false)}
                      style={{ flex:1, padding:11, background:'#1e293b', border:'1px solid #334155', borderRadius:10, color:'#94a3b8', cursor:'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {error && <div style={{ color:'#ef4444', fontSize:'0.85rem', marginTop:8 }}>❌ {error}</div>}
            </>
          )}

          {result && (
            <div style={{ textAlign:'center', background:'rgba(251,191,36,.08)', border:'1px solid rgba(251,191,36,.35)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:'3rem', marginBottom:8 }}>⭐</div>
              <div style={{ fontWeight:900, color:'#fbbf24', fontSize:'1.2rem', marginBottom:4 }}>Prestiged!</div>
              <div style={{ color: result.prestige.color, fontWeight:800, marginBottom:4 }}>{result.prestige.title}</div>
              <div style={{ color:'#94a3b8', fontSize:'0.85rem' }}>+{fmt(result.bonus)} bonus credited!</div>
            </div>
          )}
        </div>
      )}

      {/* All tiers */}
      {data && (
        <div style={card}>
          <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>Prestige Levels</div>
          {data.titles.map((t, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #1e293b' }}>
              <span style={{ fontSize:'1.4rem' }}>{'⭐'.repeat(i + 1)}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color: t.color }}>{t.title}</div>
                <div style={{ fontSize:'0.78rem', color:'#64748b' }}>Bonus: {fmt(t.bonus)}</div>
              </div>
              {(data.prestige.level || 0) >= t.level && <span style={{ color:'#22c55e', fontSize:'1rem' }}>✅</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
