import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Crash.css';

// Crash point: 0.99 / (1 - random) with 1% house edge
// Minimum 1.00x (instant crash ~1% of time)
function generateCrashPoint() {
  const r = Math.random();
  if (r >= 0.99) return 1.00;
  return Math.max(1.00, parseFloat((0.99 / (1 - r)).toFixed(2)));
}

const MAX_HISTORY = 10;

export default function Crash() {
  const [balance, setBalance]         = useState(getBalance);
  const [bet, setBet]                 = useState(10);
  const [autoCashout, setAutoCashout] = useState('');
  const [phase, setPhase]             = useState('betting'); // betting | running | crashed
  const [currentMult, setCurrentMult] = useState(1.00);
  const [cashedOut, setCashedOut]     = useState(false);
  const [cashoutMult, setCashoutMult] = useState(null);
  const [crashPoint, setCrashPoint]   = useState(null);
  const [history, setHistory]         = useState([]); // [{mult, crashed}]
  const [countdown, setCountdown]     = useState('');

  const intervalRef  = useRef(null);
  const tickRef      = useRef(0);
  const crashRef     = useRef(null);
  const cashedOutRef = useRef(false);
  const betRef       = useRef(10);

  useEffect(() => {
    function tick() {
      const ms = msUntilNextDaily();
      const h  = Math.floor(ms / 3600000);
      const m  = Math.floor((ms % 3600000) / 60000);
      const s  = Math.floor((ms % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function syncBalance() { setBalance(getBalance()); }

  function startRound() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();
    betRef.current = bet;

    const cp = generateCrashPoint();
    crashRef.current    = cp;
    cashedOutRef.current = false;
    tickRef.current     = 0;

    setCrashPoint(cp);
    setCashedOut(false);
    setCashoutMult(null);
    setCurrentMult(1.00);
    setPhase('running');

    intervalRef.current = setInterval(() => {
      tickRef.current += 1;
      // Multiplier grows ~14% per second (50ms ticks)
      const newMult = parseFloat((Math.pow(1.007, tickRef.current)).toFixed(2));
      setCurrentMult(newMult);

      // Auto cashout
      const ac = parseFloat(autoCashout);
      if (!cashedOutRef.current && !isNaN(ac) && ac >= 1.01 && newMult >= ac) {
        doAutoCashout(newMult);
        return;
      }

      // Check crash
      if (newMult >= crashRef.current) {
        clearInterval(intervalRef.current);
        setCurrentMult(crashRef.current);
        setPhase('crashed');
        if (!cashedOutRef.current) {
          // Didn't cash out — lose bet (already deducted)
          setHistory(h => [{ mult: crashRef.current, win: false }, ...h].slice(0, MAX_HISTORY));
        }
        syncBalance();
      }
    }, 50);
  }

  function doAutoCashout(mult) {
    if (cashedOutRef.current) return;
    cashedOutRef.current = true;
    const payout = Math.floor(betRef.current * mult);
    addBalance(payout);
    syncBalance();
    setCashedOut(true);
    setCashoutMult(mult);
    setHistory(h => [{ mult, win: true }, ...h].slice(0, MAX_HISTORY));
  }

  function cashOut() {
    if (phase !== 'running' || cashedOut) return;
    cashedOutRef.current = true;
    const mult   = currentMult;
    const payout = Math.floor(betRef.current * mult);
    addBalance(payout);
    syncBalance();
    setCashedOut(true);
    setCashoutMult(mult);
    setHistory(h => [{ mult, win: true }, ...h].slice(0, MAX_HISTORY));
  }

  function reset() {
    clearInterval(intervalRef.current);
    setPhase('betting');
    setCurrentMult(1.00);
    setCashedOut(false);
    setCashoutMult(null);
    setCrashPoint(null);
    tickRef.current = 0;
    syncBalance();
  }

  const balance_  = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);

  // Colour ramp: green → yellow → red
  function multColor(m) {
    if (m < 2)   return '#22c55e';
    if (m < 5)   return '#eab308';
    if (m < 10)  return '#f97316';
    return '#ef4444';
  }

  const isRunning  = phase === 'running';
  const isCrashed  = phase === 'crashed';
  const isBetting  = phase === 'betting';
  const displayMult = isBetting ? '1.00' : currentMult.toFixed(2);

  return (
    <div className="crash-table">
      <div className="crash-title">🚀 Crash</div>
      <div className="crash-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* History bar */}
      <div className="crash-history">
        {history.map((h, i) => (
          <span key={i} className={`crash-hist-pill ${h.win ? 'win' : 'lose'}`}>
            {h.mult.toFixed(2)}×
          </span>
        ))}
        {history.length === 0 && <span className="crash-hist-empty">No rounds yet</span>}
      </div>

      {/* Main display */}
      <div className={`crash-display ${isCrashed && !cashedOut ? 'crash-display--crashed' : ''}`}>
        {isCrashed && !cashedOut ? (
          <>
            <div className="crash-boom">💥</div>
            <div className="crash-crashed-label">CRASHED AT</div>
            <div className="crash-mult crash-mult--crashed">{crashPoint?.toFixed(2)}×</div>
          </>
        ) : cashedOut ? (
          <>
            <div className="crash-cashed-emoji">💰</div>
            <div className="crash-cashed-label">Cashed out at</div>
            <div className="crash-mult crash-mult--win">{cashoutMult?.toFixed(2)}×</div>
            <div className="crash-cashed-profit">+${Math.floor(betRef.current * cashoutMult) - betRef.current}</div>
          </>
        ) : (
          <>
            <div className="crash-rocket" style={{ fontSize: isRunning ? '3rem' : '2.5rem' }}>🚀</div>
            <div
              className="crash-mult"
              style={{ color: multColor(currentMult) }}
            >
              {displayMult}×
            </div>
            {isRunning && (
              <div className="crash-potential">
                Cash out: ${Math.floor(bet * currentMult)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {isBetting && (
        <div className="crash-betting">
          {balance_ < 1 ? (
            <div className="crash-broke">
              <div className="crash-broke-title">You're broke! 😬</div>
              <div className="crash-broke-sub">Your daily $250 arrives in</div>
              <div className="crash-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="crash-inputs">
                <div className="crash-input-group">
                  <label className="crash-label">Bet</label>
                  <input
                    className="crash-input"
                    type="number" min={1} max={balance_}
                    value={bet}
                    onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
                  />
                </div>
                <div className="crash-input-group">
                  <label className="crash-label">Auto cashout at</label>
                  <input
                    className="crash-input"
                    type="number" min={1.01} step={0.1}
                    placeholder="e.g. 2.00"
                    value={autoCashout}
                    onChange={e => setAutoCashout(e.target.value)}
                  />
                </div>
              </div>
              <div className="crash-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`crash-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`crash-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              <button className="crash-btn crash-btn--start" onClick={startRound}>
                🚀 Launch!
              </button>
            </>
          )}
        </div>
      )}

      {isRunning && !cashedOut && (
        <button className="crash-btn crash-btn--cashout" onClick={cashOut}>
          💰 Cash Out ${Math.floor(bet * currentMult)}
        </button>
      )}

      {isRunning && cashedOut && (
        <div className="crash-waiting">Waiting for round to end…</div>
      )}

      {isCrashed && (
        <button className="crash-btn crash-btn--start" onClick={reset}>
          🔄 Play Again
        </button>
      )}

      <div className="crash-hint">Cash out before the rocket crashes! • 1% house edge</div>
    </div>
  );
}
