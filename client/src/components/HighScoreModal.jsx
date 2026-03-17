import React, { useState, useEffect } from 'react';
import { getRank, addScore } from '../utils/leaderboard';
import { addBalance } from '../utils/casinoBalance';
import { useAuth } from '../contexts/AuthContext';
import './HighScoreModal.css';

const LEADERBOARD_REWARD = 10; // $10 for making the leaderboard

export default function HighScoreModal({ gameId, score, label = 'points', higherIsBetter = true, onSave, onDismiss }) {
  const { user, isLoggedIn } = useAuth();
  const [rank, setRank] = useState(null);

  // The name to submit is always the account username when logged in.
  // If not logged in, we skip the modal (guests can't submit scores).
  const displayName = isLoggedIn && user ? user.username : null;

  useEffect(() => {
    getRank(gameId, score, higherIsBetter).then(setRank);
  }, [gameId, score, higherIsBetter]);

  function handleSave() {
    if (!displayName) { onDismiss(); return; }
    addScore(gameId, score, displayName, higherIsBetter);
    addBalance(LEADERBOARD_REWARD); // +$10 for making the leaderboard
    onSave(displayName);
  }

  // If the player isn't logged in, dismiss silently — no guest scores allowed
  if (!isLoggedIn || !displayName) {
    return null;
  }

  return (
    <div className="hs-backdrop" onClick={e => e.target === e.currentTarget && onDismiss()}>
      <div className="hs-box">
        <div className="hs-trophy">🏆</div>
        <h2 className="hs-title">New High Score!</h2>
        <p className="hs-subtitle">You made the leaderboard</p>
        <div className="hs-score">{typeof score === 'number' && !Number.isInteger(score) ? score.toFixed(1) : score} <span style={{ fontSize: '1rem', color: '#8b949e' }}>{label}</span></div>
        {rank !== null && rank <= 10 && <div className="hs-rank">#{rank} on the leaderboard</div>}
        <div className="hs-label" style={{ marginBottom: '4px' }}>Submitting as</div>
        <div className="hs-username-badge">{displayName}</div>
        <div className="hs-actions" style={{ marginTop: '16px' }}>
          <button className="hs-btn hs-btn--save" onClick={handleSave}>
            Save Score
          </button>
          <button className="hs-btn hs-btn--skip" onClick={onDismiss}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
