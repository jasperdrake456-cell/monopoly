import React, { useState, useEffect, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Wheel.css';
import useBanCheck from '../hooks/useBanCheck';

// Wheel of Fortune — casino style
// Segments are weighted by risk mode. Player bets on a color zone.
// House edge: payouts are slightly under fair odds.

const HOUSE_EDGE = 0.99;

// Risk modes: each has a different segment distribution
// Segments: array of { color, label, mult, weight }
// The wheel physically has TOTAL_SEGMENTS stops
const RISK_MODES = {
  low: {
    label: 'Low Risk',
    emoji: '🟢',
    color: '#22c55e',
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.98,  weight: 49 },
      { color: '#3b82f6', label: 'Blue',   mult: 3.96,  weight: 24 },
      { color: '#a855f7', label: 'Purple', mult: 9.9,   weight: 9  },
      { color: '#FFD700', label: 'Gold',   mult: 49.5,  weight: 1  },
    ],
  },
  medium: {
    label: 'Medium Risk',
    emoji: '🟡',
    color: '#eab308',
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.98,  weight: 35 },
      { color: '#3b82f6', label: 'Blue',   mult: 3.96,  weight: 18 },
      { color: '#a855f7', label: 'Purple', mult: 9.9,   weight: 8  },
      { color: '#ef4444', label: 'Red',    mult: 29.7,  weight: 3  },
      { color: '#FFD700', label: 'Gold',   mult: 99.0,  weight: 1  },
    ],
  },
  high: {
    label: 'High Risk',
    emoji: '🔴',
    color: '#ef4444',
    segments: [
      { color: '#22c55e', label: 'Green',  mult: 1.98,  weight: 20 },
      { color: '#3b82f6', label: 'Blue',   mult: 4.95,  weight: 10 },
      { color: '#a855f7', label: 'Purple', mult: 9.9,   weight: 5  },
      { color: '#ef4444', label: 'Red',    mult: 19.8,  weight: 2  },
      { color: '#FFD700', label: 'Gold',   mult: 198.0, weight: 1  },
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

    // Pick winning segment
    const winSeg = pool[Math.floor(Math.random() * pool.length)];

    // Find the visual segment for winSeg
    const winWheelSeg = wheelSegs.find(s => s.label === winSeg.label);
    // Target: land pointer (top = 270°) on the center of winWheelSeg
    const winCenter = winWheelSeg.startAngle + winWheelSeg.sweep / 2;
    // Pointer is at top (270° in standard coords). We need: spinAngle + winCenter = 270 (mod 360)
    // So spinAngle target = 270 - winCenter
    const baseRotations = 5 * 360; // 5 full spins
    const targetOffset = (270 - winCenter + 360) % 360;
    const newAngle = spinAngle + baseRotations + targetOffset;
    targetAngleRef.current = newAngle;
    setSpinAngle(newAngle);

    setTimeout(() => {
      const won = winSeg.color === selectedColor;
      const payout = won ? Math.floor(bet * winSeg.mult) : 0;
      if (won) addBalance(payout);
      syncBalance();
      setResult({ seg: winSeg, won, payout });
      setPhase('result');
      setHistory(h => [{ won, seg: winSeg, payout }, ...h].slice(0, MAX_HISTORY));
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

      <div className="wheel-hint">Pick a segment, spin the wheel • {HOUSE_EDGE * 100}% RTP</div>
    </div>
  );
}
