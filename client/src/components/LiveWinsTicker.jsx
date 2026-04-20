import React, { useState, useEffect, useRef } from 'react';
import './LiveWinsTicker.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const GAME_ICONS = {
  crash: '🚀', slots: '🎰', mines: '💣', plinko: '🎯', roulette: '🎡',
  blackjack: '♠', baccarat: '🎴', 'hi-lo': '🃏', dice: '🎲', wheel: '🎡',
  tower: '🗼', keno: '🎱', limbo: '🚀', 'video-poker': '🂡', 'crash-game': '🚀',
  'horse-racing': '🏇', 'dragon-tiger': '🐉', 'ride-the-bus': '🚌',
};

export default function LiveWinsTicker() {
  const [wins, setWins] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    // Load recent wins on mount
    fetch(`${SERVER_URL}/api/wins/recent`)
      .then(r => r.json())
      .then(d => { if (d.ok) setWins(d.wins.slice(0, 8)); })
      .catch(() => {});
  }, []);

  // Listen for live wins via socket
  useEffect(() => {
    const handler = (win) => {
      setWins(prev => [win, ...prev].slice(0, 12));
    };
    // Connect to the global socket if available
    if (window.__gameSocket) {
      window.__gameSocket.on('bigWin', handler);
      return () => window.__gameSocket.off('bigWin', handler);
    }
  }, []);

  if (wins.length === 0) return null;

  return (
    <div className="lwt-wrap">
      <div className="lwt-label">🔥 Live Wins</div>
      <div className="lwt-track" ref={listRef}>
        <div className="lwt-inner">
          {[...wins, ...wins].map((w, i) => (
            <div key={i} className="lwt-item">
              <span className="lwt-icon">{GAME_ICONS[w.game] || '🎮'}</span>
              <span className="lwt-user">{w.username}</span>
              <span className="lwt-won">+${w.profit?.toLocaleString() ?? '?'}</span>
              {w.multiplier && <span className="lwt-mult">{w.multiplier.toFixed(2)}×</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
