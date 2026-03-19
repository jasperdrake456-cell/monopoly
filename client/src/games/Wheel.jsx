import React, { useState, useEffect, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin } from '../utils/casinoBalance';
import './Wheel.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// Wheel of Fortune — casino style
// Segments are weighted by risk mode. Player bets on a color zone.
// House edge: payouts are slightly under fair odds.

const HOUSE_EDGE = 0.80;

// Risk modes: each has a different segment distribution
// Segments: array of { color, label, mult, weight }
// The wheel physically has TOTAL_SEGMENTS stops
const RISK_MODES = {
  low: {
    label: 'Low Risk',
    emoji: '🟢',
    color: '#22c55e',
    // total weight=85; house edge per segment: Green 7.8%, Blue 9.6%, Purple 5.9%, Gold 1.2%
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.6,   weight: 49 },
      { color: '#3b82f6', label: 'Blue',   mult: 3.2,   weight: 24 },
      { color: '#a855f7', label: 'Purple', mult: 8.0,   weight: 10 },
      { color: '#FFD700', label: 'Gold',   mult: 42.0,  weight: 2  },
    ],
  },
  medium: {
    label: 'Medium Risk',
    emoji: '🟡',
    color: '#eab308',
    // total weight=81; house edge per segment: Green 11.1%, Blue 9.1%, Purple 11.1%, Red 11.1%, Gold 1.2%
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.6,   weight: 45 },
      { color: '#3b82f6', label: 'Blue',   mult: 3.2,   weight: 23 },
      { color: '#a855f7', label: 'Purple', mult: 8.0,   weight: 9  },
      { color: '#ef4444', label: 'Red',    mult: 24.0,  weight: 3  },
      { color: '#FFD700', label: 'Gold',   mult: 80.0,  weight: 1  },
    ],
  },
  high: {
    label: 'High Risk',
    emoji: '🔴',
    color: '#ef4444',
    // total weight=50; house edge per segment: Green 7.6%, Blue 7.6%, Purple 10%, Red 10%, Gold 4%
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.65,  weight: 28 },
      { color: '#3b82f6', label: 'Blue',   mult: 3.85,  weight: 12 },
      { color: '#a855f7', label: 'Purple', mult: 7.5,   weight: 6  },
      { color: '#ef4444', label: 'Red',    mult: 15.0,  weight: 3  },
      { color: '#FFD700', label: 'Gold',   mult: 48.0,  weight: 1  },
    ],
  },
};

// Build a flat weighted array for spinning
function buildWeightedPool(segments) {
  const pool = [];
  for (const seg of segments) {
    for (let i = 0; i < seg.weight; i++) pool.push(seg);
  }
  return pool;
}

// Build visual wheel segments (proportional to weight)
function buildWheelSegments(segments) {
  const total = segments.reduce((s, sg) => s + sg.weight, 0);
  let angle = 0;
  return segments.map(seg => {
    const sweep = (seg.weight / total) * 360;
    const result = { ...seg, startAngle: angle, sweep };
    angle += sweep;
    return result;
  });
}

const SPIN_DURATION = 3000; // ms
const MAX_HISTORY = 8;

export default function Wheel() {
  const { banned, reason, expiresAt, loading } = useBanCheck('wheel');
  useGameActivity('wheel');
  const boost = useGameBoost('wheel');
  const [balance, setBalance]       = useState(getBalance);
  const [bet, setBet]               = useState(10);
  const [risk, setRisk]             = useState('medium');
  const [selectedColor, setSelectedColor] = useState(null); // which segment color the player bets on
  const [phase, setPhase]           = useState('betting'); // betting | spinning | result
  const [spinAngle, setSpinAngle]   = useState(0);
  const [result, setResult]         = useState(null); // { seg, won }
  const [history, setHistory]       = useState([]);
  const [countdown, setCountdown]   = useState('');
  const spinRef = useRef(null);
  const targetAngleRef = useRef(0);

  useEffect(() => {
    function tick() {
      const ms = msUntilNextDaily();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function syncBalance() { setBalance(getBalance()); }

  const mode = RISK_MODES[risk];
  const wheelSegs = buildWheelSegments(mode.segments);
  const pool = buildWeightedPool(mode.segments);

  function spin() {
    const b = getBalance();
    if (bet < 1 || bet > b || !selectedColor) return;
    subtractBalance(bet);
    syncBalance();
    setPhase('spinning');
    setResult(null);

    // Spin to a truly random angle — winner is determined AFTER by reading
    // which segment visually sits under the pointer (12 o'clock / 0°).
    const randomExtra = Math.random() * 360;
    const newAngle = spinAngle + 5 * 360 + randomExtra;
    setSpinAngle(newAngle);

    setTimeout(() => {
      // After the wheel stops, compute which segment is under the pointer.
      // The SVG was rotated clockwise by newAngle degrees.
      // A segment whose startAngle is `s` (measured clockwise from 12 o'clock)
      // is now visually at position (s + newAngle) mod 360 from 12 o'clock.
      // The pointer is at 12 o'clock (0°). We need the segment such that:
      //   startAngle ≤ pointerAt < startAngle + sweep
      // where pointerAt = (360 - finalAngle % 360) % 360
      const finalNorm = ((newAngle % 360) + 360) % 360;
      const pointerAt = (360 - finalNorm) % 360;

      const landedSeg = wheelSegs.find(seg =>
        pointerAt >= seg.startAngle && pointerAt < seg.startAngle + seg.sweep
      ) || wheelSegs[wheelSegs.length - 1];

      const won = landedSeg.color === selectedColor;
      const payout = won ? Math.floor(bet * landedSeg.mult * boost) : 0;
      if (won) {
        addBalance(payout);
        reportBigWin('wheel', bet, payout, landedSeg.mult, `${risk} risk · bet ${selectedColor} · landed ${landedSeg.label} · ${landedSeg.mult}×`);
      }
      syncBalance();
      setResult({ seg: landedSeg, won, payout });
      setPhase('result');
      setHistory(h => [{ won, seg: landedSeg, payout }, ...h].slice(0, MAX_HISTORY));
    }, SPIN_DURATION + 200);
  }

  function reset() {
    setPhase('betting');
    setResult(null);
    syncBalance();
  }

  const bal = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= bal);

  if (loading) return null;
  if (banned) {
    const exp = expiresAt ? new Date(expiresAt).toLocaleString() : null;
    return (
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#0f0f1a',color:'#fff',fontFamily:'Roboto,sans-serif',gap:'12px',padding:'32px',textAlign:'center'}}>
        <div style={{fontSize:'4rem'}}>🚫</div>
        <h2 style={{margin:0,color:'#ef4444'}}>Access Denied</h2>
        <p style={{margin:0,color:'#aaa',maxWidth:'360px'}}>You have been banned from this game{reason ? `: ${reason}` : '.'}</p>
        {exp ? <p style={{margin:0,color:'#666',fontSize:'0.85rem'}}>Ban expires: {exp}</p> : <p style={{margin:0,color:'#666',fontSize:'0.85rem'}}>This ban is permanent.</p>}
      </div>
    );
  }

  // SVG wheel rendering
  const SIZE = 260;
  const R = SIZE / 2;
  const CX = R, CY = R;

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, sweep) {
    const end = polarToCartesian(cx, cy, r, startAngle + sweep - 0.3);
    const start = polarToCartesian(cx, cy, r, startAngle + 0.3);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  }

  return (
    <div className="wheel-table">
      <div className="wheel-title">🎡 Wheel</div>
      <div className="wheel-balance">💰 Balance: <strong>${bal.toLocaleString()}</strong></div>

      {/* History */}
      <div className="wheel-history">
        {history.map((h, i) => (
          <span key={i} className={`wheel-hist-pill ${h.won ? 'win' : 'lose'}`}
            style={h.won ? { borderColor: h.seg.color, color: h.seg.color } : {}}>
            {h.won ? `+${h.payout}` : `✗`}
          </span>
        ))}
        {history.length === 0 && <span className="wheel-hist-empty">No rounds yet</span>}
      </div>

      {/* SVG Wheel */}
      <div className="wheel-svg-wrap">
        {/* Pointer */}
        <div className="wheel-pointer">▼</div>
        <svg
          width={SIZE} height={SIZE}
          style={{ transform: `rotate(${spinAngle}deg)`, transition: phase === 'spinning' ? `transform ${SPIN_DURATION}ms cubic-bezier(0.17,0.67,0.21,1)` : 'none' }}
        >
          {wheelSegs.map((seg, i) => (
            <path
              key={i}
              d={describeArc(CX, CY, R - 4, seg.startAngle, seg.sweep)}
              fill={seg.color}
              stroke="#050510"
              strokeWidth="2"
              opacity={0.9}
            />
          ))}
          {/* Center circle */}
          <circle cx={CX} cy={CY} r={22} fill="#050510" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <text x={CX} y={CY + 6} textAnchor="middle" fill="#fff" fontSize="18">🎡</text>
        </svg>
      </div>

      {/* Result banner */}
      {phase === 'result' && result && (
        <div className={`wheel-result ${result.won ? 'wheel-result--win' : 'wheel-result--lose'}`}
          style={result.won ? { borderColor: result.seg.color } : {}}>
          {result.won ? (
            <>
              <span style={{ color: result.seg.color, fontWeight: 900 }}>🎉 {result.seg.label}!</span>
              <span>+${result.payout} at {result.seg.mult}×</span>
            </>
          ) : (
            <>
              <span>💥 {result.seg.label} — no win</span>
              <span>Lost ${bet}</span>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="wheel-controls">
          {bal < 1 ? (
            <div className="wheel-broke">
              <div className="wheel-broke-title">You're broke! 😬</div>
              <div className="wheel-broke-sub">Your hourly $1,000 arrives in</div>
              <div className="wheel-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              {/* Risk selector */}
              <div className="wheel-risk-row">
                {Object.entries(RISK_MODES).map(([key, m]) => (
                  <button
                    key={key}
                    className={`wheel-risk-btn ${risk === key ? 'active' : ''}`}
                    style={risk === key ? { borderColor: m.color, background: `${m.color}22` } : {}}
                    onClick={() => { setRisk(key); setSelectedColor(null); }}
                  >
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>

              {/* Color bet selector */}
              <div className="wheel-color-label">Pick a segment to bet on:</div>
              <div className="wheel-color-row">
                {mode.segments.map(seg => (
                  <button
                    key={seg.label}
                    className={`wheel-color-btn ${selectedColor === seg.color ? 'active' : ''}`}
                    style={{
                      borderColor: selectedColor === seg.color ? seg.color : 'rgba(255,255,255,0.1)',
                      background: selectedColor === seg.color ? `${seg.color}33` : 'rgba(255,255,255,0.04)',
                    }}
                    onClick={() => setSelectedColor(seg.color)}
                  >
                    <span className="wheel-color-dot" style={{ background: seg.color }} />
                    <span className="wheel-color-name">{seg.label}</span>
                    <span className="wheel-color-mult">{seg.mult}×</span>
                  </button>
                ))}
              </div>

              {/* Bet input */}
              <div className="wheel-input-group">
                <label className="wheel-label">Bet Amount</label>
                <input
                  className="wheel-input"
                  type="number" min={1} max={bal}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(bal, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="wheel-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`wheel-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`wheel-qb ${bet === bal ? 'active' : ''}`} onClick={() => setBet(bal)}>All In</button>
              </div>

              <button
                className="wheel-btn wheel-btn--spin"
                onClick={phase === 'result' ? reset : spin}
                disabled={!selectedColor && phase === 'betting'}
              >
                {phase === 'result' ? '🔄 Spin Again' : selectedColor ? '🎡 Spin!' : 'Pick a colour first'}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'spinning' && (
        <div className="wheel-spinning-label">Spinning…</div>
      )}

      <div className="wheel-hint">Pick a segment colour, then spin the wheel</div>
    </div>
  );
}
