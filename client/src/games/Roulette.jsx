import React, { useState, useEffect, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin } from '../utils/casinoBalance';
import './Roulette.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const SECTOR_DEG = 360 / 37;

// Map each number → its index in WHEEL_ORDER
const NUM_POS = {};
WHEEL_ORDER.forEach((n, i) => { NUM_POS[n] = i; });

function numColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// ── SVG Wheel (computed once at module load) ──────────────────────────────────
const CX = 150, CY = 150, R = 128, IR = 42;

function toRad(deg) { return deg * Math.PI / 180; }

function sectorPath(i) {
  const s = i * SECTOR_DEG - 90;
  const e = (i + 1) * SECTOR_DEG - 90;
  const x1 = CX + R * Math.cos(toRad(s)),  y1 = CY + R * Math.sin(toRad(s));
  const x2 = CX + R * Math.cos(toRad(e)),  y2 = CY + R * Math.sin(toRad(e));
  const xi1 = CX + IR * Math.cos(toRad(s)), yi1 = CY + IR * Math.sin(toRad(s));
  const xi2 = CX + IR * Math.cos(toRad(e)), yi2 = CY + IR * Math.sin(toRad(e));
  return `M ${xi1} ${yi1} L ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} L ${xi2} ${yi2} A ${IR} ${IR} 0 0 0 ${xi1} ${yi1} Z`;
}

const SECTORS = WHEEL_ORDER.map((num, i) => {
  const midDeg = (i + 0.5) * SECTOR_DEG - 90;
  const lr = (R + IR) / 2;
  const lx = CX + lr * Math.cos(toRad(midDeg));
  const ly = CY + lr * Math.sin(toRad(midDeg));
  const fill = num === 0 ? '#16a34a' : RED_NUMBERS.has(num) ? '#dc2626' : '#111827';
  return { num, path: sectorPath(i), lx, ly, textRot: midDeg, fill };
});

// payout = total return multiplier (e.g. 1.8 means bet $100 → get $180 back)
const OUTSIDE_BETS = [
  { type: 'red',    label: 'Red',    icon: '🔴', payout: 1.97 },
  { type: 'black',  label: 'Black',  icon: '⚫', payout: 1.97 },
  { type: 'odd',    label: 'Odd',    icon: '',   payout: 1.97 },
  { type: 'even',   label: 'Even',   icon: '',   payout: 1.97 },
  { type: 'low',    label: '1–18',   icon: '',   payout: 1.97 },
  { type: 'high',   label: '19–36',  icon: '',   payout: 1.97 },
  { type: 'dozen1', label: '1st 12', icon: '',   payout: 2.92 },
  { type: 'dozen2', label: '2nd 12', icon: '',   payout: 2.92 },
  { type: 'dozen3', label: '3rd 12', icon: '',   payout: 2.92 },
];

export default function Roulette() {
  const { banned, reason, expiresAt, loading } = useBanCheck('roulette');
  useGameActivity('roulette');
  const boost = useGameBoost('roulette');
  const [balance, setBalance]     = useState(getBalance);
  const [bet, setBet]             = useState(10);
  const [betType, setBetType]     = useState(null);
  const [phase, setPhase]         = useState('betting'); // betting | spinning | result
  const [result, setResult]       = useState(null);
  const [history, setHistory]     = useState([]);
  const [wheelRot, setWheelRot]   = useState(0);
  const [countdown, setCountdown] = useState('');
  const wheelRotRef               = useRef(0);
  const spinning                  = phase === 'spinning';

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

  function spin() {
    if (!betType || spinning || bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    setBalance(getBalance());
    setPhase('spinning');
    setResult(null);

    const num   = Math.floor(Math.random() * 37); // 0–36
    const color = numColor(num);

    // Compute target rotation so that num's sector center ends up at top
    const targetMod  = ((360 - (NUM_POS[num] + 0.5) * SECTOR_DEG) % 360 + 360) % 360;
    const currentMod = ((wheelRotRef.current % 360) + 360) % 360;
    let diff = targetMod - currentMod;
    if (diff <= 0) diff += 360;
    const spins   = 6 + Math.floor(Math.random() * 3);
    const totalRot = wheelRotRef.current + diff + spins * 360;

    setWheelRot(totalRot);
    wheelRotRef.current = totalRot;

    setTimeout(() => {
      // Evaluate win
      let win = false;
      const { type, value } = betType;
      if (type === 'number')  win = num === value;
      else if (type === 'red')    win = color === 'red';
      else if (type === 'black')  win = color === 'black';
      else if (type === 'odd')    win = num !== 0 && num % 2 === 1;
      else if (type === 'even')   win = num !== 0 && num % 2 === 0;
      else if (type === 'low')    win = num >= 1 && num <= 18;
      else if (type === 'high')   win = num >= 19 && num <= 36;
      else if (type === 'dozen1') win = num >= 1 && num <= 12;
      else if (type === 'dozen2') win = num >= 13 && num <= 24;
      else if (type === 'dozen3') win = num >= 25 && num <= 36;

      let net = -bet;
      let totalReturn = 0;
      if (win) {
        // payout is total return multiplier: 2× for even-money, 3× for dozens, 36× for single
        totalReturn = Math.floor(bet * betType.payout * boost);
        addBalance(totalReturn);
        net = totalReturn - bet; // profit
        reportBigWin('roulette', bet, totalReturn, betType.payout, `Bet ${betType.label} · landed ${num} ${color} · ${betType.payout}×`);
      }
      setBalance(getBalance());

      const r = { number: num, color, win, net, totalReturn, mult: betType.payout };
      setResult(r);
      setHistory(prev => [r, ...prev].slice(0, 20));
      setPhase('result');
    }, 4500);
  }

  const balance_  = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);

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

  return (
    <div className="roulette-table">
      <div className="roulette-title">🎡 Roulette</div>
      <div className="roulette-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* History pills */}
      <div className="roulette-history">
        {history.map((h, i) => (
          <div key={i} className={`roulette-hist-pill roulette-hist-pill--${h.color}`}>
            {h.number}
          </div>
        ))}
      </div>

      {/* Wheel */}
      <div className="roulette-wheel-wrap">
        <div className="roulette-pointer">▼</div>
        <svg
          className="roulette-wheel-svg"
          width="300" height="300"
          style={{
            transform: `rotate(${wheelRot}deg)`,
            transition: spinning ? 'transform 4.5s cubic-bezier(0.08, 0, 0.04, 1)' : 'none',
          }}
        >
          {SECTORS.map(s => (
            <g key={s.num}>
              <path d={s.path} fill={s.fill} stroke="#0f0f1a" strokeWidth="1.5" />
              <text
                x={s.lx} y={s.ly}
                textAnchor="middle" dominantBaseline="middle"
                fill="rgba(255,255,255,0.9)" fontSize="8" fontWeight="700"
                transform={`rotate(${s.textRot}, ${s.lx}, ${s.ly})`}
              >
                {s.num}
              </text>
            </g>
          ))}
          {/* Divider lines */}
          {SECTORS.map((_, i) => {
            const deg = i * SECTOR_DEG - 90;
            return (
              <line
                key={i}
                x1={CX + IR * Math.cos(toRad(deg))} y1={CY + IR * Math.sin(toRad(deg))}
                x2={CX + R  * Math.cos(toRad(deg))} y2={CY + R  * Math.sin(toRad(deg))}
                stroke="#0f0f1a" strokeWidth="1.5"
              />
            );
          })}
          {/* Rim */}
          <circle cx={CX} cy={CY} r={R + 4} fill="none" stroke="#2d2d4e" strokeWidth="6" />
          {/* Center hub */}
          <circle cx={CX} cy={CY} r={IR} fill="#0a0a1a" stroke="#2d2d4e" strokeWidth="3" />
          <circle cx={CX} cy={CY} r={8}  fill="#a855f7" />
        </svg>
        {/* Ball */}
        <div className={`roulette-ball ${spinning ? 'roulette-ball--spinning' : ''}`} />
      </div>

      {/* Spinning label */}
      {spinning && <div className="roulette-spinning-msg">🎡 No more bets…</div>}

      {/* Result */}
      {result && phase === 'result' && (
        <div className={`roulette-result roulette-result--${result.color} ${result.win ? 'win' : 'lose'}`}>
          <span className={`roulette-result-num roulette-result-num--${result.color}`}>
            {result.number}
          </span>
          <span className="roulette-result-msg">
            {result.win ? `✅ Won $${result.totalReturn} (${result.mult}×)` : `❌ Lost $${bet}`}
          </span>
        </div>
      )}

      {/* Controls */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="roulette-controls">
          {balance_ < 1 ? (
            <div className="roulette-broke">
              <div className="roulette-broke-title">You're broke! 😬</div>
              <div className="roulette-broke-sub">Your hourly $1,000 arrives in</div>
              <div className="roulette-broke-countdown">{countdown}</div>
            </div>
          ) : (<>
            {/* Outside bets */}
            <div className="roulette-outside-bets">
              {OUTSIDE_BETS.map(b => (
                <button
                  key={b.type}
                  className={`roulette-ob roulette-ob--${b.type} ${betType?.type === b.type ? 'selected' : ''}`}
                  onClick={() => setBetType({ ...b })}
                >
                  {b.icon && <span>{b.icon}</span>} {b.label}
                  <span className="roulette-ob-pays">{b.payout}×</span>
                </button>
              ))}
            </div>

            {/* Number grid */}
            <div className="roulette-num-section">
              <div className="roulette-num-label">Straight Up — 35× return</div>
              <div className="roulette-num-grid">
                <button
                  className={`roulette-nb roulette-nb--green ${betType?.type === 'number' && betType.value === 0 ? 'selected' : ''}`}
                  onClick={() => setBetType({ type: 'number', value: 0, label: '0', payout: 35 })}
                >0</button>
                {Array.from({ length: 36 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    className={`roulette-nb roulette-nb--${RED_NUMBERS.has(n) ? 'red' : 'black'} ${betType?.type === 'number' && betType.value === n ? 'selected' : ''}`}
                    onClick={() => setBetType({ type: 'number', value: n, label: String(n), payout: 35 })}
                  >{n}</button>
                ))}
              </div>
            </div>

            {/* Bet amount */}
            <div className="roulette-bet-row">
              <span>Bet:</span>
              <input
                className="roulette-bet-input"
                type="number" min={1} max={balance_}
                value={bet}
                onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className="roulette-quick-bets">
              {quickBets.map(v => (
                <button key={v} className={`roulette-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
              ))}
              <button className={`roulette-qb ${bet === balance_ ? 'active' : ''}`} onClick={() => setBet(balance_)}>All In</button>
            </div>

            {betType && (
              <div className="roulette-selection">
                Bet: <strong>{betType.icon ? `${betType.icon} ` : ''}{betType.label}</strong>
                {' · '}<strong>{betType.payout}×</strong> return
                {' · '}Get back: <strong className="roulette-win-preview">${bet * betType.payout}</strong>
              </div>
            )}

            <button
              className="roulette-spin-btn"
              onClick={spin}
              disabled={!betType}
            >
              {phase === 'result' ? '🎡 Spin Again' : '🎡 Place Bet & Spin'}
            </button>
          </>)}
        </div>
      )}

      <div className="roulette-hint">Roulette · 0–36 · Even 1.97× · Dozens 2.92× · Straight up 35×</div>
    </div>
  );
}
