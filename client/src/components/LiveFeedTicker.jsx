import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './LiveFeedTicker.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const TYPE_META = {
  'meme-launch':        { icon: '🚀', color: '#fb923c',  label: 'NEW COIN' },
  'meme-trade':         { icon: '🪙', color: '#fbbf24',  label: 'MEME TRADE' },
  'prediction-buy':     { icon: '🔮', color: '#ec4899',  label: 'PREDICTION' },
  'prediction-resolve': { icon: '📊', color: '#a855f7',  label: 'RESOLVED' },
  'bank-deposit':       { icon: '🏦', color: '#fde047',  label: 'VAULT' },
  'wishing-well-win':   { icon: '💫', color: '#93c5fd',  label: 'WELL WIN' },
};

function fmt(n) {
  if (n >= 1_000_000) return '$' + (n/1e6).toFixed(1) + 'M';
  if (n >= 1000)      return '$' + (n/1000).toFixed(1) + 'k';
  return '$' + n.toLocaleString();
}

function ago(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h`;
}

function formatEvent(ev) {
  const d = ev.data;
  switch (ev.type) {
    case 'meme-launch':        return <><b>{d.user}</b> launched <b>{d.emoji}{' '}${d.symbol}</b> ({d.name})</>;
    case 'meme-trade':         return <><b>{d.user}</b> {d.type === 'buy' ? 'bought' : 'sold'} <b>${d.symbol}</b> for {fmt(d.amount)}</>;
    case 'prediction-buy':     return <><b>{d.user}</b> bet <b>{d.shares}</b>×<b>{d.side?.toUpperCase()}</b> on "{(d.question||'').slice(0,45)}…"</>;
    case 'prediction-resolve': return <>Market resolved <b>{d.outcome?.toUpperCase()}</b>: "{(d.question||'').slice(0,45)}" — {d.winnerCount} winners</>;
    case 'bank-deposit':       return <><b>{d.user}</b> deposited <b>{fmt(d.amount)}</b> into the Vault</>;
    case 'wishing-well-win':   return <><b>{d.winner}</b> won the Wishing Well jackpot of <b>{fmt(d.prize)}</b> from {d.participants} wishes!</>;
    default: return null;
  }
}

export default function LiveFeedTicker() {
  const [events, setEvents] = useState([]);
  const sockRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      fetch(`${SERVER_URL}/api/live-feed?limit=20`).then(r => r.json()).then(d => {
        if (!cancelled && d.ok) setEvents(d.events);
      }).catch(()=>{});
    }
    refresh();
    const id = setInterval(refresh, 15000);
    const s = io(SERVER_URL + '/chat', { autoConnect: false });
    sockRef.current = s;
    s.connect();
    const onAny = () => refresh();
    ['memeCoinCreated','memeCoinTrade','predictionMarketUpdate','predictionMarketResolved','wishingWellWinner']
      .forEach(ev => s.on(ev, onAny));
    return () => { cancelled = true; clearInterval(id); s.disconnect(); };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="lft">
      <div className="lft-label">🛰️ LIVE</div>
      <div className="lft-track">
        <div className="lft-inner">
          {[...events, ...events].map((ev, i) => {
            const meta = TYPE_META[ev.type] || { icon: '•', color: '#aaa', label: 'EVENT' };
            return (
              <div key={i} className="lft-item">
                <span className="lft-icon">{meta.icon}</span>
                <span className="lft-type" style={{ color: meta.color }}>{meta.label}</span>
                <span className="lft-body">{formatEvent(ev)}</span>
                <span className="lft-time">{ago(ev.at)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
