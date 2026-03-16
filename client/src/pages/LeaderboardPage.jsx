import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../utils/leaderboard';
import './LeaderboardPage.css';

const SCORE_GAMES = [
  { id: 'snake',         icon: '🐍', name: 'Snake',         unit: 'pts', higherIsBetter: true },
  { id: 'tetris',        icon: '🧱', name: 'Tetris',        unit: 'pts', higherIsBetter: true },
  { id: '2048',          icon: '🔢', name: '2048',          unit: 'pts', higherIsBetter: true },
  { id: 'space_invaders',icon: '👾', name: 'Space Invaders',unit: 'pts', higherIsBetter: true },
  { id: 'flappy_bird',   icon: '🐦', name: 'Flappy Bird',   unit: 'pipes',higherIsBetter: true },
  { id: 'typing_speed',  icon: '⌨️', name: 'Typing Speed',  unit: 'WPM', higherIsBetter: true },
];

const TIME_GAMES = [
  { id: 'memory_match',       icon: '🃏', name: 'Memory Match',        unit: 'moves', higherIsBetter: false },
  { id: 'wordle',             icon: '🟩', name: 'Wordle',              unit: 'guesses', higherIsBetter: false },
  { id: 'minesweeper_Easy',   icon: '💣', name: 'Minesweeper (Easy)',   unit: 'sec', higherIsBetter: false },
  { id: 'minesweeper_Medium', icon: '💣', name: 'Minesweeper (Medium)', unit: 'sec', higherIsBetter: false },
  { id: 'minesweeper_Hard',   icon: '💣', name: 'Minesweeper (Hard)',   unit: 'sec', higherIsBetter: false },
  { id: 'sudoku_Easy',        icon: '🔲', name: 'Sudoku (Easy)',        unit: 'sec', higherIsBetter: false },
  { id: 'sudoku_Medium',      icon: '🔲', name: 'Sudoku (Medium)',      unit: 'sec', higherIsBetter: false },
  { id: 'sudoku_Hard',        icon: '🔲', name: 'Sudoku (Hard)',        unit: 'sec', higherIsBetter: false },
  { id: 'sudoku_Expert',      icon: '🔲', name: 'Sudoku (Expert)',      unit: 'sec', higherIsBetter: false },
];

function rankClass(i) {
  if (i === 0) return 'gold';
  if (i === 1) return 'silver';
  if (i === 2) return 'bronze';
  return '';
}

function rankLabel(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `#${i + 1}`;
}

function LeaderboardCard({ game }) {
  const entries = getLeaderboard(game.id);
  return (
    <div className="lb-card">
      <div className="lb-card-header">
        <span className="lb-card-icon">{game.icon}</span>
        <span className="lb-card-name">{game.name}</span>
        <span className="lb-card-unit">{game.unit}</span>
      </div>
      <div className="lb-entries">
        {entries.length === 0
          ? <div className="lb-empty">No scores yet — be the first!</div>
          : entries.map((e, i) => (
              <div key={i} className="lb-entry">
                <span className={`lb-rank ${rankClass(i)}`}>{rankLabel(i)}</span>
                <span className="lb-name">{e.name}</span>
                <span className="lb-score">{e.score}</span>
                <span className="lb-date">{e.date}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <div className="lb-page">
      <div className="lb-header">
        <Link to="/">← Hub</Link>
        <h1>🏆 Leaderboards</h1>
      </div>
      <div className="lb-main">
        <div className="lb-section-title">Score Games</div>
        <div className="lb-grid">
          {SCORE_GAMES.map(g => <LeaderboardCard key={g.id} game={g} />)}
        </div>
        <div className="lb-section-title">Time &amp; Accuracy Games</div>
        <div className="lb-grid">
          {TIME_GAMES.map(g => <LeaderboardCard key={g.id} game={g} />)}
        </div>
      </div>
    </div>
  );
}
