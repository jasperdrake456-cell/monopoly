import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard } from '../utils/leaderboard';
import './LeaderboardPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

async function submitReport(gameId, entryName, entryScore, reason) {
  await fetch(SERVER_URL + '/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, entryName, entryScore, reason }),
  });
}

const SCORE_GAMES = [
  { id: 'snake',         icon: '🐍', name: 'Snake',         unit: 'pts',    higherIsBetter: true },
  { id: 'tetris',        icon: '🧱', name: 'Tetris',        unit: 'pts',    higherIsBetter: true },
  { id: '2048',          icon: '🔢', name: '2048',          unit: 'pts',    higherIsBetter: true },
  { id: 'space_invaders',icon: '👾', name: 'Space Invaders',unit: 'pts',    higherIsBetter: true },
  { id: 'flappy_bird',   icon: '🐦', name: 'Flappy Bird',   unit: 'pipes',  higherIsBetter: true },
  { id: 'typing_speed',  icon: '⌨️', name: 'Typing Speed',  unit: 'WPM',   higherIsBetter: true },
  { id: 'texas-holdem',  icon: '♠️', name: 'Texas Hold\'em',unit: 'chip profit', higherIsBetter: true },
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

function ReportModal({ gameId, entry, onClose }) {
  const [reason, setReason] = useState('');
  const [sent, setSent]     = useState(false);

  async function send() {
    await submitReport(gameId, entry.name, entry.score, reason);
    setSent(true);
    setTimeout(onClose, 1500);
  }

  return (
    <div className="lb-report-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="lb-report-box">
        <div className="lb-report-title">🚩 Report Name</div>
        <div className="lb-report-entry">"{entry.name}"</div>
        {sent ? (
          <div className="lb-report-sent">✅ Reported! Thank you.</div>
        ) : (
          <>
            <textarea
              className="lb-report-reason"
              placeholder="Reason (optional)…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              maxLength={200}
            />
            <div className="lb-report-actions">
              <button className="lb-report-btn lb-report-btn--submit" onClick={send}>Submit Report</button>
              <button className="lb-report-btn" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LeaderboardCard({ game }) {
  const [entries, setEntries]     = useState(null);
  const [reporting, setReporting] = useState(null); // entry being reported

  useEffect(() => {
    getLeaderboard(game.id).then(setEntries);
  }, [game.id]);

  return (
    <div className="lb-card">
      {reporting && (
        <ReportModal gameId={game.id} entry={reporting} onClose={() => setReporting(null)} />
      )}
      <div className="lb-card-header">
        <span className="lb-card-icon">{game.icon}</span>
        <span className="lb-card-name">{game.name}</span>
        <span className="lb-card-unit">{game.unit}</span>
      </div>
      <div className="lb-entries">
        {entries === null
          ? <div className="lb-empty">Loading…</div>
          : entries.length === 0
            ? <div className="lb-empty">No scores yet — be the first!</div>
            : entries.map((e, i) => (
                <div key={i} className="lb-entry">
                  <span className={`lb-rank ${rankClass(i)}`}>{rankLabel(i)}</span>
                  <span className="lb-name">{e.name}</span>
                  <span className="lb-score">{e.score}</span>
                  <span className="lb-date">{e.date}</span>
                  <button className="lb-report-flag" title="Report this name" onClick={() => setReporting(e)}>🚩</button>
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
        <Link to="/">← Game Vault</Link>
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
