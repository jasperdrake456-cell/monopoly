import React, { useState, useCallback, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';
import './ScratchCard.css';

// Symbol definitions: [emoji, label, multiplier]
const SYMBOLS = [
  { sym: '💎', label: 'Diamond',  mult: 50  },
  { sym: '🌟', label: 'Star',     mult: 20  },
  { sym: '🍀', label: 'Clover',   mult: 10  },
  { sym: '🎰', label: 'Slots',    mult: 5   },
  { sym: '🍒', label: 'Cherry',   mult: 3   },
  { sym: '🍋', label: 'Lemon',    mult: 2   },
  { sym: '💀', label: 'Skull',    mult: 0   },
];

// Weighted pick — skulls common, diamonds rare
const WEIGHTS = [1, 3, 6, 10, 15, 20, 30];
const WEIGHT_TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);

function pickSym() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return i;
  }
  return SYMBOLS.length - 1;
}

// Generate a 3×3 grid. Optionally force a winning match.
function generateGrid(forceWin = false) {
  let grid = Array.from({ length: 9 }, () => pickSym());

  if (forceWin) {
    // Pick a non-skull symbol and place it 3 times
    const winSym = Math.floor(Math.random() * (SYMBOLS.length - 1)); // 0..5
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    grid[positions[0]] = winSym;
    grid[positions[1]] = winSym;
    grid[positions[2]] = winSym;
  }

  return grid;
}

function findWins(grid) {
  // Count occurrences of each symbol
  const counts = {};
  grid.forEach(s => { counts[s] = (counts[s] || 0) + 1; });

  let bestMult = 0;
  let bestSym = null;
  Object.entries(counts).forEach(([si, cnt]) => {
    const idx = Number(si);
    if (cnt >= 3 && SYMBOLS[idx].mult > 0) {
      if (SYMBOLS[idx].mult > bestMult) {
        bestMult = SYMBOLS[idx].mult;
        bestSym = idx;
      }
    }
  });
  return { mult: bestMult, symIdx: bestSym, counts };
}

const BET_OPTIONS = [500, 1000, 2500, 5000, 10000];

export default function ScratchCard() {
  useBanCheck('scratch-card');
  useGameActivity('scratch-card');
  const boost = useGameBoost('scratch-card');

  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet] = useState(1000);
  const [grid, setGrid] = useState(null);       // array of 9 symbol indices
  const [revealed, setRevealed] = useState([]); // set of revealed positions
  const [phase, setPhase] = useState('idle');   // idle | scratching | done
  const [result, setResult] = useState(null);   // { mult, symIdx, payout }

  useEffect(() => {
    const sync = () => setBalance(getBalance());
    window.addEventListener('focus', sync);
    window.addEventListener('balanceUpdate', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('balanceUpdate', sync);
    };
  }, []);

  const handleBuy = useCallback(() => {
    if (bet < 100 || bet > getBalance() || phase !== 'idle') return;

    subtractBalance(bet);
    setBalance(getBalance());

    // Rigged mode always loses
    const forced = !isRiggedMode() && Math.random() < 0.18; // 18% chance of guaranteed win
    const newGrid = generateGrid(forced);
    setGrid(newGrid);
    setRevealed([]);
    setResult(null);
    setPhase('scratching');
  }, [bet, phase]);

  const handleReveal = useCallback((idx) => {
    if (phase !== 'scratching' || revealed.includes(idx)) return;

    const newRevealed = [...revealed, idx];
    setRevealed(newRevealed);

    if (newRevealed.length === 9) {
      // All revealed — calculate result
      const { mult, symIdx } = findWins(grid);
      const payout = Math.floor(bet * mult * (boost || 1));
      if (payout > 0) {
        addBalance(payout);
        if (payout >= bet * 10) reportBigWin && reportBigWin(payout);
      }
      setBalance(getBalance());
      setResult({ mult, symIdx, payout });
      setPhase('done');
    }
  }, [phase, revealed, grid, bet, boost]);

  const revealAll = useCallback(() => {
    if (phase !== 'scratching') return;
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    setRevealed(all);
    const { mult, symIdx } = findWins(grid);
    const payout = Math.floor(bet * mult * (boost || 1));
    if (payout > 0) {
      addBalance(payout);
      if (payout >= bet * 10) reportBigWin && reportBigWin(payout);
    }
    setBalance(getBalance());
    setResult({ mult, symIdx, payout });
    setPhase('done');
  }, [phase, grid, bet, boost]);

  const resetGame = () => {
    setGrid(null);
    setRevealed([]);
    setResult(null);
    setPhase('idle');
  };

  const won = result && result.payout > 0;

  return (
    <div className="sc-page">
      <div className="sc-wrap">
        <h2 className="sc-title">🎟️ Scratch Card</h2>
        <p className="sc-sub">Reveal all tiles — match 3 symbols to win!</p>

        <div className="sc-balance">Balance: <strong>${balance.toLocaleString()}</strong></div>

        {/* Card area */}
        <div className={`sc-card ${phase === 'done' ? (won ? 'sc-card--win' : 'sc-card--lose') : ''}`}>
          {phase === 'idle' ? (
            <div className="sc-idle-msg">
              <span className="sc-idle-icon">🎟️</span>
              <span>Buy a card to start scratching!</span>
            </div>
          ) : (
            <>
              <div className="sc-grid">
                {grid.map((symIdx, i) => {
                  const isRevealed = revealed.includes(i);
                  const sym = SYMBOLS[symIdx];
                  const isWinner = result && result.symIdx === symIdx;
                  return (
                    <button
                      key={i}
                      className={`sc-tile ${isRevealed ? 'sc-tile--revealed' : 'sc-tile--hidden'} ${isRevealed && isWinner ? 'sc-tile--winner' : ''}`}
                      onClick={() => handleReveal(i)}
                      disabled={isRevealed || phase === 'done'}
                    >
                      {isRevealed ? (
                        <span className="sc-tile-sym">{sym.sym}</span>
                      ) : (
                        <span className="sc-tile-scratch">?</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {phase === 'scratching' && (
                <button className="sc-reveal-all-btn" onClick={revealAll}>
                  Reveal All
                </button>
              )}
            </>
          )}
        </div>

        {/* Result banner */}
        {phase === 'done' && result && (
          <div className={`sc-result ${won ? 'sc-result--win' : 'sc-result--lose'}`}>
            {won
              ? `🎉 ${SYMBOLS[result.symIdx].sym} ${SYMBOLS[result.symIdx].label} ×3 — Won $${result.payout.toLocaleString()}!`
              : '😔 No match — better luck next time!'}
          </div>
        )}

        {/* Bet selector */}
        <div className="sc-bet-section">
          <div className="sc-bet-label">Card Price</div>
          <div className="sc-bet-options">
            {BET_OPTIONS.map(b => (
              <button
                key={b}
                className={`sc-bet-opt ${bet === b ? 'sc-bet-opt--active' : ''}`}
                onClick={() => phase === 'idle' && setBet(b)}
                disabled={phase !== 'idle'}
              >
                ${b.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Paytable */}
        <div className="sc-paytable">
          <div className="sc-paytable-title">Paytable (3 of a kind)</div>
          <div className="sc-paytable-rows">
            {SYMBOLS.filter(s => s.mult > 0).map(s => (
              <div key={s.sym} className="sc-paytable-row">
                <span className="sc-pt-sym">{s.sym}{s.sym}{s.sym}</span>
                <span className="sc-pt-mult">{s.mult}×</span>
                <span className="sc-pt-payout">${(bet * s.mult).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action button */}
        <button
          className={`sc-action-btn ${phase === 'idle' && (bet > balance || bet < 100) ? 'sc-action-btn--disabled' : ''}`}
          onClick={phase === 'idle' ? handleBuy : phase === 'done' ? resetGame : undefined}
          disabled={phase === 'scratching' || (phase === 'idle' && (bet > balance || bet < 100))}
        >
          {phase === 'idle' ? `🎟️ Buy Card ($${bet.toLocaleString()})` : phase === 'done' ? '🔄 New Card' : '✋ Scratch the tiles!'}
        </button>

        {bet > balance && phase === 'idle' && <div className="sc-err">Insufficient balance</div>}
        {boost > 1 && (
          <div className="sc-boost">🔥 Boost active: {boost.toFixed(2)}× payouts</div>
        )}
      </div>
    </div>
  );
}
