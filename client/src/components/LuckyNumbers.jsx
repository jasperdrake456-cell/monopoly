import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function LuckyNumbers() {
  const [nums, setNums] = useState([]);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/lucky-numbers`)
      .then(r => r.json())
      .then(d => { if (d.ok) setNums(d.numbers); })
      .catch(() => {});
  }, []);

  if (nums.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#0a1a2e,#0a2e1a)',
      border: '1px solid rgba(34,211,238,.2)',
      borderRadius: 14,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#22d3ee', marginBottom:8 }}>
        🎲 Today's Lucky Roulette Numbers <span style={{ color:'#64748b', fontWeight:400 }}>— 2× XP on bets!</span>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        {nums.map(n => (
          <div key={n} style={{
            width: 38, height: 38,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#0ea5e9,#22d3ee)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '1rem', color: '#0f172a',
            boxShadow: '0 0 12px rgba(34,211,238,.3)',
          }}>{n}</div>
        ))}
        <Link to="/roulette" style={{ marginLeft:'auto', fontSize:'0.78rem', color:'#22d3ee', textDecoration:'none', fontWeight:600 }}>Play Roulette →</Link>
      </div>
    </div>
  );
}
