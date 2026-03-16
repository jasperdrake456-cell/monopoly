import React, { useState, useCallback, useEffect, useRef } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore } from '../utils/leaderboard';
import { addBalance } from '../utils/casinoBalance';
import './Minesweeper.css';

const DIFFICULTIES = {
  Easy:   { rows: 9,  cols: 9,  mines: 10 },
  Medium: { rows: 16, cols: 16, mines: 40 },
  Hard:   { rows: 16, cols: 30, mines: 99 },
};

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false, revealed: false, flagged: false, adjacent: 0,
    }))
  );
}

function placeMines(grid, rows, cols, mines, safeR, safeC) {
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = safeR + dr, c = safeC + dc;
    if (r >= 0 && r < rows && c >= 0 && c < cols) safe.add(`${r},${c}`);
  }
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!safe.has(`${r},${c}`)) cells.push([r, c]);
  }
  cells.sort(() => Math.random() - 0.5);
  for (let i = 0; i < mines; i++) {
    const [r, c] = cells[i];
    grid[r][c].mine = true;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c].mine) continue;
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].mine) count++;
    }
    grid[r][c].adjacent = count;
  }
}

function revealBFS(grid, rows, cols, startR, startC) {
  const queue = [[startR, startC]];
  const visited = new Set();
  while (queue.length) {
    const [r, c] = queue.shift();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cell = grid[r][c];
    if (cell.flagged || cell.revealed) continue;
    cell.revealed = true;
    if (cell.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(`${nr},${nc}`))
          queue.push([nr, nc]);
      }
    }
  }
}

const NUM_COLORS = ['', '#1565c0','#2e7d32','#c62828','#4a148c','#bf360c','#006064','#212121','#546e7a'];

export default function Minesweeper({ onBack }) {
  const [diff, setDiff]     = useState('Easy');
  const [grid, setGrid]     = useState(null);
  const [status, setStatus] = useState('idle'); // idle, playing, won, lost
  const [minesLeft, setMinesLeft] = useState(0);
  const [time, setTime]     = useState(0);
  const timerRef = useRef(null);
  const longPressRef = useRef(null);
  const [showHS, setShowHS] = useState(false);
  const [pendingTime, setPendingTime] = useState(null);

  function handleTouchStart(r, c) {
    longPressRef.current = setTimeout(() => {
      handleRightClick({ preventDefault: () => {} }, r, c);
    }, 500);
  }
  function handleTouchEnd() { clearTimeout(longPressRef.current); }

  function newGame(d = diff) {
    const { rows, cols, mines } = DIFFICULTIES[d];
    setGrid(makeGrid(rows, cols));
    setStatus('idle');
    setMinesLeft(mines);
    setTime(0);
    clearInterval(timerRef.current);
  }

  useEffect(() => { newGame(); }, []); // eslint-disable-line

  useEffect(() => {
    if (status === 'playing') {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const handleClick = useCallback((r, c) => {
    if (!grid) return;
    const cell = grid[r][c];
    if (cell.revealed || cell.flagged) return;
    if (status === 'lost' || status === 'won') return;

    const { rows, cols, mines } = DIFFICULTIES[diff];
    let newGrid = grid.map(row => row.map(cell => ({ ...cell })));

    // First click: place mines
    if (status === 'idle') {
      placeMines(newGrid, rows, cols, mines, r, c);
      setStatus('playing');
    }

    if (newGrid[r][c].mine) {
      // Reveal all mines
      for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
        if (newGrid[rr][cc].mine) newGrid[rr][cc].revealed = true;
      }
      newGrid[r][c].exploded = true;
      setGrid(newGrid);
      setStatus('lost');
      return;
    }

    revealBFS(newGrid, rows, cols, r, c);

    // Check win: all non-mine cells revealed
    const won = newGrid.every(row => row.every(cell => cell.mine || cell.revealed));
    setGrid(newGrid);
    if (won) {
      setStatus('won');
      addBalance(20); // +$20 for clearing the board
      const gameId = `minesweeper_${diff}`;
      isHighScore(gameId, time, false).then(yes => { if (yes) { setPendingTime(time); setShowHS(true); } });
    }
  }, [grid, status, diff, time]);

  const handleRightClick = useCallback((e, r, c) => {
    e.preventDefault();
    if (!grid) return;
    const cell = grid[r][c];
    if (cell.revealed || status === 'lost' || status === 'won') return;
    const newGrid = grid.map(row => row.map(c => ({ ...c })));
    newGrid[r][c].flagged = !newGrid[r][c].flagged;
    setMinesLeft(m => m + (newGrid[r][c].flagged ? -1 : 1));
    setGrid(newGrid);
  }, [grid, status]);

  // Chord click: reveal neighbors of revealed number if flags match
  const handleChordClick = useCallback((r, c) => {
    if (!grid) return;
    const cell = grid[r][c];
    if (!cell.revealed || cell.adjacent === 0) return;
    const { rows, cols } = DIFFICULTIES[diff];
    let flagCount = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].flagged) flagCount++;
    }
    if (flagCount !== cell.adjacent) return;
    const newGrid = grid.map(row => row.map(c => ({ ...c })));
    let lost = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nc2 = newGrid[nr][nc];
      if (nc2.flagged || nc2.revealed) continue;
      if (nc2.mine) { nc2.revealed = true; nc2.exploded = true; lost = true; }
      else revealBFS(newGrid, rows, cols, nr, nc);
    }
    if (lost) {
      for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
        if (newGrid[rr][cc].mine) newGrid[rr][cc].revealed = true;
      }
      setGrid(newGrid); setStatus('lost');
    } else {
      const won = newGrid.every(row => row.every(cell => cell.mine || cell.revealed));
      setGrid(newGrid);
      if (won) {
        setStatus('won');
        const gameId = `minesweeper_${diff}`;
        isHighScore(gameId, time, false).then(yes => { if (yes) { setPendingTime(time); setShowHS(true); } });
      }
    }
  }, [grid, diff, time]);

  if (!grid) return null;
  const { rows, cols } = DIFFICULTIES[diff];

  return (
    <div className="ms-page">
      <div className="ms-topbar">
        <button className="ms-back" onClick={onBack}>← Game Vault</button>
        <div className="ms-title">Minesweeper</div>
        <div className="ms-diff-tabs">
          {Object.keys(DIFFICULTIES).map(d => (
            <button key={d} className={`ms-diff-btn ${d === diff ? 'active' : ''}`}
              onClick={() => { setDiff(d); newGame(d); }}>{d}</button>
          ))}
        </div>
      </div>
      <div className="ms-hud">
        <span className="ms-hud-item">💣 {minesLeft}</span>
        <button className="ms-reset" onClick={() => newGame()}>
          {status === 'won' ? '😎' : status === 'lost' ? '😵' : '🙂'}
        </button>
        <span className="ms-hud-item">⏱ {String(time).padStart(3, '0')}</span>
      </div>
      {(status === 'won' || status === 'lost') && (
        <div className={`ms-banner ${status === 'won' ? 'ms-banner--won' : 'ms-banner--lost'}`}>
          {status === 'won' ? '🎉 You Win!' : '💥 Game Over'}
          <button className="ms-replay-btn" onClick={() => newGame()}>Play Again</button>
        </div>
      )}
      <div className="ms-board-wrap" style={{ '--cols': cols }}>
        <div className="ms-board" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {grid.map((row, r) => row.map((cell, c) => {
            let cls = 'ms-cell';
            if (cell.revealed) {
              cls += ' ms-cell--revealed';
              if (cell.mine) cls += cell.exploded ? ' ms-cell--exploded' : ' ms-cell--mine';
            }
            return (
              <div key={`${r}-${c}`} className={cls}
                onClick={() => handleClick(r, c)}
                onContextMenu={e => handleRightClick(e, r, c)}
                onDoubleClick={() => handleChordClick(r, c)}
                onTouchStart={() => handleTouchStart(r, c)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchEnd}>
                {cell.revealed && !cell.mine && cell.adjacent > 0 && (
                  <span style={{ color: NUM_COLORS[cell.adjacent], fontWeight: 800 }}>{cell.adjacent}</span>
                )}
                {cell.revealed && cell.mine && (cell.exploded ? '💥' : '💣')}
                {!cell.revealed && cell.flagged && '🚩'}
              </div>
            );
          }))}
        </div>
      </div>
      {showHS && <HighScoreModal gameId={`minesweeper_${diff}`} score={pendingTime} label="sec" higherIsBetter={false} onSave={() => setShowHS(false)} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
