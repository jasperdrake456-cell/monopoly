import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, reportBigWin } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import { loadEventOdds, shouldForceLoss } from '../utils/eventOdds';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';
import './CoinFlip.css';

const PAYOUT_MULT = 1.95; // 5% house edge

export default function CoinFlip() {
  useBanCheck('coin-flip');
  useGameActivity('coin-flip');
  const boost = useGameBoost('coin-flip');

  const [balance,  setBalance]  = useState(getBalance());
  const [wager,    setWager]    = useState('');
  const [pick,     setPick]     = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [result,   setResult]   = useState(null);
  const [face,     setFace]     = useState('idle');

  // Sync balance from storage on focus
  useEffect(() => {
    initJokerBonuses();
    loadEventOdds('coin-flip');
    const sync = () => setBalance(getBalance());
    window.addEventListener('focus', sync);
    window.addEventListener('balanceUpdate', sync);
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('balanceUpdate', sync); };
  }, []);

  function quickSet(frac) {
    const v = Math.max(100, Math.floor(getBalance() * frac));
    setWager(String(v));
  }

  function handleFlip() {
    const amt = Math.floor(Number(wager));
    if (!amt || amt < 100 || amt > getBalance() || !pick || flipping) return;

    setFlipping(true);
    setResult(null);
    subtractBalance(amt);
    setBalance(getBalance());

    // Outcome
    // Rigged user OR admin force-loss → guaranteed loss
    const won  = shouldForceLoss('coin-flip') ? false : (Math.random() < 0.5);
    const side = won ? pick : (pick === 'heads' ? 'tails' : 'heads');

    setFace('spinning');

    setTimeout(() => {
      setFace(side);
      const payout = won ? Math.floor(amt * PAYOUT_MULT * (boost || 1)) : 0;
      if (payout > 0) {
        addBalance(payout);
        applyJokerBonus(amt, payout, true);
        if (payout >= amt * 2) reportBigWin && reportBigWin(payout);
      } else {
        applyJokerBonus(amt, 0, false);
      }
      setBalance(getBalance());
      setResult({ side, won, payout, amt });
      setFlipping(false);
    }, 1400);
  }

  const amt    = Math.floor(Number(wager)) || 0;
  const payout = Math.floor(amt * PAYOUT_MULT * (boost || 1));

  return (
    <div className="cf-page">
      <div className="cf-wrap">
        <h2 className="cf-title">🪙 Coin Flip</h2>
        <p className="cf-sub">50/50 — win {PAYOUT_MULT}× your wager{boost > 1 ? ` · 🔥 ${boost.toFixed(2)}× boost` : ''}</p>

        <div className="cf-balance">Balance: <strong>${balance.toLocaleString()}</strong></div>

        {/* 3D Coin */}
        <div className={`cf-coin cf-coin--${face}`}>
          <div className="cf-coin-inner">
            <div className="cf-coin-heads"><span>H</span></div>
            <div className="cf-coin-tails"><span>T</span></div>
          </div>
        </div>

        {/* Result */}
        {result && !flipping && (
          <div className={`cf-result ${result.won ? 'cf-result--win' : 'cf-result--lose'}`}>
            {result.won
              ? `🎉 ${result.side.toUpperCase()}! Won $${result.payout.toLocaleString()}`
              : `😬 ${result.side.toUpperCase()} — Better luck next time`}
          </div>
        )}

        {/* Pick buttons */}
        <div className="cf-picks">
          {['heads', 'tails'].map(s => (
            <button
              key={s}
              className={`cf-pick-btn ${pick === s ? 'cf-pick-btn--active' : ''}`}
              onClick={() => !flipping && setPick(s)}
              disabled={flipping}
            >
              {s === 'heads' ? '🟡 Heads' : '⚪ Tails'}
            </button>
          ))}
        </div>

        {/* Wager */}
        <div className="cf-wager-row">
          <span className="cf-wager-prefix">$</span>
          <input
            className="cf-wager-input"
            type="number"
            min="100"
            max={balance}
            value={wager}
            onChange={e => setWager(e.target.value)}
            placeholder="Enter wager"
            disabled={flipping}
          />
        </div>

        <div className="cf-quick-btns">
          {[[0.1,'10%'],[0.25,'25%'],[0.5,'50%'],[1,'MAX']].map(([f, label]) => (
            <button key={f} className="cf-quick-btn" onClick={() => !flipping && quickSet(f)} disabled={flipping}>
              {label}
            </button>
          ))}
        </div>

        {amt >= 100 && pick && (
          <div className="cf-payout-preview">
            Potential win: <strong>${payout.toLocaleString()}</strong>
          </div>
        )}

        <button
          className={`cf-flip-btn${(!pick || amt < 100 || amt > balance || flipping) ? ' cf-flip-btn--disabled' : ''}`}
          onClick={handleFlip}
          disabled={!pick || amt < 100 || amt > balance || flipping}
        >
          {flipping ? '🪙 Flipping…' : '🪙 FLIP!'}
        </button>

        {amt > balance && <div className="cf-err">Insufficient balance</div>}
        {amt > 0 && amt < 100 && <div className="cf-err">Minimum bet is $100</div>}
      </div>
    </div>
  );
}
