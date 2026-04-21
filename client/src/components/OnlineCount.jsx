import React, { useEffect, useState } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function OnlineCount() {
  const [count, setCount] = useState(null);

  useEffect(() => {
    function fetch_() {
      fetch(`${SERVER_URL}/api/online-count`)
        .then(r => r.json())
        .then(d => { if (d.ok) setCount(d.online); })
        .catch(() => {});
    }
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => clearInterval(id);
  }, []);

  if (count === null) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: '0.78rem',
      color: '#94a3b8',
      background: '#12122a',
      border: '1px solid #1e293b',
      borderRadius: 20,
      padding: '3px 10px',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#22c55e',
        boxShadow: '0 0 6px #22c55e',
        display: 'inline-block',
      }} />
      {count} online
    </span>
  );
}
