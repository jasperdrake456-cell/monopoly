import React, { useState, useEffect, useCallback, useRef } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore } from '../utils/leaderboard';
import { addBalance } from '../utils/casinoBalance';
import './Game2048.css';

const TILE_COLORS = {
  0:    ['#cdc1b4', '#776e65'],
  2:    ['#eee4da', '#776e65'],
  4:    ['#ede0c8', '#776e65'],
  8:    ['#f2b179', '#f9f6f2'],
  16:   ['#f59563', '#f9f6f2'],
  32:   ['#f67c5f', '#f9f6f2'],
  64:   ['#f65e3b', '#f9f6f2'],
  128:  ['#edcf72', '#f9f6f2'],
  256:  ['#edcc61', '#f9f6f2'],
  512:  ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
};

function newBoard() {
  const b = Array.from({ length: 4 }, () => Array(4).fill(0));
  addTile(b);
  addTile(b);
  return b;
}

function addTile(board) {
  const empty = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!board[r][c]) empty.push([r, c]);
  if (!empty.length) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  board[r][c] = Math.random() < 0.9 ? 2 : 4;
}

function slideRow(row) {
  let arr = row.filter(x => x !== 0);
  let score = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      score += arr[i];
      arr.splice(i + 1, 1);
    }
  }
  while (arr.length < 4) arr.push(0);
  return { row: arr, score };
}

function moveLeft(board) {
  let score = 0;
  const newB = board.map(row => {
    const { row: nr, score: s } = slideRow(row);
    score += s;
    return nr;
  });
  return { board: newB, score };
}

function rotate90(board) {
  return board[0].map((_, c) => board.map(row => row[c]).reverse());
}

function applyMove(board, dir) {
  // 0=left, 1=up, 2=right, 3=down
  let b = board.map(r => [...r]);
  for (let i = 0; i < dir; i++) b = rotate90(b);
  const { board: moved, score } = moveLeft(b);
  let result = moved;
  for (let i = 0; i < (4 - dir) % 4; i++) result = rotate90(result);
  // Check if board changed
  const changed = result.some((row, r) => row.some((v, c) => v !== board[r][c]));
  return { board: result, score, changed };
}

function canMove(board) {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!board[r][c]) return true;
      if (c < 3 && board[r][c] === board[r][c + 1]) return true;
      if (r < 3 && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

const BEST_KEY = '2048_best';

export default function Game2048({ onBack }) {
  const [board, setBoard] = useState(() => newBoard());
  const [score, setScore] = useState(0);
  const [best, setBest]   = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0'));
  const [won, setWon]     = useState(false);
  const [over, setOver]   = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [showHS, setShowHS] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);

  const move = useCallback((dir) => {
    if (over) return;
    setBoard(prev => {
      const { board: nb, score: gained, changed } = applyMove(prev, dir);
      if (!changed) return prev;
      addTile(nb);
      setScore(s => {
        const ns = s + gained;
        setBest(b => {
          const nb2 = Math.max(b, ns);
          localStorage.setItem(BEST_KEY, String(nb2));
          return nb2;
        });
        return ns;
      });
      if (!keepPlaying && nb.some(row => row.includes(2048))) { setWon(true); addBalance(20); } // +$20 for reaching 2048
      if (!canMove(nb)) {
        setOver(true);
        setScore(s => { if (s > 0) isHighScore('2048', s).then(yes => { if (yes) { setPendingScore(s); setShowHS(true); } }); return s; });
      }
      return nb;
    });
  }, [over, keepPlaying]);

  useEffect(() => {
    function handleKey(e) {
      const map = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3 };
      if (map[e.key] !== undefined) { e.preventDefault(); move(map[e.key]); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [move]);

  // Swipe support
  useEffect(() => {
    let sx = 0, sy = 0;
    function ts(e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    function te(e) {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 0 : 2);
      else move(dy < 0 ? 1 : 3);
    }
    window.addEventListener('touchstart', ts);
    window.addEventListener('touchend', te);
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); };
  }, [move]);

  function restart() {
    setBoard(newBoard());
    setScore(0);
    setWon(false);
    setOver(false);
    setKeepPlaying(false);
  }

  return (
    <div className="g2048-page">
      <div className="g2048-topbar">
        <button className="g2048-back" onClick={onBack}>← Game Vault</button>
        <div className="g2048-title">2048</div>
        <div className="g2048-scores">
          <div className="g2048-score-box"><div className="g2048-score-label">SCORE</div><div className="g2048-score-val">{score}</div></div>
          <div className="g2048-score-box"><div className="g2048-score-label">BEST</div><div className="g2048-score-val">{best}</div></div>
        </div>
      </div>
      <div className="g2048-controls">
        <button className="g2048-btn" onClick={restart}>New Game</button>
        <span className="g2048-hint">Use arrow keys or swipe</span>
      </div>
      <div className="g2048-board">
        {board.map((row, r) => row.map((val, c) => {
          const [bg, fg] = TILE_COLORS[val] || ['#3c3a32', '#f9f6f2'];
          return (
            <div key={`${r}-${c}`} className={`g2048-tile ${val ? 'g2048-tile--filled' : ''}`}
              style={{ background: bg, color: fg, fontSize: val >= 1024 ? '1.4rem' : val >= 128 ? '1.7rem' : '2rem' }}>
              {val || ''}
            </div>
          );
        }))}
      </div>
      {won && !keepPlaying && (
        <div className="g2048-overlay">
          <div className="g2048-overlay-box">
            <div className="g2048-overlay-title">🎉 You Win!</div>
            <button className="g2048-btn" onClick={() => setKeepPlaying(true)}>Keep Playing</button>
            <button className="g2048-btn g2048-btn--sec" onClick={restart}>New Game</button>
          </div>
        </div>
      )}
      {over && (
        <div className="g2048-overlay">
          <div className="g2048-overlay-box">
            <div className="g2048-overlay-title">Game Over</div>
            <div className="g2048-overlay-score">Score: {score}</div>
            <button className="g2048-btn" onClick={restart}>Try Again</button>
          </div>
        </div>
      )}
      {showHS && <HighScoreModal gameId="2048" score={pendingScore} label="pts" onSave={() => setShowHS(false)} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
