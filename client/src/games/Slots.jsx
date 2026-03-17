import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Slots.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

const REEL_POOL = [
  '💎','7️⃣','⭐','⭐','🔔','🔔','🍇','🍇','🍊','🍊','🍋','🍋','🍋','🍒','🍒','🍒'
];

const PAYTABLE = [
  { symbols: ['💎','💎','💎'], label: '💎 💎 💎', mult: 1000 },
  { symbols: ['7️⃣','7️⃣','7️⃣'], label: '7️⃣ 7️⃣ 7️⃣', mult: 500 },
  { symbols: ['⭐','⭐','⭐'], label: '⭐ ⭐ ⭐', mult: 50 },
  { symbols: ['🔔','🔔','🔔'], label: '🔔 🔔 🔔', mult: 30 },
  { symbols: ['🍇','🍇','🍇'], label: '🍇 🍇 🍇', mult: 20 },
  { symbols: ['🍊','🍊','🍊'], label: '🍊 🍊 🍊', mult: 15 },
  { symbols: ['🍋','🍋','🍋'], label: '🍋 🍋 🍋', mult: 8 },
  { symbols: ['🍒','🍒','🍒'], label: '🍒 🍒 🍒', mult: 5 },
  { symbols: ['🍒','🍒','*'], label: '🍒 🍒 any', mult: 2 },
  { symbols: ['🍒','*','*'], label: '🍒 any any', mult: 1.3 },
];

function randomSymbol() {
  return REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)];
}

function evaluate(reels) {
  const [r0, r1, r2] = reels;

  if (r0 === '💎' && r1 === '💎' && r2 === '💎') return { mult: 1000, label: '💎 💎 💎 JACKPOT!' };
  if (r0 === '7️⃣' && r1 === '7️⃣' && r2 === '7️⃣') return { mult: 500, label: '7️⃣ 7️⃣ 7️⃣ LUCKY SEVENS!' };
  if (r0 === '⭐' && r1 === '⭐' && r2 === '⭐') return { mult: 50, label: '⭐ ⭐ ⭐ STARS!' };
  if (r0 === '🔔' && r1 === '🔔' && r2 === '🔔') return { mult: 30, label: '🔔 🔔 🔔 BELLS!' };
  if (r0 === '🍇' && r1 === '🍇' && r2 === '🍇') return { mult: 20, label: '🍇 🍇 🍇 GRAPES!' };
  if (r0 === '🍊' && r1 === '🍊' && r2 === '🍊') return { mult: 15, label: '🍊 🍊 🍊 ORANGES!' };
  if (r0 === '🍋' && r1 === '🍋' && r2 === '🍋') return { mult: 8, label: '🍋 🍋 🍋 LEMONS!' };
  if (r0 === '🍒' && r1 === '🍒' && r2 === '🍒') return { mult: 5, label: '🍒 🍒 🍒 CHERRIES!' };
  if (r0 === '🍒' && r1 === '🍒' && r2 !== '🍒') return { mult: 2, label: '🍒 🍒 — Double Cherry!' };
  if (r0 === '🍒' && r1 !== '🍒') return { mult: 1.3, label: '🍒 — Single Cherry!' };

  return { mult: 0, label: 'No match. Better luck next time!' };
}

function formatMs(ms) {
  if (ms <= 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const QUICK_BETS = [5, 10, 25, 50, 100, 250];
const SPIN_DURATION = 1200; // ms
const REEL_STOP_DELAY = 150; // ms between each reel stopping

export default function Slots() {
  const { banned, reason, expiresAt, loading } = useBanCheck('slots');
  useGameActivity('slots');
  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet] = useState(10);
  const [reels, setReels] = useState(['🎰', '🎰', '🎰']);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [result, setResult] = useState(null); // { mult, label, payout }
  const [disabled, setDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);

  const broke = balance <= 0;

  useEffect(() => {
    if (broke) {
      const tick = () => setCountdown(msUntilNextDaily());
      tick();
      countdownRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(countdownRef.current);
    }
    return () => clearInterval(countdownRef.current);
  }, [broke]);

  // Keep bet clamped when balance changes
  useEffect(() => {
    if (bet > balance && balance > 0) {
      setBet(Math.max(1, Math.floor(balance)));
    }
  }, [balance]);

  function syncBalance() {
    setBalance(getBalance());
  }

  function handleBetChange(e) {
    const val = Math.max(1, Math.min(Math.floor(Number(e.target.value) || 1), Math.floor(balance)));
    setBet(val);
  }

  function handleMax() {
    setBet(Math.max(1, Math.floor(balance)));
  }

  function handleSpin() {
    if (disabled || broke || bet <= 0 || bet > balance) return;

    const finalReels = [randomSymbol(), randomSymbol(), randomSymbol()];
    const outcome = evaluate(finalReels);

    subtractBalance(bet);
    setBalance(getBalance());

    setResult(null);
    setDisabled(true);
    setSpinning([true, true, true]);

    // Stop reels sequentially
    setTimeout(() => {
      setSpinning(prev => [false, prev[1], prev[2]]);
      setReels(prev => [finalReels[0], prev[1], prev[2]]);
    }, SPIN_DURATION);

    setTimeout(() => {
      setSpinning(prev => [prev[0], false, prev[2]]);
      setReels(prev => [prev[0], finalReels[1], prev[2]]);
    }, SPIN_DURATION + REEL_STOP_DELAY);

    setTimeout(() => {
      setSpinning([false, false, false]);
      setReels(finalReels);

      let payout = 0;
      if (outcome.mult > 0) {
        payout = Math.floor(bet * outcome.mult);
        addBalance(payout);
      }
      setBalance(getBalance());
      setResult({ ...outcome, payout, win: outcome.mult > 0 });
      setDisabled(false);
    }, SPIN_DURATION + REEL_STOP_DELAY * 2);
  }

  const availableQuickBets = QUICK_BETS.filter(v => v <= balance);

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
    <div className="slots-wrapper">
      <div className="slots-balance">
        Balance: <span className="slots-balance-amount">${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      {broke ? (
        <div className="slots-broke">
          <div className="slots-broke-title">You're broke! 💸</div>
          <div className="slots-broke-sub">Next hourly $1,000 in:</div>
          <div className="slots-broke-countdown">{formatMs(countdown)}</div>
        </div>
      ) : (
        <>
          <div className="slots-machine">
            <div className="slots-title">🎰 SLOTS 🎰</div>
            <div className="slots-reels-container">
              <div className="slots-payline" />
              {reels.map((sym, i) => (
                <div
                  key={i}
                  className={`slots-reel${spinning[i] ? ' slots-reel--spinning' : ''}`}
                >
                  <span className="slots-reel-symbol">{sym}</span>
                </div>
              ))}
            </div>

            {result && (
              <div className={`slots-result ${result.win ? 'slots-result--win' : 'slots-result--lose'}`}>
                <div className="slots-result-label">{result.label}</div>
                {result.win && (
                  <div className="slots-result-payout">
                    +${result.payout.toLocaleString()} ({result.mult}×)
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="slots-controls">
            <div className="slots-bet-row">
              <label className="slots-bet-label">Bet</label>
              <input
                className="slots-bet-input"
                type="number"
                min={1}
                max={Math.floor(balance)}
                value={bet}
                onChange={handleBetChange}
                disabled={disabled}
              />
              <button className="slots-btn slots-btn--max" onClick={handleMax} disabled={disabled}>
                Max
              </button>
            </div>

            <div className="slots-quickbets">
              {availableQuickBets.map(v => (
                <button
                  key={v}
                  className={`slots-btn slots-btn--quick${bet === v ? ' slots-btn--quick-active' : ''}`}
                  onClick={() => setBet(v)}
                  disabled={disabled}
                >
                  ${v}
                </button>
              ))}
            </div>

            <button
              className="slots-btn slots-btn--spin"
              onClick={handleSpin}
              disabled={disabled || bet <= 0 || bet > balance}
            >
              {disabled ? 'Spinning…' : '🎰 Spin'}
            </button>
          </div>
        </>
      )}

      <div className="slots-paytable">
        <div className="slots-paytable-title">Paytable</div>
        <table className="slots-paytable-table">
          <thead>
            <tr>
              <th>Combination</th>
              <th>Multiplier</th>
            </tr>
          </thead>
          <tbody>
            {PAYTABLE.map((row, i) => (
              <tr key={i}>
                <td>{row.label}</td>
                <td className="slots-paytable-mult">{row.mult}×</td>
              </tr>
            ))}
            <tr className="slots-paytable-lose">
              <td>Everything else</td>
              <td>Lose</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
