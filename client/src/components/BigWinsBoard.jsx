import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import './BigWinsBoard.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const ALLOWED_EMOJIS = ['🔥', '💰', '😂', '🚀', '👑', '💎', '🎉', '😱'];

const GAME_ICONS = {
  crash: '🚀', slots: '🎰', mines: '💣', plinko: '🎯', roulette: '🎡',
  blackjack: '♠', baccarat: '🎴', hilo: '🃏', dice: '🎲', wheel: '🎡',
  tower: '🗼', keno: '🎱', limbo: '🚀', 'video-poker': '🂡',
  'horse-racing': '🏇', 'dragon-tiger': '🐉', 'ride-the-bus': '🚌',
  'chicken-cross': '🐔', 'coin-flip': '🪙', 'scratch-card': '🎟️', 'casino-war': '⚔️',
};

function fmt(n) {
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(1)  + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  if (n >= 1e3)  return '$' + (n/1e3).toFixed(0)  + 'k';
  return '$' + n.toLocaleString();
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

export default function BigWinsBoard() {
  const [wins,      setWins]      = useState([]);
  // reactions: { [winId]: { emoji: count } }
  const [reactions, setReactions] = useState({});
  // which win is currently showing the emoji picker
  const [picking,   setPicking]   = useState(null);
  // user's own reacts: { [winId]: emoji }
  const [myReacts,  setMyReacts]  = useState({});

  useEffect(() => {
    fetch(`${SERVER_URL}/api/wins/recent?limit=8`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const withId = d.wins.slice(0, 8).map((w, i) => ({ ...w, _id: w.id || `w_${i}` }));
          setWins(withId);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for new big wins via socket
  useEffect(() => {
    const sock = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
    sock.on('bigWin', (w) => {
      setWins(prev => [{ ...w, _id: w.id || `w_${Date.now()}` }, ...prev].slice(0, 8));
    });
    return () => sock.disconnect();
  }, []);

  const react = useCallback((winId, emoji) => {
    if (myReacts[winId]) return; // already reacted to this win
    setReactions(prev => {
      const cur = prev[winId] || {};
      return { ...prev, [winId]: { ...cur, [emoji]: (cur[emoji] || 0) + 1 } };
    });
    setMyReacts(prev => ({ ...prev, [winId]: emoji }));
    setPicking(null);
    // Fire-and-forget to server
    fetch(`${SERVER_URL}/api/wins/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winId, emoji }),
    }).catch(() => {});
  }, [myReacts]);

  if (wins.length === 0) return null;

  return (
    <div className="bwb-wrap">
      <div className="bwb-header">
        <span className="bwb-title">🏆 Big Wins Board</span>
        <span className="bwb-sub">React to celebrate!</span>
      </div>
      <div className="bwb-grid">
        {wins.map(w => {
          const emojiMap  = reactions[w._id] || {};
          const myEmoji   = myReacts[w._id];
          const total     = Object.values(emojiMap).reduce((s, n) => s + n, 0);
          const topEmoji  = Object.entries(emojiMap).sort((a, b) => b[1] - a[1])[0];
          return (
            <div key={w._id} className="bwb-card">
              <div className="bwb-card-top">
                <span className="bwb-game-icon">{GAME_ICONS[w.game] || '🎮'}</span>
                <div className="bwb-card-info">
                  <div className="bwb-username">{w.username}</div>
                  <div className="bwb-game">{w.game} {w.multiplier ? `· ${w.multiplier.toFixed(1)}×` : ''}</div>
                </div>
                <div className="bwb-profit">{fmt(w.profit)}</div>
              </div>
              <div className="bwb-card-bottom">
                <span className="bwb-time">{timeAgo(w.timestamp || w.at || Date.now())}</span>

                {/* Reaction summary */}
                {total > 0 && (
                  <span className="bwb-react-sum">
                    {topEmoji ? topEmoji[0] : ''} {total}
                  </span>
                )}

                {/* React button */}
                <div className="bwb-react-wrap">
                  <button
                    className={`bwb-react-btn${myEmoji ? ' bwb-react-btn--done' : ''}`}
                    onClick={() => setPicking(picking === w._id ? null : w._id)}
                    disabled={!!myEmoji}
                    title={myEmoji ? `You reacted ${myEmoji}` : 'React'}
                  >
                    {myEmoji || '😄'}
                  </button>
                  {picking === w._id && !myEmoji && (
                    <div className="bwb-picker">
                      {ALLOWED_EMOJIS.map(e => (
                        <button key={e} className="bwb-picker-btn" onClick={() => react(w._id, e)}>{e}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
