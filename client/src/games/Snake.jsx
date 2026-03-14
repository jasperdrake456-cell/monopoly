import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Snake.css';

const COLS = 20, ROWS = 20, CELL = 22;
const W = COLS * CELL, H = ROWS * CELL;
const INITIAL_SPEED = 150;

function randFood(snake) {
  while (true) {
    const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some(s => s.x === f.x && s.y === f.y)) return f;
  }
}

const BEST_KEY = 'snake_best';

export default function Snake({ onBack }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef(null);
  const timerRef  = useRef(null);
  const [display, setDisplay] = useState({ score: 0, best: parseInt(localStorage.getItem(BEST_KEY) || '0'), running: false, over: false });

  function initState() {
    const snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    return {
      snake,
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      food: randFood(snake),
      score: 0,
      speed: INITIAL_SPEED,
      foodCount: 0,
    };
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;
    if (!s) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke();
    }

    // Food
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Snake body
    s.snake.forEach((seg, i) => {
      const isHead = i === 0;
      const t = 1 - i / s.snake.length;
      ctx.fillStyle = isHead ? '#2ecc71' : `hsl(${130 + i * 2}, 70%, ${35 + t * 20}%)`;
      const pad = isHead ? 1 : 2;
      const r = isHead ? 5 : 3;
      const x = seg.x * CELL + pad, y = seg.y * CELL + pad;
      const size = CELL - pad * 2;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, r);
      ctx.fill();
    });
  }, []);

  const tick = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.dir = s.nextDir;
    const head = { x: (s.snake[0].x + s.dir.x + COLS) % COLS, y: (s.snake[0].y + s.dir.y + ROWS) % ROWS };

    // Self collision
    if (s.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      clearInterval(timerRef.current);
      const best = Math.max(s.score, parseInt(localStorage.getItem(BEST_KEY) || '0'));
      localStorage.setItem(BEST_KEY, String(best));
      setDisplay({ score: s.score, best, running: false, over: true });
      return;
    }

    const ate = head.x === s.food.x && head.y === s.food.y;
    s.snake.unshift(head);
    if (!ate) s.snake.pop();
    else {
      s.score++;
      s.foodCount++;
      s.food = randFood(s.snake);
      if (s.foodCount % 5 === 0 && s.speed > 60) {
        s.speed = Math.max(60, s.speed - 15);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(tick, s.speed);
      }
      setDisplay(d => ({ ...d, score: s.score }));
    }

    draw();
  }, [draw]);

  function start() {
    clearInterval(timerRef.current);
    stateRef.current = initState();
    setDisplay(d => ({ ...d, score: 0, running: true, over: false }));
    draw();
    timerRef.current = setInterval(tick, INITIAL_SPEED);
  }

  useEffect(() => {
    draw();
    return () => clearInterval(timerRef.current);
  }, [draw]);

  useEffect(() => {
    function handleKey(e) {
      const s = stateRef.current;
      if (!s) return;
      const { x, y } = s.dir;
      if (e.key === 'ArrowUp'    || e.key === 'w') { if (y !== 1)  s.nextDir = { x: 0, y: -1 }; }
      if (e.key === 'ArrowDown'  || e.key === 's') { if (y !== -1) s.nextDir = { x: 0, y:  1 }; }
      if (e.key === 'ArrowLeft'  || e.key === 'a') { if (x !== 1)  s.nextDir = { x: -1, y: 0 }; }
      if (e.key === 'ArrowRight' || e.key === 'd') { if (x !== -1) s.nextDir = { x:  1, y: 0 }; }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Touch swipe
  useEffect(() => {
    let sx = 0, sy = 0;
    function ts(e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    function te(e) {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const s = stateRef.current;
      if (!s || (Math.abs(dx) < 20 && Math.abs(dy) < 20)) return;
      const { x, y } = s.dir;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0 && x !== -1) s.nextDir = { x: 1, y: 0 };
        if (dx < 0 && x !== 1)  s.nextDir = { x: -1, y: 0 };
      } else {
        if (dy > 0 && y !== -1) s.nextDir = { x: 0, y: 1 };
        if (dy < 0 && y !== 1)  s.nextDir = { x: 0, y: -1 };
      }
    }
    window.addEventListener('touchstart', ts, { passive: true });
    window.addEventListener('touchend', te, { passive: true });
    return () => { window.removeEventListener('touchstart', ts); window.removeEventListener('touchend', te); };
  }, []);

  return (
    <div className="snake-page">
      <div className="snake-topbar">
        <button className="snake-back" onClick={onBack}>← Back</button>
        <div className="snake-title">Snake</div>
        <div className="snake-scores">
          <div className="snake-score-box"><span className="snake-slabel">SCORE</span><span className="snake-sval">{display.score}</span></div>
          <div className="snake-score-box"><span className="snake-slabel">BEST</span><span className="snake-sval">{display.best}</span></div>
        </div>
      </div>
      <div className="snake-area">
        <canvas ref={canvasRef} width={W} height={H} className="snake-canvas" />
        {!display.running && (
          <div className="snake-overlay">
            {display.over && <div className="snake-over-msg">Game Over — Score: {display.score}</div>}
            <button className="snake-start-btn" onClick={start}>{display.over ? 'Play Again' : 'Start Game'}</button>
            <div className="snake-hint">Arrow keys or WASD to move</div>
          </div>
        )}
      </div>
    </div>
  );
}
