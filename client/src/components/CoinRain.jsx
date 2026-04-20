import React, { useState, useEffect, useRef } from 'react';
import './CoinRain.css';

let _trigger = null;
export function triggerCoinRain(amount, message) {
  if (_trigger) _trigger({ amount, message });
}

export default function CoinRain() {
  const [active, setActive] = useState(false);
  const [info,   setInfo]   = useState(null);
  const [coins,  setCoins]  = useState([]);
  const timerRef = useRef(null);

  useEffect(() => {
    _trigger = (data) => {
      setInfo(data);
      setActive(true);
      const c = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        size: 20 + Math.random() * 24,
        emoji: ['🪙','💰','💵','🤑','💎'][Math.floor(Math.random() * 5)],
      }));
      setCoins(c);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(false), 5000);
    };
    return () => { _trigger = null; clearTimeout(timerRef.current); };
  }, []);

  if (!active) return null;

  return (
    <div className="coin-rain-overlay" onClick={() => setActive(false)}>
      <div className="coin-rain-banner">
        <div className="coin-rain-banner-emoji">🌧️</div>
        <div className="coin-rain-banner-text">
          <div className="coin-rain-banner-title">{info?.message || 'Coin Rain!'}</div>
          {info?.amount && <div className="coin-rain-banner-amount">+${info.amount.toLocaleString()} for everyone online!</div>}
        </div>
      </div>
      {coins.map(c => (
        <div key={c.id} className="coin-rain-coin"
          style={{
            left: `${c.left}%`,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            fontSize: `${c.size}px`,
          }}
        >
          {c.emoji}
        </div>
      ))}
    </div>
  );
}
