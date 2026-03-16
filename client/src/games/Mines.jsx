import React, { useState, useCallback } from 'react';
import { getBalance, addBalance, subtractBalance } from '../utils/casinoBalance';
import './Mines.css';

// ── Mines game (Rainbet-style) ────────────────────────────────────────────────
// Grid: 5×5 = 25 tiles. Player picks mines count (1–24).
// Each safe tile revealed multiplies their cashout value.
// Hit a mine = lose bet. Cash out any time after first gem.

const GRID_SIZE = 25;

// Multiplier table: computed as fair-odds with house edge
function calcMultiplier(mines, revealed) {
  // Probability of hitting N safe tiles in a row given M mines in 25 tiles
  // = product(i=0..N-1) of (25 - mines - i) / (25 - i)
  // Payout = 1 / probability * 0.97 (3% house edge)
  let prob = 1;
  for (let i = 0; i < revealed; i++) {
    prob *= (GRID_SIZE - mines - i) / (GRID_SIZE - i);
  }
  if (prob <= 0) return 0;
  return parseFloat((0.97 / prob).toFixed(2));
}

function generateMines(count, avoidIndex) {
  const positions = new Set();
  while (positions.size < count) {
    const idx = Math.floor(Math.random() * GRID_SIZE);
    if (idx !== avoidIndex) positions.add(idx);
  }
  return positions;
}

const MINE_COUNTS = [1, 2, 3, 5, 7, 10, 15, 20, 24];

export default function Mines() {
  const [balance, setBalance]   = useState(getBalance);
  const [bet, setBet]           = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [phase, setPhase]       = useState('betting'); // betting | playing | result
  const [mines, setMines]       = useState(new Set());
  const [revealed, setRevealed] = useState(new Set()); // safe tiles revealed
  const [exploded, setExploded] = useState(null); // index of mine hit
  const [allMines, setAllMines] = useState(new Set()); // shown after game ends
  const [revealedCount, setRevealedCount] = useState(0);
  const [result, setResult]     = useState(null); // { win, payout, msg }

  function syncBalance() { setBalance(getBalance()); }

  function startGame() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();
    setMines(new Set()); // mines placed on first click
    setRevealed(new Set());
    setExploded(null);
    setAllMines(new Set());
    setRevealedCount(0);
    setResult(null);
    setPhase('playing');
  }

  function handleTileClick(idx) {
    if (phase !== 'playing') return;
    if (revealed.has(idx)) return;

    let activeMines = mines;

    // First click: place mines avoiding the clicked tile
    if (mines.size === 0) {
      activeMines = generateMines(mineCount, idx);
      setMines(activeMines);
    }

    if (activeMines.has(idx)) {
      // BOOM!
      setExploded(idx);
      setAllMines(activeMines);
      setResult({ win: false, payout: 0, msg: `💥 BOOM! Lost $${bet}` });
      setPhase('result');
    } else {
      const newRevealed = new Set(revealed);
      newRevealed.add(idx);
      const newCount = revealedCount + 1;
      setRevealed(newRevealed);
      setRevealedCount(newCount);

      // Auto-win if all safe tiles revealed
      const safeCount = GRID_SIZE - mineCount;
      if (newCount >= safeCount) {
        const mult = calcMultiplier(mineCount, newCount);
        const payout = Math.floor(bet * mult);
        addBalance(payout);
        syncBalance();
        setAllMines(activeMines);
        setResult({ win: true, payout, msg: `🏆 All safe tiles! Won $${payout}` });
        setPhase('result');
      }
    }
  }

  function cashOut() {
    if (phase !== 'playing' || revealedCount === 0) return;
    const mult = calcMultiplier(mineCount, revealedCount);
    const payout = Math.floor(bet * mult);
    addBalance(payout);
    syncBalance();
    setAllMines(mines);
    setResult({ win: true, payout, msg: `💎 Cashed out $${payout} (${mult}×)` });
    setPhase('result');
  }

  const balance_ = getBalance();
  const currentMult = revealedCount > 0 ? calcMultiplier(mineCount, revealedCount) : 1;
  const nextMult = calcMultiplier(mineCount, revealedCount + 1);
  const potentialCashout = Math.floor(bet * currentMult);
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);

  function getTileState(idx) {
    if (exploded === idx) return 'exploded';
    if (allMines.has(idx) && phase === 'result') return 'mine';
    if (revealed.has(idx)) return 'gem';
    return 'hidden';
  }

  return (
    <div className="mines-table">
      <div className="mines-title">💣 Mines</div>
      <div className="mines-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Grid */}
      <div className="mines-grid">
        {Array.from({ length: GRID_SIZE }, (_, i) => {
          const state = getTileState(i);
          const clickable = phase === 'playing' && state === 'hidden';
          return (
            <button
              key={i}
              className={`mines-tile mines-tile--${state} ${clickable ? 'mines-tile--clickable' : ''}`}
              onClick={() => handleTileClick(i)}
              disabled={!clickable}
            >
              {state === 'gem'      && <span className="mines-gem">💎</span>}
              {state === 'mine'     && <span className="mines-bomb">💣</span>}
              {state === 'exploded' && <span className="mines-boom">💥</span>}
              {state === 'hidden'   && phase === 'playing' && (
                <span className="mines-next-mult">
                  {revealedCount === 0 ? '' : `${nextMult}×`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {result && (
        <div className={`mines-result ${result.win ? 'win' : 'lose'}`}>
          {result.msg}
        </div>
      )}

      {/* Playing controls */}
      {phase === 'playing' && (
        <div className="mines-playing-info">
          <div className="mines-stat">
            <span>Revealed:</span>
            <strong>{revealedCount} / {GRID_SIZE - mineCount}</strong>
          </div>
          <div className="mines-stat">
            <span>Multiplier:</span>
            <strong className="mines-mult">{currentMult}×</strong>
          </div>
          <div className="mines-stat">
            <span>Cashout:</span>
            <strong className="mines-cashout">${potentialCashout}</strong>
          </div>
          {revealedCount > 0 && (
            <button className="mines-cashout-btn" onClick={cashOut}>
              💰 Cash Out ${potentialCashout}
            </button>
          )}
        </div>
      )}

      {/* Betting UI */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="mines-betting">
          {balance_ < 1 ? (
            <div className="mines-broke">
              <div>You're broke! 😬</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Come back tomorrow for your $250!</div>
            </div>
          ) : (
            <>
              {/* Mine count selector */}
              <div className="mines-config">
                <div className="mines-config-label">💣 Mines</div>
                <div className="mines-count-btns">
                  {MINE_COUNTS.map(n => (
                    <button
                      key={n}
                      className={`mines-count-btn ${mineCount === n ? 'selected' : ''}`}
                      onClick={() => setMineCount(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              {/* Bet */}
              <div className="mines-bet-row">
                <span>Bet:</span>
                <input
                  className="mines-bet-input"
                  type="number" min={1} max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
                />
              </div>
              <div className="mines-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`mines-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`mines-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>

              {/* First gem multiplier preview */}
              <div className="mines-preview-row">
                <span>First gem payout:</span>
                <strong>{calcMultiplier(mineCount, 1)}× (${Math.floor(bet * calcMultiplier(mineCount, 1))})</strong>
              </div>

              <button className="mines-start-btn" onClick={startGame}>
                {phase === 'result' ? '🔄 Play Again' : '💣 Start Game'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="mines-hint">{GRID_SIZE - mineCount} safe tiles · {mineCount} mines · 3% house edge</div>
    </div>
  );
}
