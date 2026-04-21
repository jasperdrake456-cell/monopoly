import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function TitlesPage() {
  const { token } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg,     setMsg]     = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/titles`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.ok) setData(d); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  async function equip(titleId) {
    const r = await fetch(`${SERVER_URL}/api/titles/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ titleId }),
    }).then(r => r.json()).catch(() => ({ ok: false }));
    if (r.ok) {
      setData(prev => ({ ...prev, equipped: r.title }));
      setMsg(r.title ? `✅ Equipped "${r.title.name}"` : '✅ Title removed');
      setTimeout(() => setMsg(''), 2000);
    }
  }

  const page = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:700, margin:'0 auto' };
  const card = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, padding:20, marginBottom:16 };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>🎖️ Titles</h1>
      </div>

      {loading ? <div style={{ textAlign:'center', color:'#475569', padding:40 }}>Loading…</div> : data && (
        <>
          {/* Current title */}
          <div style={card}>
            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:10 }}>Your Current Title</div>
            {data.equipped ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:'1.5rem', fontWeight:900, color: data.equipped.color }}>{data.equipped.name}</span>
                <button onClick={() => equip(null)} style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8, color:'#94a3b8', padding:'4px 10px', cursor:'pointer', fontSize:'0.78rem' }}>Remove</button>
              </div>
            ) : (
              <div style={{ color:'#64748b' }}>No title equipped — choose one below!</div>
            )}
            {msg && <div style={{ marginTop:8, fontSize:'0.82rem', color:'#22c55e' }}>{msg}</div>}
          </div>

          {/* How to earn */}
          <div style={{ ...card, background:'rgba(167,139,250,.06)', borderColor:'rgba(167,139,250,.25)' }}>
            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#a78bfa', marginBottom:8 }}>How It Works</div>
            <p style={{ margin:0, color:'#94a3b8', fontSize:'0.85rem', lineHeight:1.6 }}>
              Earn titles by unlocking specific achievements. Equipped titles show in the chat next to your name. Flex your skills!
            </p>
          </div>

          {/* Unlocked titles */}
          <div style={card}>
            <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#64748b', marginBottom:12 }}>
              Unlocked Titles ({data.unlocked.length}/{data.all.length})
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8 }}>
              {data.all.map(t => {
                const isUnlocked = data.unlocked.some(u => u.id === t.id);
                const isEquipped = data.equipped?.id === t.id;
                return (
                  <div key={t.id} style={{
                    background: isEquipped ? 'rgba(34,197,94,.1)' : isUnlocked ? '#1e293b' : '#12122a',
                    border: `1px solid ${isEquipped ? '#22c55e' : isUnlocked ? '#334155' : '#1e293b'}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    opacity: isUnlocked ? 1 : .4,
                    cursor: isUnlocked ? 'pointer' : 'default',
                  }}
                  onClick={() => isUnlocked && !isEquipped && equip(t.id)}>
                    <div style={{ fontWeight:700, color: t.color, marginBottom:2 }}>{t.name}</div>
                    <div style={{ fontSize:'0.72rem', color:'#64748b' }}>
                      {isEquipped ? '✅ Equipped' : isUnlocked ? 'Click to equip' : t.req ? `Requires: ${t.req}` : 'Default'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
