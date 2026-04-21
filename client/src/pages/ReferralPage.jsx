import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) { return '$' + (n || 0).toLocaleString(); }

export default function ReferralPage() {
  const { token } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [code,    setCode]    = useState('');
  const [msg,     setMsg]     = useState('');
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(() => {
    fetch(`${SERVER_URL}/api/referral`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) setStats(d); }).catch(() => {});
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  async function useReferral() {
    if (!code.trim() || loading) return;
    setLoading(true); setMsg('');
    const r = await fetch(`${SERVER_URL}/api/referral/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ code: code.trim() }),
    }).then(r => r.json()).catch(() => ({ ok: false, error: 'Network error' }));
    setLoading(false);
    setMsg(r.ok ? `🎉 Success! You and your referrer each got ${fmt(r.bonus)}!` : `❌ ${r.error}`);
    if (r.ok) fetchStats();
  }

  function copyCode() {
    navigator.clipboard.writeText(stats.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const pageStyle = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:600, margin:'0 auto' };
  const cardStyle = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:20, marginBottom:16 };

  return (
    <div style={pageStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🎁 Referral Program</h1>
      </div>

      {/* How it works */}
      <div style={{ ...cardStyle, background:'linear-gradient(135deg,#0a2e1a,#0a1a0a)', borderColor:'rgba(34,197,94,.3)' }}>
        <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#22c55e', marginBottom:8 }}>How it works</div>
        <p style={{ margin:0, color:'#94a3b8', fontSize:'0.88rem', lineHeight:1.6 }}>
          Share your code with friends. When they sign up and use your code, <strong style={{ color:'#22c55e' }}>you both get $10,000</strong> added to your balance. No limits — each new player you refer earns you another bonus!
        </p>
      </div>

      {/* Your code */}
      {stats && (
        <div style={cardStyle}>
          <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>Your Referral Code</div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <div style={{ flex:1, background:'#0f0f1a', border:'2px solid #334155', borderRadius:10, padding:'12px 16px', fontFamily:'monospace', fontSize:'1.5rem', fontWeight:900, color:'#f59e0b', letterSpacing:'.15em' }}>
              {stats.code}
            </div>
            <button onClick={copyCode} style={{ padding:'12px 18px', background: copied ? '#22c55e' : '#1e293b', border:'1px solid #334155', borderRadius:10, color:'#e2e8f0', cursor:'pointer', fontWeight:700, fontSize:'0.88rem', transition:'background .2s' }}>
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <div style={{ display:'flex', gap:16 }}>
            <div style={{ flex:1, textAlign:'center', background:'#0f0f1a', borderRadius:10, padding:12 }}>
              <div style={{ fontSize:'1.6rem', fontWeight:900, color:'#f59e0b' }}>{stats.uses || 0}</div>
              <div style={{ fontSize:'0.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>Friends Referred</div>
            </div>
            <div style={{ flex:1, textAlign:'center', background:'#0f0f1a', borderRadius:10, padding:12 }}>
              <div style={{ fontSize:'1.6rem', fontWeight:900, color:'#22c55e' }}>{fmt((stats.uses || 0) * 10000)}</div>
              <div style={{ fontSize:'0.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>Total Earned</div>
            </div>
          </div>
          {(stats.referrals || []).length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:'0.72rem', textTransform:'uppercase', color:'#475569', marginBottom:8 }}>Your Referrals</div>
              {stats.referrals.map((r, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #1e293b', fontSize:'0.82rem' }}>
                  <span>{r.username}</span>
                  <span style={{ color:'#64748b' }}>{new Date(r.at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Use a code */}
      <div style={cardStyle}>
        <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>Use a Referral Code</div>
        <div style={{ display:'flex', gap:10, marginBottom:8 }}>
          <input
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Enter code…"
            maxLength={8}
            style={{ flex:1, background:'#0f0f1a', border:'1px solid #334155', borderRadius:10, color:'#e2e8f0', fontSize:'1rem', padding:'10px 14px', fontFamily:'monospace', letterSpacing:'.12em' }}
          />
          <button onClick={useReferral} disabled={loading || !code.trim()}
            style={{ padding:'10px 20px', background:'linear-gradient(135deg,#22c55e,#16a34a)', border:'none', borderRadius:10, color:'#fff', fontWeight:800, cursor:'pointer', opacity: (loading||!code.trim()) ? .5 : 1 }}>
            {loading ? '…' : 'Redeem'}
          </button>
        </div>
        {msg && <div style={{ fontSize:'0.85rem', color: msg.startsWith('🎉') ? '#22c55e' : '#ef4444' }}>{msg}</div>}
      </div>
    </div>
  );
}
