import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import './Dice.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// 3% house edge: multiplier = 0.97 / winChance
function calcMultiplier(target, direction) {
  const winChance = direction === 'over' ? (100 - target) / 100 : target / 100;
  if (winChance <= 0 || winChance >= 1) return 0;
  return parseFloat((0.97 / winChance).toFixed(4));
}

function calcWinChance(target, direction) {
  return direction === 'over'
    ? parseFloat((100 - target).toFixed(2))
    : parseFloat(target.toFixed(2));
}

export default function Dice() {
  const { banned, reason, expiresAt, loading } = useBanCheck('dice');
  useGameActivity('dice');
  const boost = useGameBoost('dice');
  const [balance, setBalance]     = useState(getBalance);
  const [bet, setBet]             = useState(10);
  const [target, setTarget]       = useState(50);
  const [direction, setDirection] = useState('over'); // 'over' | 'under'
  const [phase, setPhase]         = useState('betting'); // betting | rolling | result
  const [roll, setRoll]           = useState(null);
  const [result, setResult]       = useState(null);
  const [history, setHistory]     = useState([]);
  const [countdown, setCountdown] = useState('');

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

  function rollDice() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();
    setPhase('rolling');
    setRoll(null);
    setResult(null);

    // Short "rolling" animation then resolve
    setTimeout(() => {
      // Rigged: always roll on the losing side
      const rolled = isRiggedMode()
        ? (direction === 'over'
            ? parseFloat((Math.random() * Math.max(0, target - 0.01)).toFixed(2))
            : parseFloat((Math.min(100, target + 0.01) + Math.random() * (100 - target)).toFixed(2)))
        : parseFloat((Math.random() * 100).toFixed(2));
      const win      = direction === 'over' ? rolled > target : rolled < target;
      const mult     = calcMultiplier(target, direction);
      const payout   = win ? Math.floor(bet * mult * boost) : 0;

      if (win) {
        addBalance(payout);
        syncBalance();
        reportBigWin('dice', bet, payout, mult, `Rolled ${rolled} · ${direction} ${target} · ${winChance.toFixed(1)}% odds · ${mult.toFixed(2)}×`);
      }

      setRoll(rolled);
      setResult({ win, payout, mult });
      setPhase('result');
      setHistory(h => [{ rolled, win }, ...h].slice(0, 12));
    }, 600);
  }

  const balance_  = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const mult      = calcMultiplier(target, direction);
  const winChance = calcWinChance(target, direction);
  const potential = Math.floor(bet * mult);

  // Clamp target so win chance stays between 1% and 98%
  const minTarget = direction === 'over' ? 2  : 1;
  const maxTarget = direction === 'over' ? 99 : 98;

  function setDir(d) {
    setDirection(d);
    // Flip target when switching direction to maintain same win chance feel
    setTarget(t => Math.max(d === 'over' ? 2 : 1, Math.min(d === 'over' ? 99 : 98, t)));
  }

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
    <div className="dice-table">
      <div className="dice-title">🎲 Dice</div>
      <div className="dice-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Roll history dots */}
      <div className="dice-history">
        {history.map((h, i) => (
          <span key={i} className={`dice-dot ${h.win ? 'win' : 'lose'}`} title={h.rolled.toFixed(2)} />
        ))}
      </div>

      {/* Big roll display */}
      <div className={`dice-display ${phase === 'rolling' ? 'rolling' : result ? (result.win ? 'win' : 'lose') : ''}`}>
        {phase === 'rolling' ? (
          <div className="dice-rolling-anim">🎲</div>
        ) : roll !== null ? (
          <>
            <div className="dice-rolled-label">Rolled</div>
            <div className={`dice-rolled-num ${result?.win ? 'win' : 'lose'}`}>
              {roll.toFixed(2)}
            </div>
            <div className="dice-rolled-sub">
              {direction === 'over' ? `> ${target}` : `< ${target}`} → {result?.win ? '✅ WIN' : '❌ LOSS'}
            </div>
            {result?.win && (
              <div className="dice-profit">+${result.payout - bet}</div>
            )}
          </>
        ) : (
          <>
            <div className="dice-idle-icon">🎲</div>
            <div className="dice-idle-sub">Set your bet and roll</div>
          </>
        )}
      </div>

      {/* Target slider */}
      <div className="dice-slider-section">
        <div className="dice-dir-toggle">
          <button className={`dice-dir-btn ${direction==='under'?'active':''}`} onClick={() => setDir('under')}>
            Roll Under
          </button>
          <button className={`dice-dir-btn ${direction==='over'?'active':''}`} onClick={() => setDir('over')}>
            Roll Over
          </button>
        </div>

        <div className="dice-target-row">
          <span className="dice-target-label">Target: <strong>{target}</strong></span>
          <input
            className="dice-slider"
            type="range"
            min={minTarget}
            max={maxTarget}
            value={target}
            onChange={e => setTarget(parseInt(e.target.value))}
          />
        </div>

        <div className="dice-stats">
          <div className="dice-stat">
            <span>Win Chance</span>
            <strong className="dice-stat-val">{winChance}%</strong>
          </div>
          <div className="dice-stat">
            <span>Multiplier</span>
            <strong className="dice-stat-val">{mult}×</strong>
          </div>
          <div className="dice-stat">
            <span>Potential Win</span>
            <strong className="dice-stat-val dice-stat-val--gold">${potential}</strong>
          </div>
        </div>
      </div>

      {/* Betting */}
      {balance_ < 1 ? (
        <div className="dice-broke">
          <div className="dice-broke-title">You're broke! 😬</div>
          <div className="dice-broke-sub">Hourly $1,000 arrives in</div>
          <div className="dice-broke-countdown">{countdown}</div>
        </div>
      ) : (
        <>
          <div className="dice-bet-row">
            <span>Bet:</span>
            <input
              className="dice-bet-input"
              type="number" min={1} max={balance_}
              value={bet}
              onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
            />
          </div>
          <div className="dice-quick-bets">
            {quickBets.map(v => (
              <button key={v} className={`dice-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
            ))}
            <button className={`dice-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
          </div>
          <button
            className="dice-btn"
            onClick={rollDice}
            disabled={phase === 'rolling'}
          >
            {phase === 'rolling' ? '🎲 Rolling…' : '🎲 Roll Dice'}
          </button>
        </>
      )}

      <div className="dice-hint">Roll 0.00 – 100.00 • 3% house edge</div>
    </div>
  );
}
