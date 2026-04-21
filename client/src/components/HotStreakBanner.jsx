import React, { useEffect, useState, useRef } from 'react';
import './HotStreakBanner.css';

// Listens for 'streakUpdate' custom events dispatched by casinoBalance.js
export default function HotStreakBanner() {
  const [streak, setStreak]     = useState(0);
  const [visible, setVisible]   = useState(false);
  const [flare,   setFlare]     = useState(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    function onStreak(e) {
      const { streak: s, won } = e.detail || {};
      setStreak(s);
      if (!won || s < 3) {
        setVisible(false);
        return;
      }
      setVisible(true);
      setFlare(true);
      setTimeout(() => setFlare(false), 600);
      // Auto-hide after 8 s (user can also dismiss)
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 8000);
    }
    window.addEventListener('streakUpdate', onStreak);
    return () => {
      window.removeEventListener('streakUpdate', onStreak);
      clearTimeout(hideTimer.current);
    };
  }, []);

  if (!visible || streak < 3) return null;

  const tier = streak >= 10 ? 'god'
             : streak >= 7  ? 'legendary'
             : streak >= 5  ? 'fire'
             : 'hot';

  const labels = {
    hot:       '🌶️ Hot Streak!',
    fire:      '🔥 ON FIRE!',
    legendary: '⚡ UNSTOPPABLE!',
    god:       '👑 GODMODE!',
  };

  return (
    <div className={`hsb hsb--${tier} ${flare ? 'hsb--flare' : ''}`}
         onClick={() => setVisible(false)}>
      <div className="hsb-inner">
        <span className="hsb-label">{labels[tier]}</span>
        <span className="hsb-count">{streak} wins in a row</span>
        <span className="hsb-close">✕</span>
      </div>
    </div>
  );
}
