import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './LiveJackpots.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (!n) return '$0';
  if (n >= 1_000_000_000) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1_000_000)     return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1_000)         return '$' + (n / 1e3).toFixed(0) + 'k';
  return '$' + n.toLocaleString();
}

export default function LiveJackpots() {
  const [data, setData] = useState(null);

  async function fetchAll() {
    const [slots, lottery, race] = await Promise.all([
      fetch(`${SERVER_URL}/api/jackpot`).then(r => r.json()).catch(() => ({ amount: 0 })),
      fetch(`${SERVER_URL}/api/lottery`).then(r => r.json()).catch(() => ({ jackpot: 0 })),
      fetch(`${SERVER_URL}/api/wager-race`).then(r => r.json()).catch(() => ({ prizePool: 0 })),
    ]);
    setData({
      slots:   slots.amount  || 0,
      lottery: lottery.jackpot || 0,
      race:    race.prizePool  || 0,
    });
  }

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const items = [
    { label: '🎰 Slots Jackpot',  value: data.slots,   path: '/slots',       color: '#fbbf24' },
    { label: '🎟️ Lottery Pot',    value: data.lottery, path: '/lottery',     color: '#a855f7' },
    { label: '🏁 Wager Race Pool', value: data.race,    path: '/wager-race',  color: '#f59e0b' },
  ];

  return (
    <div className="ljp-wrap">
      {items.map(item => (
        <Link key={item.label} to={item.path} className="ljp-item" style={{ '--jc': item.color }}>
          <div className="ljp-label">{item.label}</div>
          <div className="ljp-value">{fmt(item.value)}</div>
        </Link>
      ))}
    </div>
  );
}
