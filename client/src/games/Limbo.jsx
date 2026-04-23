import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getBalance, addBalance, subtractBalance, reportBigWin, isRiggedMode, recordBetResult } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';
import './Limbo.css';

const HOUSE_EDGE = 0.01; // 1%

// Win probability for a given target multiplier
function winChance(target) {
  return Math.min(0.99, (1 - HOUSE_EDGE) / target);
}

// Generate a random result multiplier using the inverse CDF of the distribution
// Result is always ≥ 1.00
function rollResult() {
  if (isRiggedMode()) return 1.00;
  const r = Math.random();
  // Produces distribution where P(result ≥ x) = (1-HOUSE_EDGE)/x, min 1.00
  const raw = (1 - HOUSE_EDGE) / Math.max(r, 0.0001);
  return Math.max(1.00, raw);
}

function fmtMult(n) {
  if (n >= 1000) return n.toFixed(0) + 'x';
  if (n >= 10)   return n.toFixed(2) + 'x';
  return n.toFixed(2) + 'x';
}

const PRESETS = [1.5, 2, 3, 5, 10, 50, 100];

export default function Limbo() {
  useBanCheck('limbo');
  useGameActivity('limbo');
  const boost = useGameBoost('limbo');

  const [balance,  setBalance]  = useState(getBalance);
  const [bet,      setBet]      = useState('');
  const [target,   setTarget]   = useState(2);
  const [phase,    setPhase]    = useState('idle'); // idle | rolling | result
  const [display,  setDisplay]  = useState('1.00x');
  const [result,   setResult]   = useState(null); // { won, rolled, payout }
  const [history,  setHistory]  = useState([]);   // last 10 results
  const animRef = useRef(null);

  useEffect(() => {
    initJokerBonuses();
    const sync = () => setBalance(getBalance());
    window.addEventListener('focus', sync);
    window.addEventListener('balanceUpdate', sync);
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('balanceUpdate', sync); };
  }, []);

  function quickBet(frac) {
    setBet(String(Math.max(100, Math.floor(getBalance() * frac))));
  }

  const handleRoll = useCallback(() => {
    const amt = Math.floor(Number(bet));
    if (!amt || amt < 100 || amt > getBalance() || phase !== 'idle') return;

    subtractBalance(amt);
    setBalance(getBalance());
    setResult(null);
    setPhase('rolling');

    const rolled = rollResult();
    const won    = rolled >= target;
    const payout = won ? Math.floor(amt * target * (boost || 1)) : 0;

    // Animate display counter from 1.00 to rolled
    const duration = 900;
    const start    = performance.now();
    const startVal = 1.0;
    const endVal   = Math.min(rolled, 9999);

    cancelAnimationFrame(animRef.current);
    function tick(now) {
      const t    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur  = startVal + (endVal - startVal) * ease;
      setDisplay(fmtMult(cur));
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(fmtMult(rolled));
        if (payout > 0) {
          addBalance(payout);
          applyJokerBonus(amt, payout, true);
          if (payout >= amt * 5) reportBigWin && reportBigWin(payout);
        } else {
          applyJokerBonus(amt, 0, false);
        }
        setBalance(getBalance());
        setResult({ won, rolled, payout, amt, target });
        setHistory(h => [{ won, rolled, target },...h].slice(0, 12));
        setPhase('result');
        recordBetResult({ game: 'limbo', amount: amt, won, multiplier: won ? target : 1, profit: won ? payout - amt : -amt });
      }
    }
    animRef.current = requestAnimationFrame(tick);
  }, [bet, target, phase, boost]);

  const amt        = Math.floor(Number(bet)) || 0;
  const chance     = winChance(target) * 100;
  const preview    = Math.floor(amt * target * (boost || 1));
  const isRolling  = phase === 'rolling';

  return (
    <div className="limbo-page">
      <div className="limbo-wrap">
        <h2 className="limbo-title">🚀 Limbo</h2>
        <p className="limbo-sub">Set your target — if the result hits it, you win!</p>

        <div className="limbo-balance">Balance: <strong>${balance.toLocaleString()}</strong></div>

        {/* Big multiplier display */}
        <div className={`limbo-display ${
          phase === 'result'
            ? result?.won ? 'limbo-display--win' : 'limbo-display--lose'
            : phase === 'rolling' ? 'limbo-display--rolling' : ''
        }`}>
          {phase === 'idle' ? `${fmtMult(target)} target` : display}
        </div>

        {/* Result banner */}
        {phase === 'result' && result && (
          <div className={`limbo-result ${result.won ? 'limbo-result--win' : 'limbo-result--lose'}`}>
            {result.won
              ? `🎉 ${fmtMult(result.rolled)} — Won $${result.payout.toLocaleString()}!`
              : `💥 ${fmtMult(result.rolled)} — Under ${fmtMult(result.target)}`}
          </div>
        )}

        {/* Target slider */}
        <div className="limbo-target-section">
          <div className="limbo-target-label">
            Target Multiplier
            <span className="limbo-target-val">{fmtMult(target)}</span>
          </div>
          <input
            type="range"
            className="limbo-slider"
            min="1.01"
            max="100"
            step="0.01"
            value={Math.min(target, 100)}
            onChange={e => setTarget(Math.max(1.01, parseFloat(e.target.value)))}
            disabled={isRolling}
          />
          <div className="limbo-presets">
            {PRESETS.map(p => (
              <button
                key={p}
                className={`limbo-preset ${target === p ? 'limbo-preset--active' : ''}`}
                onClick={() => !isRolling && setTarget(p)}
                disabled={isRolling}
              >{p}×</button>
            ))}
            <input
              className="limbo-custom-target"
              type="number"
              min="1.01"
              max="1000000"
              step="0.01"
              placeholder="Custom"
              value={target}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 1.01) setTarget(v); }}
              disabled={isRolling}
            />
          </div>
          <div className="limbo-stats-row">
            <div className="limbo-stat">
              <span className="limbo-stat-label">Win Chance</span>
              <span className="limbo-stat-val">{chance.toFixed(2)}%</span>
            </div>
            <div className="limbo-stat">
              <span className="limbo-stat-label">Payout</span>
              <span className="limbo-stat-val limbo-stat-val--green">{amt >= 100 ? `$${preview.toLocaleString()}` : `${fmtMult(target)}`}</span>
            </div>
            {boost > 1 && (
              <div className="limbo-stat">
                <span className="limbo-stat-label">Boost</span>
                <span className="limbo-stat-val" style={{ color: '#f59e0b' }}>🔥 {boost.toFixed(2)}×</span>
              </div>
            )}
          </div>
        </div>

        {/* Bet input */}
        <div className="limbo-bet-row">
          <span className="limbo-bet-prefix">$</span>
          <input
            className="limbo-bet-input"
            type="number"
            min="100"
            max={balance}
            value={bet}
            onChange={e => setBet(e.target.value)}
            placeholder="Enter wager"
            disabled={isRolling}
          />
        </div>
        <div className="limbo-quick-btns">
          {[[0.1,'10%'],[0.25,'25%'],[0.5,'50%'],[1,'MAX']].map(([f,l]) => (
            <button key={f} className="limbo-quick-btn" onClick={() => !isRolling && quickBet(f)} disabled={isRolling}>{l}</button>
          ))}
        </div>

        <button
          className={`limbo-roll-btn${(!amt || amt < 100 || amt > balance || isRolling) ? ' limbo-roll-btn--disabled' : ''}`}
          onClick={() => { if (phase !== 'idle') { setPhase('idle'); setDisplay('1.00x'); } else handleRoll(); }}
          disabled={phase === 'rolling'}
        >
          {phase === 'rolling' ? '🚀 Launching…' : phase === 'result' ? '🔄 Bet Again' : '🚀 Launch!'}
        </button>

        {amt > balance && <div className="limbo-err">Insufficient balance</div>}
        {amt > 0 && amt < 100 && <div className="limbo-err">Minimum bet is $100</div>}

        {/* History bubbles */}
        {history.length > 0 && (
          <div className="limbo-history">
            {history.map((h, i) => (
              <span
                key={i}
                className={`limbo-hist-dot ${h.won ? 'limbo-hist-dot--win' : 'limbo-hist-dot--lose'}`}
                title={`${fmtMult(h.rolled)} (target ${fmtMult(h.target)})`}
              >
                {fmtMult(h.rolled)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
