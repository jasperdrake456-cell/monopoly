import React, { useEffect, useState } from 'react';
import { checkAndClaimDaily, getBalance } from '../utils/casinoBalance';
import './DailyRewardBanner.css';

export default function DailyRewardBanner({ onBalanceChange }) {
  const [claimed, setClaimed] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const amount = checkAndClaimDaily();
    if (amount > 0) {
      setClaimed(amount);
      setVisible(true);
      if (onBalanceChange) onBalanceChange(getBalance());
      const t = setTimeout(() => setVisible(false), 4500);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="drb-banner">
      <span className="drb-icon">🎁</span>
      <div className="drb-text">
        <span className="drb-title">Daily Reward!</span>
        <span className="drb-amount">+${claimed} added to your balance</span>
      </div>
      <button className="drb-close" onClick={() => setVisible(false)}>✕</button>
    </div>
  );
}
