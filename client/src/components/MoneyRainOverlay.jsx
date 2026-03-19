import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './MoneyRainOverlay.css';

const BILL_COUNT = 38;
const EMOJIS = ['💵', '💸', '💰', '🤑', '💵', '💸', '💵'];

export default function MoneyRainOverlay() {
  const { moneyAlert, clearMoneyAlert } = useAuth();
  const timerRef = useRef(null);

  useEffect(() => {
    if (moneyAlert) {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(clearMoneyAlert, 5000);
    }
    return () => clearTimeout(timerRef.current);
  }, [moneyAlert, clearMoneyAlert]);

  if (!moneyAlert) return null;

  const bills = Array.from({ length: BILL_COUNT }, (_, i) => ({
    id: i,
    emoji: EMOJIS[i % EMOJIS.length],
    left: Math.random() * 100,
    delay: Math.random() * 1.8,
    duration: 2.2 + Math.random() * 1.6,
    size: 1.4 + Math.random() * 1.4,
    rotate: Math.random() * 360,
  }));

  return (
    <div className="mr-overlay" onClick={clearMoneyAlert}>
      {/* Falling bills */}
      {bills.map(b => (
        <span
          key={b.id}
          className="mr-bill"
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
            fontSize: `${b.size}rem`,
            '--rotate': `${b.rotate}deg`,
          }}
        >
          {b.emoji}
        </span>
      ))}

      {/* Centre card */}
      <div className="mr-card">
        <div className="mr-card-icon">🤑</div>
        <div className="mr-card-title">KA-CHING!</div>
        <div className="mr-card-amount">
          +${moneyAlert.amount.toLocaleString()}
        </div>
        <div className="mr-card-from">
          from <strong>@{moneyAlert.from}</strong>
        </div>
        <div className="mr-card-tap">tap to dismiss</div>
      </div>
    </div>
  );
}
