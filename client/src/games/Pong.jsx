import React, { useEffect, useRef } from 'react';
import './Pong.css';

const W = 700, H = 480;
const PAD_W = 12, PAD_H = 80, PAD_SPEED = 5.5;
const BALL_R = 8, WIN_SCORE = 7;

function initState() {
  return {
    ball: { x: W / 2, y: H / 2, vx: 4 * (Math.random() > 0.5 ? 1 : -1), vy: 3 * (Math.random() > 0.5 ? 1 : -1) },
    p1: { y: H / 2 - PAD_H / 2, score: 0 },
    p2: { y: H / 2 - PAD_H / 2, score: 0 },
    keys: {},
    phase: 'idle',
  };
}

export default function Pong() {
  const canvasRef = useRef(null);
  const stateRef = useRef(initState());
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    function drawPad(x, y, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, PAD_W, PAD_H, 4);
      ctx.fill();
    }

    function draw() {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, W, H);

      // Center line
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Scores
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 52px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.p1.score, W / 4, 70);
      ctx.fillText(s.p2.score, (3 * W) / 4, 70);

      drawPad(16, s.p1.y, '#7c3aed');
      drawPad(W - 16 - PAD_W, s.p2.y, '#e05252');

      // Ball
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      if (s.phase === 'idle') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('Pong', W / 2, H / 2 - 28);
        ctx.font = '16px sans-serif';
        ctx.fillStyle = '#8b949e';
        ctx.fillText('Press Space or click to start', W / 2, H / 2 + 10);
      }

      if (s.phase === 'won') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        const winner = s.p1.score >= WIN_SCORE ? 'Player 1' : 'Player 2';
        const col = s.p1.score >= WIN_SCORE ? '#7c3aed' : '#e05252';
        ctx.fillStyle = col;
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(`${winner} Wins!`, W / 2, H / 2 - 20);
        ctx.fillStyle = '#8b949e';
        ctx.font = '16px sans-serif';
        ctx.fillText('Space or click to play again', W / 2, H / 2 + 20);
      }
    }

    function resetBall(dir = 1) {
      s.ball.x = W / 2; s.ball.y = H / 2;
      const speed = 4;
      s.ball.vx = speed * dir;
      s.ball.vy = (Math.random() * 3 + 2) * (Math.random() > 0.5 ? 1 : -1);
    }

    function tick() {
      if (s.phase === 'playing') {
        // Move paddles
        if (s.keys['w'] || s.keys['W']) s.p1.y = Math.max(0, s.p1.y - PAD_SPEED);
        if (s.keys['s'] || s.keys['S']) s.p1.y = Math.min(H - PAD_H, s.p1.y + PAD_SPEED);
        if (s.keys['ArrowUp']) s.p2.y = Math.max(0, s.p2.y - PAD_SPEED);
        if (s.keys['ArrowDown']) s.p2.y = Math.min(H - PAD_H, s.p2.y + PAD_SPEED);

        // Move ball
        s.ball.x += s.ball.vx;
        s.ball.y += s.ball.vy;

        // Wall bounce
        if (s.ball.y - BALL_R < 0) { s.ball.y = BALL_R; s.ball.vy *= -1; }
        if (s.ball.y + BALL_R > H) { s.ball.y = H - BALL_R; s.ball.vy *= -1; }

        // P1 paddle
        if (
          s.ball.x - BALL_R < 16 + PAD_W &&
          s.ball.y > s.p1.y - BALL_R &&
          s.ball.y < s.p1.y + PAD_H + BALL_R
        ) {
          s.ball.x = 16 + PAD_W + BALL_R;
          s.ball.vx = Math.abs(s.ball.vx) * 1.05;
          const hit = (s.ball.y - (s.p1.y + PAD_H / 2)) / (PAD_H / 2);
          s.ball.vy = hit * 6;
        }

        // P2 paddle
        if (
          s.ball.x + BALL_R > W - 16 - PAD_W &&
          s.ball.y > s.p2.y - BALL_R &&
          s.ball.y < s.p2.y + PAD_H + BALL_R
        ) {
          s.ball.x = W - 16 - PAD_W - BALL_R;
          s.ball.vx = -Math.abs(s.ball.vx) * 1.05;
          const hit = (s.ball.y - (s.p2.y + PAD_H / 2)) / (PAD_H / 2);
          s.ball.vy = hit * 6;
        }

        // Speed cap
        const spd = Math.sqrt(s.ball.vx ** 2 + s.ball.vy ** 2);
        if (spd > 14) { s.ball.vx *= 14 / spd; s.ball.vy *= 14 / spd; }

        // Score
        if (s.ball.x < 0) {
          s.p2.score++;
          if (s.p2.score >= WIN_SCORE) s.phase = 'won';
          else resetBall(-1);
        }
        if (s.ball.x > W) {
          s.p1.score++;
          if (s.p1.score >= WIN_SCORE) s.phase = 'won';
          else resetBall(1);
        }
      }
      draw();
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  useEffect(() => {
    function onKey(e) {
      const s = stateRef.current;
      if (['ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
      if (e.type === 'keydown') {
        s.keys[e.key] = true;
        if (e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
      } else {
        s.keys[e.key] = false;
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); };
  }, []);

  function handleStart() {
    const s = stateRef.current;
    if (s.phase === 'idle' || s.phase === 'won') {
      Object.assign(s, initState());
      s.phase = 'playing';
    }
  }

  return (
    <div className="pong-wrap">
      <canvas ref={canvasRef} width={W} height={H} className="pong-canvas" onClick={handleStart} />
      <div className="pong-controls">
        <div><span>Player 1</span>W / S to move</div>
        <div><span>Player 2</span>↑ / ↓ to move</div>
      </div>
    </div>
  );
}
