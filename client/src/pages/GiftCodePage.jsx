import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function GiftCodePage() {
  const { token } = useAuth();
  const [code,    setCode]    = useState('');
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function redeem() {
    if (!code.trim() || loading) return;
    setLoading(true); setResult(null); setError('');
    try {
      const r = await fetch(`${SERVER_URL}/api/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        setResult(d);
        if (typeof d.newBalance === 'number') setBalanceFromServer(d.newBalance);
        setCode('');
      } else setError(d.error || 'Invalid or expired code');
    } catch { setError('Network error'); }
    setLoading(false);
  }

  const pageStyle = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:480, margin:'0 auto' };

  return (
    <div style={pageStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:32 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🎁 Redeem Gift Code</h1>
      </div>

      <div style={{ background:'#12122a', border:'1px solid #1e293b', borderRadius:20, padding:32, textAlign:'center' }}>
        <div style={{ fontSize:'4rem', marginBottom:16 }}>🎁</div>
        <div style={{ fontSize:'1.1rem', fontWeight:700, marginBottom:8 }}>Enter your gift code</div>
        <div style={{ color:'#64748b', fontSize:'0.88rem', marginBottom:24 }}>Get free coins instantly added to your balance!</div>

        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && redeem()}
          placeholder="ENTER CODE HERE"
          maxLength={32}
          style={{
            width:'100%', boxSizing:'border-box',
            background:'#0f0f1a', border:`2px solid ${error ? '#ef4444' : '#334155'}`,
            borderRadius:12, color:'#e2e8f0', fontSize:'1.2rem',
            padding:'14px 16px', fontFamily:'monospace', letterSpacing:'.12em',
            textAlign:'center', marginBottom:12, outline:'none',
          }}
        />

        <button
          onClick={redeem}
          disabled={loading || !code.trim()}
          style={{
            width:'100%', padding:'14px',
            background: 'linear-gradient(135deg,#22c55e,#16a34a)',
            border:'none', borderRadius:12,
            color:'#fff', fontSize:'1rem', fontWeight:800,
            cursor:'pointer', opacity: (loading || !code.trim()) ? .5 : 1,
            marginBottom:12,
          }}>
          {loading ? '🔄 Checking…' : '🎁 Redeem Code'}
        </button>

        {result && (
          <div style={{ background:'linear-gradient(135deg,#0a2e0a,#0a1a0a)', border:'1px solid #22c55e', borderRadius:12, padding:20, animation:'none' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:6 }}>🎉</div>
            <div style={{ fontWeight:800, color:'#22c55e', marginBottom:4 }}>Code Redeemed!</div>
            <div style={{ fontSize:'1.8rem', fontWeight:900, color:'#f59e0b' }}>+${result.amount.toLocaleString()}</div>
            <div style={{ color:'#94a3b8', fontSize:'0.85rem', marginTop:4 }}>Added to your balance</div>
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.4)', borderRadius:10, padding:12, color:'#fca5a5', fontSize:'0.88rem' }}>
            ❌ {error}
          </div>
        )}
      </div>
    </div>
  );
}
