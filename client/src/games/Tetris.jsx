import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Tetris.css';

const COLS = 10, ROWS = 20, CELL = 30;
const W = COLS * CELL, H = ROWS * CELL;
const PREVIEW_W = 4 * CELL, PREVIEW_H = 4 * CELL;

const PIECES = [
  { shape: [[1,1,1,1]],                              color: '#00bcd4' }, // I
  { shape: [[1,1],[1,1]],                            color: '#ffd600' }, // O
  { shape: [[0,1,0],[1,1,1]],                        color: '#9c27b0' }, // T
  { shape: [[0,1,1],[1,1,0]],                        color: '#4caf50' }, // S
  { shape: [[1,1,0],[0,1,1]],                        color: '#f44336' }, // Z
  { shape: [[1,0,0],[1,1,1]],                        color: '#2196f3' }, // J
  { shape: [[0,0,1],[1,1,1]],                        color: '#ff9800' }, // L
];

// SRS wall kick data for J,L,S,T,Z pieces (non-I)
const KICKS = {
  '0->1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1->0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1->2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2->1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2->3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3->2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3->0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0->3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICKS_I = {
  '0->1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1->0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1->2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2->1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2->3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3->2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3->0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0->3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

function rotate(shape) {
  return shape[0].map((_, c) => shape.map(row => row[c]).reverse());
}

function randPiece() {
  const idx = Math.floor(Math.random() * PIECES.length);
  return { ...PIECES[idx], shape: PIECES[idx].shape.map(r => [...r]), rotation: 0, x: 3, y: 0, idx };
}

function fits(board, piece, dx = 0, dy = 0, shape = piece.shape) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = piece.x + c + dx, ny = piece.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && board[ny][nx]) return false;
    }
  }
  return true;
}

function place(board, piece) {
  const b = board.map(r => [...r]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const ny = piece.y + r, nx = piece.x + c;
      if (ny >= 0) b[ny][nx] = piece.color;
    }
  }
  return b;
}

function clearLines(board) {
  const remaining = board.filter(row => row.some(c => !c));
  const cleared = ROWS - remaining.length;
  const empty = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  return { board: [...empty, ...remaining], cleared };
}

function ghostY(board, piece) {
  let dy = 0;
  while (fits(board, piece, 0, dy + 1)) dy++;
  return piece.y + dy;
}

const SCORES = [0, 40, 100, 300, 1200];
const BEST_KEY = 'tetris_best';

export default function Tetris({ onBack }) {
  const canvasRef    = useRef(null);
  const previewRef   = useRef(null);
  const stateRef     = useRef(null);
  const rafRef       = useRef(null);
  const dropRef      = useRef(null);
  const [display, setDisplay] = useState({
    score: 0, lines: 0, level: 1,
    best: parseInt(localStorage.getItem(BEST_KEY) || '0'),
    running: false, over: false, paused: false,
  });

  function initState() {
    return {
      board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      piece: randPiece(),
      next: randPiece(),
      score: 0, lines: 0, level: 1,
      dropInterval: 800,
      lastDrop: performance.now(),
    };
  }

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    const preview = previewRef.current;
    if (!canvas || !preview) return;
    const ctx = canvas.getContext('2d');
    const pctx = preview.getContext('2d');
    const s = stateRef.current;
    if (!s) return;

    // Board background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(W,r*CELL); ctx.stroke(); }

    // Placed blocks
    s.board.forEach((row, r) => row.forEach((color, c) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, CELL-2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(c*CELL+1, r*CELL+1, CELL-2, 4);
    }));

    // Ghost piece
    const gy = ghostY(s.board, s.piece);
    s.piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const py = gy + r, px = s.piece.x + c;
      if (py < 0) return;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px*CELL+1, py*CELL+1, CELL-2, CELL-2);
    }));

    // Active piece
    s.piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      const py = s.piece.y + r, px = s.piece.x + c;
      if (py < 0) return;
      ctx.fillStyle = s.piece.color;
      ctx.fillRect(px*CELL+1, py*CELL+1, CELL-2, CELL-2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(px*CELL+1, py*CELL+1, CELL-2, 4);
    }));

    // Preview
    pctx.fillStyle = '#1a1a2e';
    pctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
    const nx = s.next;
    const offX = Math.floor((4 - nx.shape[0].length) / 2);
    const offY = Math.floor((4 - nx.shape.length) / 2);
    nx.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      pctx.fillStyle = nx.color;
      pctx.fillRect((offX+c)*CELL+1, (offY+r)*CELL+1, CELL-2, CELL-2);
    }));
  }, []);

  const tryRotate = useCallback((s, dir) => {
    let sh = s.piece.shape;
    const times = ((dir % 4) + 4) % 4;
    for (let i = 0; i < times; i++) sh = rotate(sh);

    const newRot = ((s.piece.rotation || 0) + dir * 1 + 4) % 4;
    const key = `${s.piece.rotation}->${ newRot}`;
    const kicks = s.piece.idx === 0 ? KICKS_I[key] : KICKS[key];
    if (!kicks) return;

    for (const [kc, kr] of kicks) {
      if (fits(s.board, s.piece, kc, kr, sh)) {
        s.piece = { ...s.piece, shape: sh, rotation: newRot, x: s.piece.x + kc, y: s.piece.y + kr };
        return;
      }
    }
  }, []);

  const loop = useCallback((now) => {
    const s = stateRef.current;
    if (!s) return;
    if (now - s.lastDrop >= s.dropInterval) {
      s.lastDrop = now;
      if (fits(s.board, s.piece, 0, 1)) {
        s.piece.y++;
      } else {
        // Lock piece
        const newBoard = place(s.board, s.piece);
        const { board: cleared, cleared: lines } = clearLines(newBoard);
        s.board = cleared;
        s.score += SCORES[lines] * s.level;
        s.lines += lines;
        s.level = Math.floor(s.lines / 10) + 1;
        s.dropInterval = Math.max(100, 800 - (s.level - 1) * 70);
        s.piece = s.next;
        s.next = randPiece();
        setDisplay(d => {
          const ns = s.score;
          const best = Math.max(d.best, ns);
          localStorage.setItem(BEST_KEY, String(best));
          return { ...d, score: ns, lines: s.lines, level: s.level, best };
        });
        // Game over check
        if (!fits(s.board, s.piece)) {
          setDisplay(d => ({ ...d, running: false, over: true }));
          return;
        }
      }
    }
    drawBoard();
    rafRef.current = requestAnimationFrame(loop);
  }, [drawBoard]);

  function start() {
    cancelAnimationFrame(rafRef.current);
    stateRef.current = initState();
    setDisplay(d => ({ ...d, score: 0, lines: 0, level: 1, running: true, over: false, paused: false }));
    rafRef.current = requestAnimationFrame(loop);
  }

  function pause() {
    setDisplay(d => {
      if (d.paused) {
        rafRef.current = requestAnimationFrame(loop);
        return { ...d, paused: false };
      } else {
        cancelAnimationFrame(rafRef.current);
        return { ...d, paused: true };
      }
    });
  }

  useEffect(() => {
    drawBoard();
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [drawBoard]);

  useEffect(() => {
    function handleKey(e) {
      const s = stateRef.current;
      if (!s) return;
      if (display.over) return;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); if (fits(s.board, s.piece, -1)) s.piece.x--; break;
        case 'ArrowRight': e.preventDefault(); if (fits(s.board, s.piece,  1)) s.piece.x++; break;
        case 'ArrowDown':  e.preventDefault();
          if (fits(s.board, s.piece, 0, 1)) { s.piece.y++; s.score += 1; }
          break;
        case 'ArrowUp': case 'x':
          e.preventDefault(); tryRotate(s, 1); break;
        case 'z':
          e.preventDefault(); tryRotate(s, -1); break;
        case ' ': {
          e.preventDefault();
          const dy = ghostY(s.board, s.piece) - s.piece.y;
          s.piece.y += dy;
          s.score += dy * 2;
          s.lastDrop = -Infinity; // force lock next frame
          break;
        }
        case 'p': case 'Escape':
          pause(); break;
        default: break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [display.over, display.paused, tryRotate]);

  return (
    <div className="tetris-page">
      <div className="tetris-topbar">
        <button className="tetris-back" onClick={onBack}>← Back</button>
        <div className="tetris-title">Tetris</div>
      </div>
      <div className="tetris-layout">
        <div className="tetris-main">
          <canvas ref={canvasRef} width={W} height={H} className="tetris-canvas" />
          {!display.running && (
            <div className="tetris-overlay">
              {display.over && <div className="tetris-over">Game Over</div>}
              <button className="tetris-start-btn" onClick={start}>{display.over ? 'Play Again' : 'Start'}</button>
              {!display.over && <div className="tetris-hint">Arrow keys · Space=hard drop · P=pause</div>}
            </div>
          )}
          {display.running && display.paused && (
            <div className="tetris-overlay">
              <div className="tetris-paused">PAUSED</div>
              <button className="tetris-start-btn" onClick={pause}>Resume</button>
            </div>
          )}
        </div>
        <div className="tetris-sidebar">
          <div className="tetris-panel">
            <div className="tetris-panel-label">NEXT</div>
            <canvas ref={previewRef} width={PREVIEW_W} height={PREVIEW_H} className="tetris-preview" />
          </div>
          <div className="tetris-panel">
            <div className="tetris-panel-label">SCORE</div>
            <div className="tetris-panel-val">{display.score}</div>
          </div>
          <div className="tetris-panel">
            <div className="tetris-panel-label">BEST</div>
            <div className="tetris-panel-val">{display.best}</div>
          </div>
          <div className="tetris-panel">
            <div className="tetris-panel-label">LEVEL</div>
            <div className="tetris-panel-val">{display.level}</div>
          </div>
          <div className="tetris-panel">
            <div className="tetris-panel-label">LINES</div>
            <div className="tetris-panel-val">{display.lines}</div>
          </div>
          {display.running && (
            <button className="tetris-pause-btn" onClick={pause}>{display.paused ? 'Resume' : 'Pause'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
