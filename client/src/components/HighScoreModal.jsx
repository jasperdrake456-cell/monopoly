import React, { useState, useEffect } from 'react';
import { isClean, cleanName } from '../utils/profanity';
import { getRank, addScore } from '../utils/leaderboard';
import './HighScoreModal.css';

export default function HighScoreModal({ gameId, score, label = 'points', higherIsBetter = true, onSave, onDismiss }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [rank, setRank] = useState(null);

  useEffect(() => {
    getRank(gameId, score, higherIsBetter).then(setRank);
  }, [gameId, score, higherIsBetter]);

  function handleSave() {
    const trimmed = cleanName(name);
    if (!trimmed) { setError('Please enter a name.'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (!isClean(trimmed)) { setError('Please choose a more appropriate name.'); return; }
    addScore(gameId, score, trimmed, higherIsBetter);
    onSave(trimmed);
  }

  return (
    <div className="hs-backdrop" onClick={e => e.target === e.currentTarget && onDismiss()}>
      <div className="hs-box">
        <div className="hs-trophy">🏆</div>
        <h2 className="hs-title">New High Score!</h2>
        <p className="hs-subtitle">You made the leaderboard</p>
        <div className="hs-score">{typeof score === 'number' && !Number.isInteger(score) ? score.toFixed(1) : score} <span style={{ fontSize: '1rem', color: '#8b949e' }}>{label}</span></div>
        {rank !== null && rank <= 10 && <div className="hs-rank">#{rank} on the leaderboard</div>}
        <label className="hs-label">Your name</label>
        <input
          className={`hs-input${error ? ' hs-input--error' : ''}`}
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Enter your name…"
          maxLength={20}
          autoFocus
        />
        {error && <div className="hs-error">{error}</div>}
        <div className="hs-actions">
          <button className="hs-btn hs-btn--save" onClick={handleSave} disabled={!name.trim()}>
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
