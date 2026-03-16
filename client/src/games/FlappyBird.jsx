import React, { useEffect, useRef, useState } from 'react';
import HighScoreModal from '../components/HighScoreModal';
import { isHighScore, addScore } from '../utils/leaderboard';
import './FlappyBird.css';

const W = 400, H = 550;
const BIRD_X = 80, BIRD_R = 16;
const GRAVITY = 0.45, JUMP = -8;
const PIPE_W = 52, PIPE_GAP = 148, PIPE_SPEED = 2.6;
const PIPE_INTERVAL = 90; // frames

function newPipe(x) {
  const topH = 80 + Math.random() * (H - PIPE_GAP - 160);
  return { x, topH };
}

export default function FlappyBird() {
  const canvasRef = useRef(null);
  const state = useRef({
    birdY: H / 2, velY: 0,
    pipes: [], frame: 0,
    score: 0, phase: 'idle', // idle | playing | dead
  });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => parseInt(localStorage.getItem('flappy_best') || '0'));
  const [phase, setPhase] = useState('idle');
  const [showHS, setShowHS] = useState(false);
  const [pendingScore, setPendingScore] = useState(null);
  const animRef = useRef(null);

  function jump() {
    const s = state.current;
    if (s.phase === 'dead') {
      // restart
      s.birdY = H / 2; s.velY = 0; s.pipes = []; s.frame = 0; s.score = 0;
      s.phase = 'playing';
      setScore(0); setPhase('playing');
    } else if (s.phase === 'idle') {
      s.phase = 'playing';
      setPhase('playing');
      s.velY = JUMP;
    } else {
      s.velY = JUMP;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function draw() {
      const s = state.current;
      ctx.clearRect(0, 0, W, H);

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1a2744');
      sky.addColorStop(1, '#0d1f3c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Ground
      ctx.fillStyle = '#3d6b35';
      ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = '#5a9e4f';
      ctx.fillRect(0, H - 30, W, 6);

      // Pipes
      s.pipes.forEach(p => {
        // top pipe
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(p.x, 0, PIPE_W, p.topH);
        ctx.fillStyle = '#388e3c';
        ctx.fillRect(p.x - 4, p.topH - 20, PIPE_W + 8, 20);
        // bottom pipe
        const botY = p.topH + PIPE_GAP;
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(p.x, botY, PIPE_W, H - botY);
        ctx.fillStyle = '#388e3c';
        ctx.fillRect(p.x - 4, botY, PIPE_W + 8, 20);
      });

      // Bird
      const bx = BIRD_X, by = s.birdY;
      const angle = Math.min(Math.max(s.velY * 0.06, -0.4), 1.2);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle);
      // Body
      ctx.fillStyle = '#f9c74f';
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_R, BIRD_R - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wing
      ctx.fillStyle = '#f8961e';
      ctx.beginPath();
      ctx.ellipse(-4, 4, 10, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(7, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(8, -5, 3, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = '#f77f00';
      ctx.beginPath();
      ctx.moveTo(13, -1);
      ctx.lineTo(21, 2);
      ctx.lineTo(13, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Score
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      if (s.phase === 'playing') ctx.fillText(s.score, W / 2, 50);

      // Overlays
      if (s.phase === 'idle') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Flappy Bird', W / 2, H / 2 - 20);
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#f9c74f';
        ctx.fillText('Click or press Space to start', W / 2, H / 2 + 20);
      }
      if (s.phase === 'dead') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('Game Over', W / 2, H / 2 - 40);
        ctx.fillStyle = '#fff';
        ctx.font = '22px sans-serif';
        ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 4);
        ctx.fillStyle = '#f9c74f';
        ctx.font = '16px sans-serif';
        ctx.fillText('Click or Space to retry', W / 2, H / 2 + 38);
      }
    }

    function tick() {
      const s = state.current;
      if (s.phase === 'playing') {
        s.velY += GRAVITY;
        s.birdY += s.velY;
        s.frame++;

        // Spawn pipes
        if (s.frame % PIPE_INTERVAL === 0) {
          s.pipes.push(newPipe(W + 10));
        }

        // Move pipes
        s.pipes.forEach(p => { p.x -= PIPE_SPEED; });
        s.pipes = s.pipes.filter(p => p.x + PIPE_W > -10);

        // Score
        s.pipes.forEach(p => {
          if (!p.passed && p.x + PIPE_W < BIRD_X) {
            p.passed = true;
            s.score++;
            setScore(s.score);
            if (s.score > best) {
              setBest(s.score);
              localStorage.setItem('flappy_best', String(s.score));
            }
          }
        });

        // Collision with ground/ceiling
        if (s.birdY + BIRD_R > H - 30 || s.birdY - BIRD_R < 0) {
          s.phase = 'dead';
          setPhase('dead');
          if (s.score > 0 && isHighScore('flappy_bird', s.score)) {
            setPendingScore(s.score); setShowHS(true);
          }
        }

        // Collision with pipes
        for (const p of s.pipes) {
          const inX = BIRD_X + BIRD_R > p.x + 4 && BIRD_X - BIRD_R < p.x + PIPE_W - 4;
          const inTop = s.birdY - BIRD_R < p.topH;
          const inBot = s.birdY + BIRD_R > p.topH + PIPE_GAP;
          if (inX && (inTop || inBot)) {
            s.phase = 'dead';
            setPhase('dead');
            if (s.score > 0 && isHighScore('flappy_bird', s.score)) {
              setPendingScore(s.score); setShowHS(true);
            }
          }
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
      if (e.code === 'Space') { e.preventDefault(); jump(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flappy-wrap">
      <canvas
        ref={canvasRef}
        width={W} height={H}
        className="flappy-canvas"
        onClick={jump}
      />
      <div className="flappy-ui">
        <div className="flappy-score">Score: {score}</div>
        <div className="flappy-best">Best: {best}</div>
      </div>
      {showHS && <HighScoreModal gameId="flappy_bird" score={pendingScore} label="pipes" onSave={name => { addScore('flappy_bird', pendingScore, name); setShowHS(false); }} onDismiss={() => setShowHS(false)} />}
    </div>
  );
}
