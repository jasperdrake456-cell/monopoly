import React, { useEffect, useRef, useState, useCallback } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore } from '../utils/leaderboard';
import './SpaceInvaders.css';
import useGameActivity from '../hooks/useGameActivity';

const W = 560, H = 640;
const PLAYER_W = 40, PLAYER_H = 24, PLAYER_Y = H - 60;
const BULLET_W = 3, BULLET_H = 12;
const ALIEN_COLS = 11, ALIEN_ROWS = 5;
const ALIEN_W = 30, ALIEN_H = 22, ALIEN_GAP_X = 14, ALIEN_GAP_Y = 14;
const ALIEN_STEP_X = 10, ALIEN_STEP_DOWN = 16;
const ALIEN_PTS = [30, 20, 20, 10, 10]; // by row index
const SHIELD_COLS = 12, SHIELD_ROWS = 6;
const SHIELD_CELL = 5;
const SHIELD_W = SHIELD_COLS * SHIELD_CELL;
const SHIELD_H = SHIELD_ROWS * SHIELD_CELL;

function makeAliens() {
  const aliens = [];
  const startX = (W - ALIEN_COLS * (ALIEN_W + ALIEN_GAP_X) + ALIEN_GAP_X) / 2;
  for (let r = 0; r < ALIEN_ROWS; r++) {
    for (let c = 0; c < ALIEN_COLS; c++) {
      aliens.push({
        x: startX + c * (ALIEN_W + ALIEN_GAP_X),
        y: 80 + r * (ALIEN_H + ALIEN_GAP_Y),
        row: r, col: c, alive: true, frame: 0,
      });
    }
  }
  return aliens;
}

function makeShields() {
  const positions = [80, 180, 300, 400];
  return positions.map(sx => {
    const cells = Array.from({ length: SHIELD_ROWS }, (_, r) =>
      Array.from({ length: SHIELD_COLS }, (_, c) => {
        // Arch cutout at bottom center
        if (r >= 4 && c >= 4 && c <= 7) return false;
        return true;
      })
    );
    return { x: sx, y: PLAYER_Y - 80, cells };
  });
}

function initState(wave = 1) {
  return {
    player: { x: W / 2 - PLAYER_W / 2 },
    playerBullets: [],
    alienBullets: [],
    aliens: makeAliens(),
    shields: makeShields(),
    score: 0,
    lives: 3,
    wave,
    alienDir: 1,
    alienOffsetX: 0,
    alienMoveTimer: 0,
    alienMoveInterval: Math.max(200, 800 - (wave - 1) * 80),
    alienShootTimer: 0,
    alienShootInterval: Math.max(600, 1800 - (wave - 1) * 150),
    playerSpeed: 4,
    gamePhase: 'playing', // playing | dead | won | gameover
    deathTimer: 0,
    ufoX: -50, ufoActive: false, ufoTimer: 0,
    keys: {},
  };
}

function drawAlien(ctx, x, y, row, frame) {
  const color = row === 0 ? '#ff6b9d' : row <= 2 ? '#a29bfe' : '#55efc4';
  ctx.fillStyle = color;
  if (row === 0) {
    // Squid
    const pts = frame === 0
      ? [[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[0,2],[1,2],[2,2],[4,2],[5,2],[7,2],[8,2],[9,2],[0,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[9,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[2,5],[7,5],[1,6],[2,6],[7,6],[8,6]]
      : [[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[0,2],[1,2],[2,2],[4,2],[5,2],[7,2],[8,2],[9,2],[0,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[9,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[1,5],[3,5],[6,5],[8,5]];
    for (const [px, py] of pts) ctx.fillRect(x + px * 3, y + py * 2.5, 3, 2.5);
  } else if (row <= 2) {
    // Crab
    const pts = frame === 0
      ? [[0,0],[1,0],[3,0],[4,0],[5,0],[6,0],[8,0],[9,0],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[1,3],[4,3],[5,3],[8,3],[0,4],[1,4],[8,4],[9,4]]
      : [[0,0],[1,0],[3,0],[4,0],[5,0],[6,0],[8,0],[9,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[0,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[9,2],[2,3],[3,3],[6,3],[7,3],[1,4],[2,4],[7,4],[8,4]];
    for (const [px, py] of pts) ctx.fillRect(x + px * 3, y + py * 2.5, 3, 2.5);
  } else {
    // Octopus
    const pts = frame === 0
      ? [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[0,2],[1,2],[3,2],[4,2],[5,2],[6,2],[8,2],[9,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[1,4],[4,4],[5,4],[8,4],[2,5],[3,5],[6,5],[7,5]]
      : [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[0,2],[1,2],[3,2],[4,2],[5,2],[6,2],[8,2],[9,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[0,4],[2,4],[3,4],[6,4],[7,4],[9,4]];
    for (const [px, py] of pts) ctx.fillRect(x + px * 3, y + py * 2.5, 3, 2.5);
  }
}

function drawPlayer(ctx, x) {
  ctx.fillStyle = '#2ecc71';
  // Body
  ctx.fillRect(x + 6, PLAYER_Y + 8, PLAYER_W - 12, PLAYER_H - 8);
  // Cannon
  ctx.fillRect(x + PLAYER_W / 2 - 3, PLAYER_Y, 6, 10);
  // Wings
  ctx.fillRect(x, PLAYER_Y + 14, 8, PLAYER_H - 14);
  ctx.fillRect(x + PLAYER_W - 8, PLAYER_Y + 14, 8, PLAYER_H - 14);
}

export default function SpaceInvaders({ onBack }) {
  useGameActivity('space-invaders');
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef(0);
  const [display, setDisplay] = useState({ score: 0, lives: 3, wave: 1, phase: 'idle', best: parseInt(localStorage.getItem('si_best') || '0') });
  const [showHS, setShowHS] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const st = stateRef.current;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!st) {
      // Stars background
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 60; i++) {
        ctx.fillRect(((i * 137 + 31) % W), ((i * 97 + 13) % H), 1, 1);
      }
      return;
    }

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(((i * 137 + 31) % W), ((i * 97 + 13) % H), 1, 1);
    }

    // Ground line
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(0, H - 30, W, 2);

    // Shields
    for (const sh of st.shields) {
      ctx.fillStyle = '#2ecc71';
      for (let r = 0; r < SHIELD_ROWS; r++) {
        for (let c = 0; c < SHIELD_COLS; c++) {
          if (sh.cells[r][c]) {
            ctx.fillRect(sh.x + c * SHIELD_CELL, sh.y + r * SHIELD_CELL, SHIELD_CELL - 1, SHIELD_CELL - 1);
          }
        }
      }
    }

    // Aliens
    for (const a of st.aliens) {
      if (!a.alive) continue;
      drawAlien(ctx, a.x + st.alienOffsetX, a.y, a.row, a.frame);
    }

    // UFO
    if (st.ufoActive) {
      ctx.fillStyle = '#e17055';
      ctx.beginPath();
      ctx.ellipse(st.ufoX + 25, 50, 25, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(st.ufoX + 25, 44, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player bullets
    ctx.fillStyle = '#ffd700';
    for (const b of st.playerBullets) ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);

    // Alien bullets
    ctx.fillStyle = '#ff6b6b';
    for (const b of st.alienBullets) {
      // Zigzag bullet shape
      ctx.fillRect(b.x, b.y, 3, 4);
      ctx.fillRect(b.x + 2, b.y + 4, 3, 4);
      ctx.fillRect(b.x, b.y + 8, 3, 4);
    }

    // Player
    if (st.gamePhase !== 'dead' || Math.floor(st.deathTimer / 8) % 2 === 0) {
      drawPlayer(ctx, st.player.x);
    }

    // Lives display
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`LIVES:`, 10, H - 10);
    for (let i = 0; i < st.lives; i++) {
      const lx = 70 + i * 32;
      ctx.fillRect(lx + 6, H - 25, 14, 12);
      ctx.fillRect(lx + 4, H - 18, 18, 6);
      ctx.fillRect(lx + 9, H - 28, 8, 8);
    }

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SCORE: ${st.score}`, W / 2 - 50, H - 10);
    ctx.fillText(`WAVE: ${st.wave}`, W - 80, H - 10);
  }, []);

  const loop = useCallback((now) => {
    const dt = now - lastRef.current;
    lastRef.current = now;
    const st = stateRef.current;
    if (!st) { rafRef.current = requestAnimationFrame(loop); return; }

    if (st.gamePhase === 'dead') {
      st.deathTimer++;
      if (st.deathTimer > 60) {
        if (st.lives <= 0) { st.gamePhase = 'gameover'; setDisplay(d => { if (d.score > 0) isHighScore('space_invaders', d.score).then(yes => { if (yes) { setPendingScore(d.score); setShowHS(true); } }); return { ...d, phase: 'gameover' }; }); }
        else { st.gamePhase = 'playing'; st.deathTimer = 0; }
      }
      draw(); rafRef.current = requestAnimationFrame(loop); return;
    }

    if (st.gamePhase !== 'playing') { draw(); return; }

    // Player movement
    const spd = st.playerSpeed;
    if (st.keys['ArrowLeft'] || st.keys['a'] || st.keys['A']) st.player.x = Math.max(0, st.player.x - spd);
    if (st.keys['ArrowRight'] || st.keys['d'] || st.keys['D']) st.player.x = Math.min(W - PLAYER_W, st.player.x + spd);

    // Move player bullets
    st.playerBullets = st.playerBullets.filter(b => b.y > 0);
    for (const b of st.playerBullets) b.y -= 8;

    // Move alien bullets
    st.alienBullets = st.alienBullets.filter(b => b.y < H);
    for (const b of st.alienBullets) b.y += 4;

    // UFO
    st.ufoTimer++;
    if (!st.ufoActive && st.ufoTimer > 600) {
      st.ufoActive = true; st.ufoX = -50; st.ufoTimer = 0;
    }
    if (st.ufoActive) {
      st.ufoX += 2;
      if (st.ufoX > W + 50) st.ufoActive = false;
    }

    // Move aliens
    st.alienMoveTimer += dt;
    const aliveAliens = st.aliens.filter(a => a.alive);
    if (st.alienMoveTimer >= st.alienMoveInterval) {
      st.alienMoveTimer = 0;
      // Toggle frame
      for (const a of st.aliens) a.frame = 1 - a.frame;

      // Check bounds
      const newOffset = st.alienOffsetX + ALIEN_STEP_X * st.alienDir;
      const leftmost = Math.min(...aliveAliens.map(a => a.x)) + newOffset;
      const rightmost = Math.max(...aliveAliens.map(a => a.x + ALIEN_W)) + newOffset;

      if (leftmost < 0 || rightmost > W) {
        st.alienDir *= -1;
        for (const a of st.aliens) a.y += ALIEN_STEP_DOWN;
        st.alienOffsetX += ALIEN_STEP_X * st.alienDir;
      } else {
        st.alienOffsetX = newOffset;
      }

      // Speed up as aliens die
      const remaining = aliveAliens.length;
      const base = Math.max(200, 800 - (st.wave - 1) * 80);
      st.alienMoveInterval = Math.max(50, base * (remaining / (ALIEN_COLS * ALIEN_ROWS)));
    }

    // Alien shooting
    st.alienShootTimer += dt;
    if (st.alienShootTimer >= st.alienShootInterval && aliveAliens.length > 0 && st.alienBullets.length < 4) {
      st.alienShootTimer = 0;
      // Pick random alive alien from bottom of each column
      const cols = {};
      for (const a of aliveAliens) {
        if (!cols[a.col] || a.row > cols[a.col].row) cols[a.col] = a;
      }
      const shooters = Object.values(cols);
      const shooter = shooters[Math.floor(Math.random() * shooters.length)];
      st.alienBullets.push({
        x: shooter.x + st.alienOffsetX + ALIEN_W / 2 - 1,
        y: shooter.y + ALIEN_H,
      });
    }

    // Player bullet vs alien
    for (const bullet of [...st.playerBullets]) {
      // vs UFO
      if (st.ufoActive && bullet.x >= st.ufoX && bullet.x <= st.ufoX + 50 && bullet.y <= 60) {
        st.score += 100;
        st.ufoActive = false;
        st.playerBullets = st.playerBullets.filter(b => b !== bullet);
        continue;
      }
      let hit = false;
      for (const a of st.aliens) {
        if (!a.alive) continue;
        const ax = a.x + st.alienOffsetX;
        if (bullet.x >= ax && bullet.x <= ax + ALIEN_W && bullet.y >= a.y && bullet.y <= a.y + ALIEN_H) {
          a.alive = false;
          st.score += ALIEN_PTS[a.row];
          st.playerBullets = st.playerBullets.filter(b => b !== bullet);
          hit = true;
          setDisplay(d => ({ ...d, score: st.score }));
          break;
        }
      }
      if (hit) continue;
      // vs shields
      for (const sh of st.shields) {
        if (bullet.x >= sh.x && bullet.x <= sh.x + SHIELD_W && bullet.y >= sh.y && bullet.y <= sh.y + SHIELD_H) {
          const sc = Math.floor((bullet.x - sh.x) / SHIELD_CELL);
          const sr = Math.floor((bullet.y - sh.y) / SHIELD_CELL);
          if (sr >= 0 && sr < SHIELD_ROWS && sc >= 0 && sc < SHIELD_COLS && sh.cells[sr][sc]) {
            sh.cells[sr][sc] = false;
            if (sr + 1 < SHIELD_ROWS) sh.cells[sr + 1][sc] = false;
            st.playerBullets = st.playerBullets.filter(b => b !== bullet);
            break;
          }
        }
      }
    }

    // Alien bullet vs player
    for (const bullet of [...st.alienBullets]) {
      if (bullet.x >= st.player.x && bullet.x <= st.player.x + PLAYER_W &&
          bullet.y >= PLAYER_Y && bullet.y <= PLAYER_Y + PLAYER_H) {
        st.lives--;
        st.player.x = W / 2 - PLAYER_W / 2;
        st.playerBullets = [];
        st.alienBullets = st.alienBullets.filter(b => b !== bullet);
        st.gamePhase = 'dead';
        st.deathTimer = 0;
        setDisplay(d => ({ ...d, lives: st.lives }));
        break;
      }
      // vs shields
      for (const sh of st.shields) {
        if (bullet.x >= sh.x && bullet.x <= sh.x + SHIELD_W && bullet.y >= sh.y && bullet.y <= sh.y + SHIELD_H) {
          const sc = Math.floor((bullet.x - sh.x) / SHIELD_CELL);
          const sr = Math.floor((bullet.y - sh.y) / SHIELD_CELL);
          if (sr >= 0 && sr < SHIELD_ROWS && sc >= 0 && sc < SHIELD_COLS && sh.cells[sr][sc]) {
            sh.cells[sr][sc] = false;
            st.alienBullets = st.alienBullets.filter(b => b !== bullet);
            break;
          }
        }
      }
    }

    // Check: aliens reach bottom
    for (const a of aliveAliens) {
      if (a.y > PLAYER_Y - 20) {
        st.lives = 0; st.gamePhase = 'gameover';
        setDisplay(d => {
          if (d.score > 0) isHighScore('space_invaders', d.score).then(yes => { if (yes) { setPendingScore(d.score); setShowHS(true); } });
          return { ...d, lives: 0, phase: 'gameover' };
        });
        break;
      }
    }

    // Check win
    if (aliveAliens.length === 0) {
      const best = Math.max(st.score, parseInt(localStorage.getItem('si_best') || '0'));
      localStorage.setItem('si_best', String(best));
      const nextWave = st.wave + 1;
      setDisplay(d => ({ ...d, score: st.score, wave: nextWave, phase: 'wave', best }));
      st.gamePhase = 'won';
    }

    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  function startGame(wave = 1, prevScore = 0) {
    cancelAnimationFrame(rafRef.current);
    const st = initState(wave);
    st.score = prevScore;
    stateRef.current = st;
    lastRef.current = performance.now();
    setDisplay(d => ({ ...d, score: prevScore, lives: 3, wave, phase: 'playing' }));
    rafRef.current = requestAnimationFrame(loop);
  }

  function nextWave() {
    const st = stateRef.current;
    startGame(st ? st.wave + 1 : 2, st ? st.score : 0);
  }

  useEffect(() => {
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  useEffect(() => {
    function onKey(e) {
      const st = stateRef.current;
      if (!st) return;
      st.keys[e.key] = e.type === 'keydown';
      if (e.type === 'keydown' && (e.key === ' ' || e.key === 'ArrowUp')) {
        e.preventDefault();
        if (st.gamePhase === 'playing' && st.playerBullets.length < 3) {
          st.playerBullets.push({ x: st.player.x + PLAYER_W / 2 - BULLET_W / 2, y: PLAYER_Y });
        }
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []);

  function touchLeft(down) {
    const st = stateRef.current;
    if (st) { st.keys['ArrowLeft'] = down; }
  }
  function touchRight(down) {
    const st = stateRef.current;
    if (st) { st.keys['ArrowRight'] = down; }
  }
  function touchFire() {
    const st = stateRef.current;
    if (st && st.gamePhase === 'playing' && st.playerBullets.length < 3) {
      st.playerBullets.push({ x: st.player.x + PLAYER_W / 2 - BULLET_W / 2, y: PLAYER_Y });
    }
  }

  const { phase, score, lives, wave, best } = display;
  const isIdle = phase === 'idle';
  const isPlaying = phase === 'playing';
  const isWave = phase === 'wave';
  const isOver = phase === 'gameover';

  return (
    <div className="si-page">
      <div className="si-topbar">
        <button className="si-back" onClick={onBack}>← Game Vault</button>
        <div className="si-title">Space Invaders</div>
        <div className="si-best">BEST: {best}</div>
      </div>

      <div className="si-canvas-wrap">
        <canvas ref={canvasRef} width={W} height={H} className="si-canvas" />
        {(isIdle || isWave || isOver) && (
          <div className="si-overlay">
            {isOver && (
              <>
                <div className="si-overlay-title" style={{ color: '#ff4757' }}>GAME OVER</div>
                <div className="si-overlay-score">Score: {score}</div>
                <div className="si-overlay-score">Best: {best}</div>
              </>
            )}
            {isWave && (
              <>
                <div className="si-overlay-title" style={{ color: '#ffd700' }}>WAVE {wave - 1} CLEARED!</div>
                <div className="si-overlay-score">Score: {score}</div>
              </>
            )}
            {isIdle && (
              <>
                <div className="si-overlay-title">SPACE INVADERS</div>
                <div className="si-overlay-hint">Arrow keys to move · Space to shoot</div>
              </>
            )}
            <button className="si-start-btn" onClick={() => isWave ? nextWave() : startGame()}>
              {isOver ? 'Play Again' : isWave ? `Start Wave ${wave}` : 'Start Game'}
            </button>
          </div>
        )}
      </div>

      {showHS && <HighScoreModal gameId="space_invaders" score={pendingScore} label="pts" onSave={() => setShowHS(false)} onDismiss={() => setShowHS(false)} />}
      <div className="si-touch-controls">
        <button className="si-touch-btn"
          onPointerDown={() => touchLeft(true)}
          onPointerUp={() => touchLeft(false)}
          onPointerLeave={() => touchLeft(false)}>◀</button>
        <button className="si-touch-btn si-fire-btn" onPointerDown={touchFire}>🔫</button>
        <button className="si-touch-btn"
          onPointerDown={() => touchRight(true)}
          onPointerUp={() => touchRight(false)}
          onPointerLeave={() => touchRight(false)}>▶</button>
      </div>
    </div>
  );
}
