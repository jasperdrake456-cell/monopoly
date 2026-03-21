import React, { useState, useEffect, useRef } from 'react';
import { getRank, addScore } from '../utils/leaderboard';
import { addBalance } from '../utils/casinoBalance';
import { useAuth } from '../contexts/AuthContext';
import './HighScoreModal.css';

const LEADERBOARD_REWARD = 500;
const AUTO_DISMISS_MS    = 4000;

/**
 * Auto-submits the score immediately on mount — no button click required.
 * Shows a toast for 4 seconds then auto-dismisses.
 */
export default function HighScoreModal({ gameId, score, label = 'points', higherIsBetter = true, onSave, onDismiss }) {
  const { user, isLoggedIn } = useAuth();
  const [rank, setRank]        = useState(null);
  const [timeLeft, setTimeLeft] = useState(AUTO_DISMISS_MS / 1000);
  const didSubmit = useRef(false);

  const displayName = isLoggedIn && user ? user.username : null;

  useEffect(() => {
    // Guests: dismiss silently
    if (!isLoggedIn || !displayName) { onDismiss && onDismiss(); return; }
    // Guard against StrictMode double-invoke
    if (didSubmit.current) return;
    didSubmit.current = true;

    // Submit immediately — no button needed
    addScore(gameId, score, displayName, higherIsBetter);
    addBalance(LEADERBOARD_REWARD);
    getRank(gameId, score, higherIsBetter).then(r => setRank(r));

    // Countdown + auto-dismiss
    const tick  = setInterval(() => setTimeLeft(t => t - 1), 1000);
    const close = setTimeout(() => { clearInterval(tick); onSave && onSave(displayName); }, AUTO_DISMISS_MS);
    return () => { clearInterval(tick); clearTimeout(close); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoggedIn || !displayName) return null;

  const scoreDisplay = typeof score === 'number' && !Number.isInteger(score)
    ? score.toFixed(1) : score;

  return (
    <div className="hs-backdrop" onClick={() => onSave && onSave(displayName)}>
      <div className="hs-box" onClick={e => e.stopPropagation()}>
        <div className="hs-trophy">🏆</div>
        <h2 className="hs-title">High Score!</h2>
        <p className="hs-subtitle">Saved automatically · +${LEADERBOARD_REWARD.toLocaleString()} bonus!</p>
        <div className="hs-score">
          {scoreDisplay} <span style={{ fontSize: '1rem', color: '#8b949e' }}>{label}</span>
        </div>
        {rank !== null && rank <= 10 && (
          <div className="hs-rank">#{rank} on the leaderboard</div>
        )}
        <div className="hs-username-badge">{displayName}</div>
        <p className="hs-auto-note">Closing in {Math.max(0, timeLeft)}s · tap to close now</p>
      </div>
    </div>
  );
}
