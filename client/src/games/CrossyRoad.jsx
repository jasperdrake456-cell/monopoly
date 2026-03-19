import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CrossyRoad.css';

// ── Constants ────────────────────────────────────────────────────────────────
const COLS       = 11;
const CENTER_COL = 5;
const CELL       = 64;
const VIEW_ROWS  = 13;
const BOARD_W    = COLS * CELL;        // 704
const BOARD_H    = VIEW_ROWS * CELL;   // 832
const INIT_LIVES = 3;
const IDLE_LIMIT = 5.5;
const TRAIN_SPD  = 440;
const WORLD_PAD  = 35;

// Car definitions [emoji, width in cols]
const CARS = [
  ['🚗', 1], ['🚙', 1], ['🚕', 1],
  ['🚐', 2], ['🚌', 2], ['🚛', 2],
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const rnd    = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const choose = arr => arr[Math.floor(Math.random() * arr.length)];
const getHS  = ()   => parseInt(localStorage.getItem('crossy_arcade_hs') || '0');
const saveHS = n    => localStorage.setItem('crossy_arcade_hs', String(n));

// ── Row generators ───────────────────────────────────────────────────────────
function makeGrassRow(idx, safe = false) {
  const trees = [];
  if (!safe) {
    for (let c = 0; c < COLS; c++) {
      if (c !== CENTER_COL && Math.random() < 0.16) trees.push(c);
    }
    const leftOpen  = [0,1,2,3,4].filter(c => !trees.includes(c));
    const rightOpen = [6,7,8,9,10].filter(c => !trees.includes(c));
    if (leftOpen.length  === 0 && trees.length > 0) trees.splice(trees.findIndex(c => c < CENTER_COL), 1);
    if (rightOpen.length === 0 && trees.length > 0) trees.splice(trees.findIndex(c => c > CENTER_COL), 1);
  }
  return { idx, type: 'grass', trees };
}

function makeRoadRow(idx, diff) {
  const dir   = Math.random() < 0.5 ? 1 : -1;
  const speed = dir * (62 + diff * 10 + rnd(-12, 12));
  const count = Math.min(5, 2 + Math.floor(diff / 4));
  const gap   = BOARD_W / count;
  const cars  = Array.from({ length: count }, (_, i) => {
    const [emoji, w] = choose(CARS);
    return { id: `${idx}_${i}`, x: gap * i + rnd(0, gap * 0.5), w, speed, emoji };
  });
  return { idx, type: 'road', cars };
}

function makeRiverRow(idx, diff) {
  const dir   = Math.random() < 0.5 ? 1 : -1;
  const speed = dir * (38 + diff * 6 + rnd(-8, 8));
  const count = rndInt(2, 3);
  const gap   = BOARD_W / count;
  const logs  = Array.from({ length: count }, (_, i) => ({
    id: `${idx}_${i}`,
    x:  gap * i + rnd(0, gap * 0.25),
    w:  rndInt(2, 3),
    speed,
  }));
  return { idx, type: 'river', logs };
}

function makeRailRow(idx) {
  return {
    idx, type: 'railroad',
    train: { x: 0, active: false, nextIn: rnd(4000, 8000), dir: 1, w: 8 },
  };
}

function generateChunk(startIdx, count, diff) {
  const rows = [];
  let i = startIdx;
  if (startIdx === 0) {
    rows.push(makeGrassRow(i++, true));
    rows.push(makeGrassRow(i++, true));
    rows.push(makeGrassRow(i++, true));
  }
  while (rows.length < count) {
    const r   = Math.random();
    const len = rndInt(1, 3);
    if      (r < 0.20) for (let k = 0; k < len; k++) rows.push(makeGrassRow(i++));
    else if (r < 0.52) for (let k = 0; k < len; k++) rows.push(makeRoadRow(i++, diff));
    else if (r < 0.80) for (let k = 0; k < len; k++) rows.push(makeRiverRow(i++, diff));
    else               rows.push(makeRailRow(i++));
  }
  return rows;
}

function makeEntState(row) {
  if (row.type === 'road')     return { cars:  row.cars.map(c => ({ ...c })) };
  if (row.type === 'river')    return { logs:  row.logs.map(l => ({ ...l })) };
  if (row.type === 'railroad') return { train: { ...row.train } };
  return {};
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CrossyRoad() {
  const [phase,     setPhase]     = useState('menu');
  const [,          setTick]      = useState(0);
  const [highScore, setHighScore] = useState(getHS);
  const forceRender = useCallback(() => setTick(t => t + 1), []);

  const G        = useRef(null);
  const phaseRef = useRef('menu');
  const rafRef   = useRef(null);
  const lastTs   = useRef(null);
  const touchRef = useRef(null);
  const hopKey   = useRef(0);

  // ── Init ─────────────────────────────────────────────────────────────────
  function startGame() {
    const rows = generateChunk(0, WORLD_PAD, 0);
    const entities = {};
    const rowMap = new Map();
    rows.forEach(r => { entities[r.idx] = makeEntState(r); rowMap.set(r.idx, r); });
    G.current = {
      score: 0, lives: INIT_LIVES,
      col: CENTER_COL, row: 0, pxX: CENTER_COL * CELL,
      rows, rowMap, entities,
      idleTimer: 0, deathFlash: 0,
    };
    phaseRef.current = 'playing';
    lastTs.current   = null;
    setPhase('playing');
    forceRender();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function loop(ts) {
      rafRef.current = requestAnimationFrame(loop);
      if (phaseRef.current !== 'playing' || !G.current) return;
      if (!lastTs.current) { lastTs.current = ts; return; }
      const dt = Math.min((ts - lastTs.current) / 1000, 0.05);
      lastTs.current = ts;

      const g = G.current;

      // Move entities
      g.rows.forEach(row => {
        const ent = g.entities[row.idx];
        if (!ent) return;

        if (row.type === 'road') {
          ent.cars.forEach(car => {
            car.x += car.speed * dt;
            const cw = car.w * CELL;
            if (car.speed > 0 && car.x > BOARD_W + cw)  car.x -= BOARD_W + cw * 2;
            if (car.speed < 0 && car.x + cw < -cw)       car.x += BOARD_W + cw * 2;
          });
        }
        if (row.type === 'river') {
          ent.logs.forEach(log => {
            log.x += log.speed * dt;
            const lw = log.w * CELL;
            if (log.speed > 0 && log.x > BOARD_W + lw)  log.x -= BOARD_W + lw * 2;
            if (log.speed < 0 && log.x + lw < -lw)       log.x += BOARD_W + lw * 2;
          });
        }
        if (row.type === 'railroad') {
          const tr = ent.train;
          if (tr.active) {
            tr.x += (tr.dir > 0 ? TRAIN_SPD : -TRAIN_SPD) * dt;
            if (tr.dir > 0 && tr.x > BOARD_W + 80)          { tr.active = false; tr.nextIn = rnd(3500, 7000); }
            if (tr.dir < 0 && tr.x + tr.w * CELL < -80)     { tr.active = false; tr.nextIn = rnd(3500, 7000); }
          } else {
            tr.nextIn -= dt * 1000;
            if (tr.nextIn <= 0) {
              tr.active = true;
              tr.dir    = Math.random() < 0.5 ? 1 : -1;
              tr.x      = tr.dir > 0 ? -(tr.w * CELL + 20) : BOARD_W + 20;
            }
          }
        }
      });

      // River log drift
      const curRow = g.rowMap.get(g.row);
      if (curRow?.type === 'river') {
        const ent    = g.entities[g.row];
        const center = g.pxX + CELL / 2;
        const log    = ent?.logs?.find(l => center >= l.x && center <= l.x + l.w * CELL);
        if (log) {
          g.pxX = Math.max(0, Math.min(BOARD_W - CELL, g.pxX + log.speed * dt));
          g.col = Math.round(g.pxX / CELL);
        }
      }

      // Collision
      const hit = detectHit(g);
      if (hit) { die(g, hit); return; }

      // Idle eagle
      g.idleTimer += dt;
      if (g.idleTimer >= IDLE_LIMIT) { die(g, 'eagle'); return; }

      if (g.deathFlash > 0) g.deathFlash -= dt;

      // Expand world ahead
      const maxIdx = g.rows[g.rows.length - 1]?.idx ?? 0;
      if (g.row + WORLD_PAD > maxIdx) {
        const newRows = generateChunk(maxIdx + 1, 20, Math.floor(g.score / 8));
        newRows.forEach(r => {
          g.rows.push(r);
          g.rowMap.set(r.idx, r);
          g.entities[r.idx] = makeEntState(r);
        });
        // Prune old rows
        const cutoff = g.row - 14;
        g.rows = g.rows.filter(r => {
          if (r.idx < cutoff) { g.rowMap.delete(r.idx); delete g.entities[r.idx]; return false; }
          return true;
        });
      }

      forceRender();
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [forceRender]);

  // ── Collision ─────────────────────────────────────────────────────────────
  function detectHit(g) {
    if (g.col < 0 || g.col >= COLS) return 'water';
    const row = g.rowMap.get(g.row);
    if (!row) return null;
    const ent    = g.entities[g.row] || {};
    const center = g.pxX + CELL / 2;

    if (row.type === 'road') {
      for (const car of ent.cars || []) {
        if (center > car.x + 4 && center < car.x + car.w * CELL - 4) return 'car';
      }
    }
    if (row.type === 'river') {
      const onLog = (ent.logs || []).some(l => center >= l.x && center <= l.x + l.w * CELL);
      if (!onLog) return 'water';
    }
    if (row.type === 'railroad' && ent.train?.active) {
      const tr = ent.train;
      if (center >= tr.x && center <= tr.x + tr.w * CELL) return 'train';
    }
    return null;
  }

  // ── Die ───────────────────────────────────────────────────────────────────
  function die(g) {
    g.lives--;
    g.idleTimer  = 0;
    g.deathFlash = 0.6;

    const hs = Math.max(g.score, getHS());
    saveHS(hs);
    setHighScore(hs);

    if (g.lives <= 0) {
      phaseRef.current = 'gameover';
      setPhase('gameover');
    } else {
      for (let r = g.row; r >= 0; r--) {
        if (g.rowMap.get(r)?.type === 'grass') { g.row = r; break; }
        if (r === 0) g.row = 0;
      }
      g.col = CENTER_COL;
      g.pxX = CENTER_COL * CELL;
    }
    forceRender();
  }

  // ── Hop ───────────────────────────────────────────────────────────────────
  const hop = useCallback((dir) => {
    if (phaseRef.current !== 'playing' || !G.current) return;
    const g = G.current;
    let newCol = g.col;
    let newRow = g.row;
    if (dir === 'up')    newRow++;
    if (dir === 'down')  newRow = Math.max(0, newRow - 1);
    if (dir === 'left')  newCol = Math.max(0, newCol - 1);
    if (dir === 'right') newCol = Math.min(COLS - 1, newCol + 1);

    const targetRow = g.rowMap.get(newRow);
    if (targetRow?.type === 'grass' && targetRow.trees.includes(newCol)) return;

    g.col = newCol;
    g.row = newRow;
    g.pxX = newCol * CELL;
    g.idleTimer = 0;
    if (newRow > g.score) g.score = newRow;
    hopKey.current++;
    forceRender();
  }, [forceRender]);

  // Keyboard
  useEffect(() => {
    const onKey = e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') hop('up');
      if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') hop('down');
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') hop('left');
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') hop('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hop]);

  // Touch
  useEffect(() => {
    const onStart = e => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const onEnd   = e => {
      if (!touchRef.current) return;
      const dx = e.changedTouches[0].clientX - touchRef.current.x;
      const dy = e.changedTouches[0].clientY - touchRef.current.y;
      touchRef.current = null;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { hop('up'); return; }
      Math.abs(dx) > Math.abs(dy) ? hop(dx > 0 ? 'right' : 'left') : hop(dy > 0 ? 'down' : 'up');
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [hop]);

  // ── Render: Menu ─────────────────────────────────────────────────────────
  if (phase === 'menu') {
    return (
      <div className="cr-wrap cr-menu-screen">
        <div className="cr-menu-chicken">🐔</div>
        <h1 className="cr-menu-title">Crossy Road</h1>
        <p className="cr-menu-sub">How far can you go?</p>
        <div className="cr-menu-hs">🏆 Best: {highScore}</div>
        <button className="cr-menu-play" onClick={startGame}>▶ Play</button>
        <div className="cr-menu-keys">
          <span>Arrow keys / WASD to move</span>
          <span>Tap / swipe on mobile</span>
        </div>
      </div>
    );
  }

  // ── Render: Game ─────────────────────────────────────────────────────────
  const g = G.current;
  if (!g) return null;

  const camBottom = Math.max(0, g.row - 2);
  const camTop    = camBottom + VIEW_ROWS - 1;

  const visRows = [];
  for (let r = camTop; r >= camBottom; r--) {
    visRows.push(g.rowMap.get(r) || { idx: r, type: 'grass', trees: [] });
  }

  const playerTop  = (camTop - g.row) * CELL;
  const playerLeft = g.pxX;
  const idleFrac   = Math.min(1, g.idleTimer / IDLE_LIMIT);

  return (
    <div className="cr-wrap">
      {/* HUD */}
      <div className="cr-hud">
        <span className="cr-hud-score">🏆 {g.score}</span>
        <div className="cr-hud-lives">
          {Array.from({ length: INIT_LIVES }, (_, i) => (
            <span key={i} className={i < g.lives ? 'cr-heart' : 'cr-heart cr-heart-lost'}>❤️</span>
          ))}
        </div>
        <span className="cr-hud-hs">Best {highScore}</span>
      </div>

      {/* Eagle warning */}
      {idleFrac > 0.55 && (
        <div className="cr-eagle" style={{ opacity: (idleFrac - 0.55) / 0.45 }}>
          🦅 MOVE!
        </div>
      )}

      {/* Board */}
      <div className="cr-board" style={{ width: BOARD_W, height: BOARD_H }}>
        {visRows.map(row => {
          const ent        = g.entities[row.idx] || {};
          const isRailWarn = row.type === 'railroad' && !ent.train?.active && (ent.train?.nextIn ?? 9999) < 1800;

          return (
            <div
              key={row.idx}
              className={[
                'cr-row',
                `cr-row-${row.type}`,
                isRailWarn ? 'cr-row-rail-warn' : '',
              ].filter(Boolean).join(' ')}
              style={{ height: CELL }}
            >
              {/* Trees */}
              {row.type === 'grass' && row.trees.map(col => (
                <div key={col} className="cr-tree" style={{ left: col * CELL }}>🌲</div>
              ))}

              {/* Road dash */}
              {row.type === 'road' && <div className="cr-road-dash" />}

              {/* Railroad */}
              {row.type === 'railroad' && (
                <>
                  <div className="cr-rail cr-rail-t" />
                  <div className="cr-rail cr-rail-b" />
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className="cr-sleeper" style={{ left: `${(i / 11) * 100}%` }} />
                  ))}
                </>
              )}

              {/* River water */}
              {row.type === 'river' && <div className="cr-water" />}

              {/* Cars */}
              {(ent.cars || []).map(car => (
                <div
                  key={car.id}
                  className={`cr-car ${car.speed < 0 ? 'cr-car-flip' : ''}`}
                  style={{ left: car.x, width: car.w * CELL - 6 }}
                >
                  <span>{car.emoji}</span>
                </div>
              ))}

              {/* Logs */}
              {(ent.logs || []).map(log => (
                <div
                  key={log.id}
                  className="cr-log"
                  style={{ left: log.x, width: log.w * CELL - 6 }}
                />
              ))}

              {/* Train */}
              {row.type === 'railroad' && ent.train?.active && (
                <div
                  className={`cr-train ${ent.train.dir < 0 ? 'cr-train-flip' : ''}`}
                  style={{ left: ent.train.x, width: ent.train.w * CELL }}
                >
                  🚂
                </div>
              )}
            </div>
          );
        })}

        {/* Player */}
        <div
          key={`player-${hopKey.current}`}
          className={`cr-player ${g.deathFlash > 0 ? 'cr-player-hit' : ''}`}
          style={{ left: playerLeft, top: playerTop }}
        >
          🐔
        </div>
      </div>

      {/* D-pad */}
      <div className="cr-dpad">
        <button className="cr-dpad-btn cr-dpad-up"    onClick={() => hop('up')}>▲</button>
        <div className="cr-dpad-mid">
          <button className="cr-dpad-btn cr-dpad-left"  onClick={() => hop('left')}>◀</button>
          <button className="cr-dpad-btn cr-dpad-c"     onClick={() => hop('up')}>🐔</button>
          <button className="cr-dpad-btn cr-dpad-right" onClick={() => hop('right')}>▶</button>
        </div>
        <button className="cr-dpad-btn cr-dpad-down"  onClick={() => hop('down')}>▼</button>
      </div>

      {/* Game Over */}
      {phase === 'gameover' && (
        <div className="cr-overlay">
          <div className="cr-go-icon">💀</div>
          <div className="cr-go-title">Game Over</div>
          <div className="cr-go-score">Score: {g.score}</div>
          <div className="cr-go-hs">Best: {highScore}</div>
          <button className="cr-menu-play" onClick={startGame}>▶ Play Again</button>
          <button className="cr-go-menu" onClick={() => { phaseRef.current = 'menu'; setPhase('menu'); }}>
            Menu
          </button>
        </div>
      )}
    </div>
  );
}
