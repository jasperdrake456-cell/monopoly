import React, { useEffect, useState } from 'react';

const SYMBOLS = [
  { id: 'bitcoin',  symbol: 'BTC', icon: '₿',  color: '#f7931a' },
  { id: 'ethereum', symbol: 'ETH', icon: 'Ξ',  color: '#627eea' },
  { id: 'solana',   symbol: 'SOL', icon: '◎',  color: '#9945ff' },
];

function fmt(n) {
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CryptoPrices() {
  const [prices, setPrices] = useState({});
  const [error,  setError]  = useState(false);

  useEffect(() => {
    function fetchPrices() {
      const ids = SYMBOLS.map(s => s.id).join(',');
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`)
        .then(r => r.json())
        .then(d => { setPrices(d); setError(false); })
        .catch(() => setError(true));
    }
    fetchPrices();
    const id = setInterval(fetchPrices, 60_000);
    return () => clearInterval(id);
  }, []);

  if (error || Object.keys(prices).length === 0) return null;

  return (
    <div style={{
      background: '#12122a',
      border: '1px solid #1e293b',
      borderRadius: 14,
      padding: '10px 14px',
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize:'0.7rem', color:'#475569', textTransform:'uppercase', letterSpacing:'.08em', flexShrink:0 }}>Live Crypto</span>
      {SYMBOLS.map(s => {
        const price  = prices[s.id]?.usd || 0;
        const change = prices[s.id]?.usd_24h_change || 0;
        return (
          <div key={s.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ color: s.color, fontWeight:900 }}>{s.icon} {s.symbol}</span>
            <span style={{ fontWeight:700, fontSize:'0.9rem' }}>{fmt(price)}</span>
            <span style={{ fontSize:'0.75rem', color: change >= 0 ? '#22c55e' : '#ef4444', fontWeight:600 }}>
              {change >= 0 ? '▲' : '▼'}{Math.abs(change).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
