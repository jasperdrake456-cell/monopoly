import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function msToHMS(ms) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}m ${String(s).padStart(2,'0')}s`;
}

export default function BoostPage() {
  const { token } = useAuth();
  const [status,  setStatus]  = useState(null);
  const [msg,     setMsg]     = useState('');
  const [left,    setLeft]    = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch(`${SERVER_URL}/api/boost`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) { setStatus(d); setLeft(d.remaining || 0); } }).catch(() => {});
  }, [token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(id);
  }, [left]);

  async function activate() {
    if (loading) return;
    setLoading(true); setMsg('');
    const d = await fetch(`${SERVER_URL}/api/boost/activate`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` },
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }));
    setLoading(false);
    if (d.ok) { setMsg('🚀 Boost activated! 2× wins for 30 minutes!'); fetchStatus(); }
    else setMsg(`❌ ${d.error}`);
  }

  const pageStyle = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:560, margin:'0 auto' };
  const cardStyle = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:24, marginBottom:16 };

  return (
    <div style={pageStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🚀 Boost Tokens</h1>
      </div>

      {/* What are boosts */}
      <div style={{ ...cardStyle, background:'linear-gradient(135deg,#1a0a2e,#2a0a4e)', borderColor:'rgba(167,139,250,.35)' }}>
        <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#a78bfa', marginBottom:8 }}>What are Boost Tokens?</div>
        <p style={{ margin:0, color:'#94a3b8', fontSize:'0.88rem', lineHeight:1.6 }}>
          Activate a Boost Token to get <strong style={{ color:'#fbbf24' }}>2× multiplier on all casino game wins</strong> for 30 minutes. Earn tokens by completing achievements, daily missions, and level-up milestones.
        </p>
      </div>

      {/* Status */}
      {status && (
        <div style={cardStyle}>
          {status.active ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:8 }}>🔥</div>
              <div style={{ fontSize:'1.4rem', fontWeight:900, color:'#fbbf24', marginBottom:4 }}>BOOST ACTIVE!</div>
              <div style={{ fontSize:'0.88rem', color:'#94a3b8', marginBottom:12 }}>2× wins for another</div>
              <div style={{ fontSize:'2.5rem', fontWeight:900, color:'#f59e0b', fontVariantNumeric:'tabular-nums' }}>{msToHMS(left)}</div>
              {status.tokens > 0 && (
                <div style={{ marginTop:12 }}>
                  <button onClick={activate} disabled={loading}
                    style={{ padding:'10px 20px', background:'linear-gradient(135deg,#7c3aed,#a855f7)', border:'none', borderRadius:10, color:'#fff', fontWeight:700, cursor:'pointer', opacity:loading?.4:1 }}>
                    + Stack another boost ({status.tokens} tokens left)
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'3rem', marginBottom:8 }}>🎁</div>
              <div style={{ fontSize:'1.1rem', fontWeight:700, marginBottom:4 }}>You have <span style={{ color:'#fbbf24', fontSize:'1.4rem' }}>{status.tokens}</span> boost token{status.tokens !== 1 ? 's' : ''}</div>
              {status.tokens > 0 ? (
                <button onClick={activate} disabled={loading}
                  style={{ marginTop:12, padding:'13px 28px', background:'linear-gradient(135deg,#f59e0b,#d97706)', border:'none', borderRadius:12, color:'#0f172a', fontWeight:900, fontSize:'1rem', cursor:'pointer', opacity:loading?.4:1 }}>
                  {loading ? 'Activating…' : '🚀 Activate Boost!'}
                </button>
              ) : (
                <div style={{ color:'#64748b', fontSize:'0.88rem', marginTop:8 }}>
                  Complete achievements and missions to earn more tokens!
                </div>
              )}
            </div>
          )}
          {msg && <div style={{ textAlign:'center', marginTop:12, fontSize:'0.88rem', color: msg.startsWith('🚀') ? '#22c55e' : '#ef4444' }}>{msg}</div>}
        </div>
      )}

      {/* How to earn */}
      <div style={cardStyle}>
        <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>How to Earn Boost Tokens</div>
        {[
          { icon:'🏅', text:'Unlock new achievements' },
          { icon:'📋', text:'Complete daily missions' },
          { icon:'⬆️', text:'Level up (every 2 levels)' },
          { icon:'🎁', text:'Mystery Box (rare reward)' },
          { icon:'🎡', text:'Daily Spin jackpot' },
        ].map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid #1e293b', fontSize:'0.88rem', color:'#94a3b8' }}>
            <span>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
