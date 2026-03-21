import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './DailySpinPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const TOKEN_KEY  = 'gv_auth_token';

// Must match server SPIN_PRIZES order exactly
const PRIZES = [
  { label: '$500',     amount: 500,    color: '#e74c3c' },
  { label: '$1,000',   amount: 1000,   color: '#e67e22' },
  { label: '$2,500',   amount: 2500,   color: '#f1c40f' },
  { label: '$5,000',   amount: 5000,   color: '#2ecc71' },
  { label: '$10,000',  amount: 10000,  color: '#1abc9c' },
  { label: '$25,000',  amount: 25000,  color: '#3498db' },
  { label: '$50,000',  amount: 50000,  color: '#9b59b6' },
  { label: '$100,000', amount: 100000, color: '#ff6b6b' },
];

const NUM = PRIZES.length;
const ARC = (2 * Math.PI) / NUM;
const SIZE = 320;

function drawWheel(canvas, angle) {
  const ctx = canvas.getContext('2d');
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r  = cx - 6;

  ctx.clearRect(0, 0, SIZE, SIZE);

  // Outer glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  for (let i = 0; i < NUM; i++) {
    const start = angle + i * ARC;
    const end   = start + ARC;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = PRIZES[i].color;
    ctx.fill();

    // Segment border
    ctx.strokeStyle = '#0f0f1a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + ARC / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(PRIZES[i].label, r - 12, 5);
    ctx.restore();
  }

  // Center cap
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 22);
  grad.addColorStop(0, '#3b1d8a');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Center icon
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎡', cx, cy);
  ctx.textBaseline = 'alphabetic';
}

function fmt(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function DailySpinPage() {
  const navigate  = useNavigate();
  const { token } = useAuth();
  const canvasRef = useRef(null);
  const animRef   = useRef(null);
  const angleRef  = useRef(0);

  const [canSpin,    setCanSpin]    = useState(false);
  const [spinning,   setSpinning]   = useState(false);
  const [result,     setResult]     = useState(null);
  const [nextSpinAt, setNextSpinAt] = useState(null);
  const [timeLeft,   setTimeLeft]   = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const draw = useCallback((angle) => {
    if (canvasRef.current) drawWheel(canvasRef.current, angle);
  }, []);

  // Initial wheel draw
  useEffect(() => {
    draw(angleRef.current);
  }, [draw]);

  // Fetch status whenever token becomes available (handles async auth restore)
  useEffect(() => {
    const t = token || localStorage.getItem(TOKEN_KEY);
    if (!t) return; // wait until we have a token
    fetchStatus(t);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (!nextSpinAt || canSpin) return;
    const id = setInterval(() => {
      const diff = nextSpinAt - Date.now();
      if (diff <= 0) { setCanSpin(true); setTimeLeft(''); clearInterval(id); return; }
      setTimeLeft(fmt(diff));
    }, 1000);
    return () => clearInterval(id);
  }, [nextSpinAt, canSpin]);

  async function fetchStatus(authToken) {
    try {
      const res  = await fetch(`${SERVER_URL}/api/daily-spin`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.ok) {
        setCanSpin(data.canSpin);
        setNextSpinAt(data.nextSpinAt);
      } else {
        setError(data.error || 'Could not load spin status');
      }
    } catch (e) {
      setError('Network error — please refresh');
    }
    setLoading(false);
  }

  async function handleSpin() {
    if (!canSpin || spinning) return;
    setSpinning(true);
    setResult(null);
    setError('');

    try {
      const authToken = token || localStorage.getItem(TOKEN_KEY);
      if (!authToken) { setError('Not logged in'); setSpinning(false); return; }
      const res   = await fetch(`${SERVER_URL}/api/daily-spin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Something went wrong');
        setSpinning(false);
        return;
      }

      // Find prize index by amount
      const prizeIdx = PRIZES.findIndex(p => p.amount === data.amount);
      const idx = prizeIdx < 0 ? 0 : prizeIdx;

      // Pointer sits at top = -π/2. Segment idx center should land there.
      // Segment idx center angle (from 0) = idx * ARC + ARC/2
      // We need: wheelAngle + idx*ARC + ARC/2 = 3π/2 (top in canvas coords)
      // So targetAngle = 3π/2 - idx*ARC - ARC/2, then add 5 full spins
      const targetBase  = 3 * Math.PI / 2 - idx * ARC - ARC / 2;
      const normalized  = ((targetBase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const currentMod  = ((angleRef.current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let   extra       = normalized - currentMod;
      if (extra < 0) extra += 2 * Math.PI;

      const totalSpin = 5 * 2 * Math.PI + extra;
      const startAngle = angleRef.current;
      const endAngle   = startAngle + totalSpin;
      const duration   = 4200;
      const startTime  = performance.now();

      function easeOut(t) {
        // Ease out quintic
        return 1 - Math.pow(1 - t, 5);
      }

      function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const a = startAngle + totalSpin * easeOut(t);
        angleRef.current = a;
        draw(a);
        if (t < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          setSpinning(false);
          setCanSpin(false);
          setNextSpinAt(data.nextSpinAt);
          setResult(data);
          // Update balance in AuthContext / localStorage
          if (data.balance != null) {
            localStorage.setItem('casinoBalance', String(data.balance));
            window.dispatchEvent(new CustomEvent('balanceUpdate', { detail: { balance: data.balance } }));
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    } catch {
      setError('Network error — please try again');
      setSpinning(false);
    }
  }

  return (
    <div className="dspin-page">
      <div className="dspin-header">
        <button className="dspin-back" onClick={() => navigate('/')}>← Back to Hub</button>
        <div className="dspin-title">
          <h1>🎡 Daily Free Spin</h1>
          <p>One free spin every 24 hours — prizes up to $100,000!</p>
        </div>
      </div>

      <div className="dspin-main">
        {/* Wheel */}
        <div className="dspin-wheel-wrap">
          <div className="dspin-pointer">▼</div>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="dspin-canvas"
          />
        </div>

        {/* Result */}
        {result && (
          <div className="dspin-result" key={result.amount}>
            <div className="dspin-result-prize">+{result.prize}</div>
            <div className="dspin-result-msg">Coins added to your balance! 🎉</div>
          </div>
        )}

        {error && <div className="dspin-error">{error}</div>}

        {/* CTA */}
        {!loading && (
          <div className="dspin-cta">
            {canSpin ? (
              <button
                className={`dspin-btn${spinning ? ' dspin-btn--spinning' : ''}`}
                onClick={handleSpin}
                disabled={spinning}
              >
                {spinning ? (
                  <>
                    <span className="dspin-spin-anim">⟳</span> Spinning…
                  </>
                ) : '🎡  SPIN NOW'}
              </button>
            ) : (
              <div className="dspin-wait">
                <div className="dspin-wait-label">Next spin available in</div>
                <div className="dspin-wait-timer">{timeLeft || '…'}</div>
                {result && <div className="dspin-wait-sub">Come back tomorrow for another spin!</div>}
              </div>
            )}
          </div>
        )}

        {/* Prize legend */}
        <div className="dspin-legend">
          <div className="dspin-legend-title">Prize Table</div>
          <div className="dspin-legend-grid">
            {PRIZES.map((p, i) => (
              <div key={i} className="dspin-legend-row">
                <span className="dspin-legend-dot" style={{ background: p.color }} />
                <span className="dspin-legend-label">{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
