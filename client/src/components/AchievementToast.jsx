import React, { useState, useEffect } from 'react';
import './AchievementToast.css';

let _toastQueue = [];
let _listener   = null;

export function showAchievement(achievement) {
  _toastQueue.push(achievement);
  if (_listener) _listener([..._toastQueue]);
}

export function showLevelUp(levelInfo) {
  _toastQueue.push({ _type: 'levelup', ...levelInfo });
  if (_listener) _listener([..._toastQueue]);
}

export default function AchievementToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _listener = setToasts;
    return () => { _listener = null; };
  }, []);

  function dismiss(idx) {
    setToasts(t => t.filter((_, i) => i !== idx));
    _toastQueue.splice(idx, 1);
  }

  return (
    <div className="achievement-toast-container">
      {toasts.slice(0, 3).map((t, i) => (
        <div key={i} className={`achievement-toast ${t._type === 'levelup' ? 'achievement-toast--levelup' : ''}`}
          onClick={() => dismiss(i)}
          style={{ animationDelay: `${i * 0.1}s` }}
        >
          <div className="achievement-toast-icon">
            {t._type === 'levelup' ? '⬆️' : t.icon}
          </div>
          <div className="achievement-toast-body">
            {t._type === 'levelup' ? (
              <>
                <div className="achievement-toast-title">Level Up! {t.icon} {t.name}</div>
                <div className="achievement-toast-desc">You reached level {t.level}!</div>
              </>
            ) : (
              <>
                <div className="achievement-toast-title">🏆 Achievement Unlocked</div>
                <div className="achievement-toast-name">{t.name}</div>
                <div className="achievement-toast-desc">{t.desc}</div>
                {t.xpReward && <div className="achievement-toast-xp">+{t.xpReward.toLocaleString()} XP</div>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
