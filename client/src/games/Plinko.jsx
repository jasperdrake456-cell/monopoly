import React, { useState, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin } from '../utils/casinoBalance';
import './Plinko.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

// Multiplier tables — 8 rows, 9 buckets (indexed 0–8)
const MULTIPLIERS = {
  low:    [3.0, 1.4, 0.7, 0.5, 0.3, 0.5, 0.7, 1.4, 3.0],
  medium: [7,   1.8, 0.8, 0.3, 0.2, 0.3, 0.8, 1.8, 7  ],
  high:   [14,  2.5, 0.7, 0.1, 0.1, 0.1, 0.7, 2.5, 14 ],
};

const ROWS = 8;
const BUCKET_COLORS = {
  low:    ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#6366f1'],
  medium: ['#f59e0b','#f97316','#eab308','#84cc16','#22d3ee','#84cc16','#eab308','#f97316','#f59e0b'],
  high:   ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#22c55e','#eab308','#f97316','#ef4444'],
};

// Step delay — slow enough to clearly watch each bounce
const STEP_MS = 500;

// Generate path + final bucket for one ball
function dropBall() {
  const path = [];
  let pos = 0;
  for (let i = 0; i < ROWS; i++) {
    const goRight = Math.random() < 0.5;
    path.push(goRight ? 'R' : 'L');
    if (goRight) pos++;
  }
  return { path, bucket: pos };
}

const BALL_COUNT_OPTIONS = [1, 3, 5, 10];

export default function Plinko() {
  const { banned, reason, expiresAt, loading } = useBanCheck('plinko');
  useGameActivity('plinko');
  const [balance, setBalance]     = useState(getBalance);
  const [bet, setBet]             = useState(10);
  const [numBalls, setNumBalls]   = useState(1);
  const [risk, setRisk]           = useState('medium');
  const [phase, setPhase]         = useState('idle'); // idle | dropping | result

  // Multi-ball state: array of { id, row, col } for balls currently in flight
  const [activeBalls, setActiveBalls] = useState([]);
  // Buckets where each ball landed (after drop completes)
  const [finalBuckets, setFinalBuckets] = useState([]);
  const [lastPayout, setLastPayout]   = useState(null);
  const [lastTotalBet, setLastTotalBet] = useState(null);
  const [recentDrops, setRecentDrops] = useState([]);
  const [countdown, setCountdown]     = useState('');

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
    const totalBet = bet * numBalls;
    if (bet < 1 || totalBet > b) return;
    subtractBalance(totalBet);
    syncBalance();
    setPhase('dropping');
    setFinalBuckets([]);
    setLastPayout(null);

    // Generate paths for all balls
    const ballData = Array.from({ length: numBalls }, (_, id) => ({ id, ...dropBall() }));
    // Track current column per ball
    const cols = new Array(numBalls).fill(0);
    let currentRow = 0;

    function step() {
      // All 8 peg rows processed — balls have their final columns, land them
      if (currentRow >= ROWS) {
        const buckets = ballData.map(b => b.bucket);
        const totalPayout = buckets.reduce(
          (sum, bkt) => sum + Math.floor(bet * MULTIPLIERS[risk][bkt]),
          0
        );
        addBalance(totalPayout);
        syncBalance();
        reportBigWin('plinko', totalBet, totalPayout, parseFloat((totalPayout / totalBet).toFixed(2)), `${numBalls} ball(s) · ${risk} risk · buckets: [${buckets.join(', ')}]`);
        setFinalBuckets(buckets);
        setLastPayout(totalPayout);
        setLastTotalBet(totalBet);
        setActiveBalls([]);
        setPhase('result');
        setRecentDrops(prev => [
          { totalPayout, totalBet, win: totalPayout >= totalBet },
          ...prev,
        ].slice(0, 8));
        return;
      }

      // Show all balls at their current row/col
      setActiveBalls(ballData.map((b, i) => ({ id: b.id, row: currentRow, col: cols[i] })));

      // Advance each ball's column based on this row's path direction
      ballData.forEach((b, i) => {
        if (b.path[currentRow] === 'R') cols[i]++;
      });
      currentRow++;

      animRef.current = setTimeout(step, STEP_MS);
    }

    animRef.current = setTimeout(step, STEP_MS / 2);
  }

  function reset() {
    clearTimeout(animRef.current);
    setPhase('idle');
    setActiveBalls([]);
    setFinalBuckets([]);
    setLastPayout(null);
    syncBalance();
  }

  const balance_  = getBalance();
  const totalBet  = bet * numBalls;
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v * numBalls <= balance_);
  const mults     = MULTIPLIERS[risk];
  const colors    = BUCKET_COLORS[risk];
  const pegRows   = Array.from({ length: ROWS }, (_, i) => i + 1);

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
            {d.win ? `+$${(d.totalPayout - d.totalBet).toLocaleString()}` : `-$${(d.totalBet - d.totalPayout).toLocaleString()}`}
          </span>
        ))}
      </div>

      {/* Board */}
      <div className="plinko-board">
        {pegRows.map((pegCount, rowIdx) => (
          <div key={rowIdx} className="plinko-row">
            {Array.from({ length: pegCount }, (_, pegIdx) => {
              const ballsHere = activeBalls.filter(b => b.row === rowIdx && b.col === pegIdx);
              const hasBall = ballsHere.length > 0;
              return (
                <div key={pegIdx} className={`plinko-peg ${hasBall ? 'plinko-peg--ball' : ''}`}>
                  {hasBall ? (ballsHere.length > 1 ? <span className="plinko-multi-ball">{ballsHere.length}</span> : null) : '●'}
                </div>
              );
            })}
          </div>
        ))}

        {/* Buckets */}
        <div className="plinko-buckets">
          {mults.map((m, i) => {
            const hitCount = finalBuckets.filter(b => b === i).length;
            return (
              <div
                key={i}
                className={`plinko-bucket ${hitCount > 0 ? 'plinko-bucket--hit' : ''}`}
                style={{ background: `${colors[i]}22`, borderColor: hitCount > 0 ? colors[i] : `${colors[i]}55`, color: colors[i] }}
              >
                {m}×
                {hitCount > 1 && <div className="plinko-bucket-count">×{hitCount}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Result */}
      {phase === 'result' && lastPayout !== null && (
        <div className={`plinko-result ${lastPayout >= lastTotalBet ? 'win' : 'lose'}`}>
          {lastPayout >= lastTotalBet
            ? `✅ Won $${lastPayout.toLocaleString()}! (+$${(lastPayout - lastTotalBet).toLocaleString()})`
            : `❌ Got $${lastPayout.toLocaleString()} (lost $${(lastTotalBet - lastPayout).toLocaleString()})`}
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
                  <button key={r} className={`plinko-risk-btn ${risk === r ? 'active' : ''}`} onClick={() => setRisk(r)}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              {/* Ball count selector */}
              <div className="plinko-balls-row">
                <span className="plinko-balls-label">Balls:</span>
                {BALL_COUNT_OPTIONS.map(n => (
                  <button
                    key={n}
                    className={`plinko-balls-btn ${numBalls === n ? 'active' : ''}`}
                    onClick={() => setNumBalls(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="plinko-bet-row">
                <span>Bet per ball:</span>
                <input
                  className="plinko-bet-input"
                  type="number" min={1} max={Math.floor(balance_ / numBalls)}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(Math.floor(balance_ / numBalls), parseInt(e.target.value)||1)))}
                />
              </div>
              {numBalls > 1 && (
                <div className="plinko-total-bet">
                  Total bet: <strong>${totalBet.toLocaleString()}</strong>
                </div>
              )}
              <div className="plinko-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`plinko-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
              </div>
              <button className="plinko-btn" onClick={phase === 'result' ? reset : drop} disabled={totalBet > balance_}>
                {phase === 'result'
                  ? `🎯 Drop Again`
                  : numBalls > 1 ? `🎯 Drop ${numBalls} Balls` : '🎯 Drop Ball'}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'dropping' && (
        <div className="plinko-dropping">Dropping{numBalls > 1 ? ` ${numBalls} balls` : ''}…</div>
      )}

      <div className="plinko-hint">8 rows • {risk} risk • {numBalls > 1 ? `${numBalls} balls × $${bet} = $${totalBet} bet` : 'Edges pay most'}</div>
    </div>
  );
}
