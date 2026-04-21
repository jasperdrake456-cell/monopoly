import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './NewsBanner.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TYPE_STYLES = {
  info:    { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)',  color: '#93c5fd', icon: '📢' },
  event:   { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)',  color: '#fcd34d', icon: '🎉' },
  update:  { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',   color: '#86efac', icon: '🆕' },
  warning: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',   color: '#fca5a5', icon: '⚠️' },
};

export default function NewsBanner() {
  const [news,    setNews]    = useState([]);
  const [hidden,  setHidden]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('gv_dismissed_news') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    fetch(`${SERVER_URL}/api/news`)
      .then(r => r.json())
      .then(d => { if (d.ok) setNews(d.news); })
      .catch(() => {});

    const sock = io(SERVER_URL + '/chat', { autoConnect: false });
    sock.connect();
    sock.on('newsBroadcast', item => setNews(prev => [item, ...prev].slice(0, 20)));
    sock.on('newsDeleted', ({ id }) => setNews(prev => prev.filter(n => n.id !== id)));
    return () => sock.disconnect();
  }, []);

  function dismiss(id) {
    const next = [...hidden, id];
    setHidden(next);
    try { localStorage.setItem('gv_dismissed_news', JSON.stringify(next.slice(-50))); } catch {}
  }

  const visible = news.filter(n => n.pinned || !hidden.includes(n.id)).slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <div className="news-banner-list">
      {visible.map(n => {
        const s = TYPE_STYLES[n.type] || TYPE_STYLES.info;
        return (
          <div key={n.id} className="news-banner-item"
               style={{ background: s.bg, borderColor: s.border }}>
            <span className="news-banner-icon">{s.icon}</span>
            <div className="news-banner-content">
              <strong style={{ color: s.color }}>{n.title}</strong>
              {n.body && <span className="news-banner-body"> — {n.body}</span>}
            </div>
            {!n.pinned && (
              <button className="news-banner-close" onClick={() => dismiss(n.id)}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
