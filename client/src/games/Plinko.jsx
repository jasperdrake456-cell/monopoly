import React, { useState, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Plinko.css';
import useBanCheck from '../hooks/useBanCheck';

// Multiplier tables — 8 rows, 9 buckets (indexed 0–8)
const MULTIPLIERS = {
  low:    [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  medium: [13,  3,   1.3, 0.7, 0.4, 0.7, 1.3, 3,   13  ],
  high:   [29,  4,   1.5, 0.3, 0.2, 0.3, 1.5, 4,   29  ],
};

const ROWS = 8;
const BUCKET_COLORS = {
  low:    ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#6366f1'],
  medium: ['#f59e0b','#f97316','#eab308','#84cc16','#22d3ee','#84cc16','#eab308','#f97316','#f59e0b'],
  high:   ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#22c55e','#eab308','#f97316','#ef4444'],
};

// Simulate ball path through ROWS pegs — returns array of 'L'/'R' then final bucket index
function dropBall() {
  const path = [];
  let pos = 0; // count of rights (0 = leftmost bucket, ROWS = rightmost)
  for (let i = 0; i < ROWS; i++) {
    const goRight = Math.random() < 0.5;
    path.push(goRight ? 'R' : 'L');
    if (goRight) pos++;
  }
  return { path, bucket: pos }; // bucket 0..8
}

export default function Plinko() {
  const { banned, reason, expiresAt, loading } = useBanCheck('plinko');
  const [balance, setBalance]   = useState(getBalance);
  const [bet, setBet]           = useState(10);
  const [risk, setRisk]         = useState('medium');
  const [phase, setPhase]       = useState('idle'); // idle | dropping | result
  const [ballRow, setBallRow]   = useState(-1);    // current row of ball (-1 = not started)
  const [ballCol, setBallCol]   = useState(0);     // column within that row (0..row)
  const [finalBucket, setFinalBucket] = useState(null);
  const [payout, setPayout]     = useState(null);
  const [recentDrops, setRecentDrops] = useState([]); // [{bucket, mult, win}]
  const [countdown, setCountdown] = useState('');

  const animRef = useRef(null);

  React.useEffect(() => {
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

  function drop() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();
    setPhase('dropping');
    setFinalBucket(null);
    setPayout(null);

    const { path, bucket } = dropBall();
    let row = 0, col = 0;

    setBallRow(-1);
    setBallCol(0);

    // Animate ball one row at a time
    function step() {
      if (row > ROWS) {
        // Ball landed
        const mult    = MULTIPLIERS[risk][bucket];
        const p       = Math.floor(bet * mult);
        addBalance(p);
        syncBalance();
        setFinalBucket(bucket);
        setPayout(p);
        setPhase('result');
        setRecentDrops(prev => [{ bucket, mult, win: p >= bet }, ...prev].slice(0, 8));
        return;
      }
      setBallRow(row);
      setBallCol(col);
      if (row < ROWS) {
        if (path[row] === 'R') col++;
      }
      row++;
      animRef.current = setTimeout(step, 300);
    }

    animRef.current = setTimeout(step, 150);
  }

  function reset() {
    clearTimeout(animRef.current);
    setPhase('idle');
    setBallRow(-1);
    setBallCol(0);
    setFinalBucket(null);
    setPayout(null);
    syncBalance();
  }

  const balance_  = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const mults     = MULTIPLIERS[risk];
  const colors    = BUCKET_COLORS[risk];

  // Build peg board: row i has i+1 pegs, ball can be in positions 0..i
  const pegRows = Array.from({ length: ROWS }, (_, i) => i + 1);

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
    <div className="plinko-table">
      <div className="plinko-title">🎯 Plinko</div>
      <div className="plinko-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Recent drops */}
      <div className="plinko-history">
        {recentDrops.map((d, i) => (
          <span key={i} className={`plinko-hist-pill ${d.win ? 'win' : 'lose'}`}>
            {d.mult}×
          </span>
        ))}
      </div>

      {/* Board */}
      <div className="plinko-board">
        {pegRows.map((pegCount, rowIdx) => (
          <div key={rowIdx} className="plinko-row">
            {Array.from({ length: pegCount }, (_, pegIdx) => {
              const isBall = ballRow === rowIdx && ballCol === pegIdx;
              return (
                <div key={pegIdx} className={`plinko-peg ${isBall ? 'plinko-peg--ball' : ''}`}>
                  {isBall ? '🔴' : '●'}
                </div>
              );
            })}
          </div>
        ))}

        {/* Buckets */}
        <div className="plinko-buckets">
          {mults.map((m, i) => (
            <div
              key={i}
              className={`plinko-bucket ${finalBucket === i ? 'plinko-bucket--hit' : ''}`}
              style={{ background: `${colors[i]}22`, borderColor: finalBucket === i ? colors[i] : `${colors[i]}55`, color: colors[i] }}
            >
              {m}×
            </div>
          ))}
        </div>
      </div>

      {/* Result */}
      {phase === 'result' && payout !== null && (
        <div className={`plinko-result ${payout >= bet ? 'win' : 'lose'}`}>
          {payout >= bet
            ? `✅ Won $${payout}! (${MULTIPLIERS[risk][finalBucket]}×)`
            : `❌ Got $${payout} (${MULTIPLIERS[risk][finalBucket]}×)`}
        </div>
      )}

      {/* Controls */}
      {(phase === 'idle' || phase === 'result') && (
        <div className="plinko-controls">
          {balance_ < 1 ? (
            <div className="plinko-broke">
              <div className="plinko-broke-title">You're broke! 😬</div>
              <div className="plinko-broke-sub">Hourly $1,000 arrives in</div>
              <div className="plinko-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="plinko-risk-row">
                {['low','medium','high'].map(r => (
                  <button
                    key={r}
                    className={`plinko-risk-btn ${risk === r ? 'active' : ''}`}
                    onClick={() => setRisk(r)}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <div className="plinko-bet-row">
                <span>Bet:</span>
                <input
                  className="plinko-bet-input"
                  type="number" min={1} max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
                />
              </div>
              <div className="plinko-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`plinko-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`plinko-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              <button className="plinko-btn" onClick={drop}>
                {phase === 'result' ? '🎯 Drop Again' : '🎯 Drop Ball'}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'dropping' && (
        <div className="plinko-dropping">Ball dropping…</div>
      )}

      <div className="plinko-hint">8 rows • {risk} risk • Edges pay most</div>
    </div>
  );
}
