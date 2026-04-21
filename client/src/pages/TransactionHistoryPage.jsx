import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TYPE_META = {
  'mystery-box':  { label: 'Mystery Box',  color: '#a855f7', icon: '🎁' },
  'check-in':     { label: 'Daily Check-in', color: '#22c55e', icon: '📅' },
  bonus:          { label: 'Bonus',         color: '#22c55e', icon: '🎉' },
  win:            { label: 'Win',           color: '#22c55e', icon: '🏆' },
  loss:           { label: 'Loss',          color: '#ef4444', icon: '📉' },
  bet:            { label: 'Bet',           color: '#f59e0b', icon: '🎲' },
  deposit:        { label: 'Deposit',       color: '#22c55e', icon: '💰' },
  transfer:       { label: 'Transfer',      color: '#60a5fa', icon: '💸' },
  rain:           { label: 'Community Rain',color: '#22d3ee', icon: '🌧️' },
  prestige:       { label: 'Prestige',      color: '#fbbf24', icon: '⭐' },
  referral:       { label: 'Referral Bonus',color: '#86efac', icon: '🎁' },
  'daily-goal':   { label: 'Daily Goal',    color: '#34d399', icon: '🎯' },
  admin:          { label: 'Admin Bonus',   color: '#f472b6', icon: '🛡️' },
};

function getTypeMeta(type) {
  return TYPE_META[type] || { label: type, color: '#94a3b8', icon: '💵' };
}

function fmtAmt(n) {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '-';
  if (abs >= 1e9) return sign + '$' + (abs/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs/1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs/1e3).toFixed(1) + 'k';
  return sign + '$' + abs.toLocaleString();
}

function fmtBal(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}

function fmtTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function TransactionHistoryPage() {
  const { token } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${SERVER_URL}/api/balance-history?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setHistory(d.history); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const page  = { minHeight:'100vh', background:'#0f0f1a', color:'#e2e8f0', fontFamily:'Roboto,sans-serif', padding:'24px 16px 60px', maxWidth:700, margin:'0 auto' };
  const card  = { background:'#12122a', border:'1px solid #1e293b', borderRadius:16, overflow:'hidden' };

  return (
    <div style={page}>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:24 }}>
        <Link to="/" style={{ color:'#64748b', textDecoration:'none', fontSize:'0.88rem' }}>← Home</Link>
        <h1 style={{ margin:0, fontSize:'1.8rem', fontWeight:900 }}>📜 Transaction History</h1>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', color:'#475569', padding:60 }}>Loading…</div>
      ) : history.length === 0 ? (
        <div style={{ ...card, padding:32, textAlign:'center', color:'#475569' }}>
          No transactions yet. Start playing to see your history!
        </div>
      ) : (
        <div style={card}>
          {history.map((tx, i) => {
            const meta = getTypeMeta(tx.type);
            return (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i < history.length - 1 ? '1px solid #1e293b' : 'none',
              }}>
                <span style={{ fontSize:'1.4rem', flexShrink:0 }}>{meta.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:'0.88rem', color: meta.color }}>{meta.label}</div>
                  {tx.description && (
                    <div style={{ fontSize:'0.78rem', color:'#64748b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {tx.description}
                    </div>
                  )}
                  <div style={{ fontSize:'0.72rem', color:'#475569', marginTop:2 }}>{fmtTime(tx.at)}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:'0.95rem', color: tx.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                    {fmtAmt(tx.amount)}
                  </div>
                  {tx.balance !== undefined && (
                    <div style={{ fontSize:'0.75rem', color:'#475569' }}>Bal: {fmtBal(tx.balance)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
