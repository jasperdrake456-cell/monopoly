import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin, isRiggedMode, recordBetResult } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import './Mines.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// ── Mines game (Rainbet-style) ────────────────────────────────────────────────
// Grid: 5×5 = 25 tiles. Player picks mines count (1–24).
// Each safe tile revealed multiplies their cashout value.
// Hit a mine = lose bet. Cash out any time after first gem.

const GRID_SIZE = 25;

// Multiplier table: computed as fair-odds with house edge
function calcMultiplier(mines, revealed) {
  // Probability of hitting N safe tiles in a row given M mines in 25 tiles
  // = product(i=0..N-1) of (25 - mines - i) / (25 - i)
  // Payout = 1 / probability * 0.96 (4% house edge)
  let prob = 1;
  for (let i = 0; i < revealed; i++) {
    prob *= (GRID_SIZE - mines - i) / (GRID_SIZE - i);
  }
  if (prob <= 0) return 0;
  return parseFloat((0.96 / prob).toFixed(2));
}

function generateMines(count) {
  const positions = new Set();
  while (positions.size < count) {
    positions.add(Math.floor(Math.random() * GRID_SIZE));
  }
  return positions;
}

const MINE_COUNTS = [1, 2, 3, 5, 7, 10, 15, 20, 24];

export default function Mines() {
  const { banned, reason, expiresAt, loading } = useBanCheck('mines');
  useGameActivity('mines');
  const boost = useGameBoost('mines');
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
  const [countdown, setCountdown] = useState('');

  // Refs to prevent race condition on rapid clicks — React state is async,
  // so two clicks before re-render both see stale values. Refs update immediately.
  const minesRef    = useRef(new Set()); // synchronous mine map
  const playingRef  = useRef(false);     // blocks clicks after terminal state
  const revealedRef = useRef(new Set()); // synchronous mirror of revealed set
  const revCountRef = useRef(0);         // synchronous mirror of revealedCount

  // Live countdown to next daily reward
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
    initJokerBonuses();
    return () => clearInterval(id);
  }, []);

  function syncBalance() { setBalance(getBalance()); }

  function startGame() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();
    minesRef.current   = new Set(); // reset synchronous mine map
    revealedRef.current = new Set(); // reset synchronous revealed set
    revCountRef.current = 0;
    playingRef.current = true;
    setMines(new Set()); // mines placed on first click
    setRevealed(new Set());
    setExploded(null);
    setAllMines(new Set());
    setRevealedCount(0);
    setResult(null);
    setPhase('playing');
  }

  function handleTileClick(idx) {
    // Use refs instead of state — prevents race condition on rapid clicks
    // (React state updates are batched; refs are synchronous)
    if (!playingRef.current) return;
    if (revealedRef.current.has(idx)) return; // use ref, not stale state

    let activeMines = minesRef.current;

    // First click: place mines (synchronously stored in ref to block re-rolls)
    if (activeMines.size === 0) {
      if (isRiggedMode()) {
        // Rigged: every tile is a mine — first click always explodes
        activeMines = new Set(Array.from({ length: GRID_SIZE }, (_, i) => i));
      } else {
        activeMines = generateMines(mineCount);
      }
      minesRef.current = activeMines; // update ref immediately (synchronous)
      setMines(activeMines);          // update state for rendering
    }

    if (activeMines.has(idx)) {
      // BOOM!
      playingRef.current = false; // block any further clicks immediately
      setExploded(idx);
      setAllMines(activeMines);
      setResult({ win: false, payout: 0, msg: `💥 BOOM! Lost $${bet}` });
      setPhase('result');
      recordBetResult({ game: 'mines', amount: bet, won: false, multiplier: 1, profit: -bet });
      applyJokerBonus(bet, 0, false);
    } else {
      // Update refs synchronously so rapid subsequent clicks see correct state
      revealedRef.current = new Set(revealedRef.current);
      revealedRef.current.add(idx);
      revCountRef.current += 1;
      const newCount = revCountRef.current;

      // Update React state for rendering
      setRevealed(new Set(revealedRef.current));
      setRevealedCount(newCount);

      // Auto-win if all safe tiles revealed
      const safeCount = GRID_SIZE - mineCount;
      if (newCount >= safeCount) {
        playingRef.current = false; // block any further clicks immediately
        const mult = calcMultiplier(mineCount, newCount);
        const payout = Math.floor(bet * mult * boost);
        addBalance(payout);
        applyJokerBonus(bet, payout, true);
        syncBalance();
        reportBigWin('mines', bet, payout, mult, `${mineCount} mines · all ${newCount} safe tiles revealed · ${mult}×`);
        setAllMines(activeMines);
        setResult({ win: true, payout, msg: `🏆 All safe tiles! Won $${payout}` });
        setPhase('result');
        recordBetResult({ game: 'mines', amount: bet, won: true, multiplier: mult, profit: payout - bet });
      }
    }
  }

  function cashOut() {
    if (!playingRef.current || revCountRef.current === 0) return;
    playingRef.current = false;
    const mult = calcMultiplier(mineCount, revCountRef.current);
    const payout = Math.floor(bet * mult * boost);
    addBalance(payout);
    applyJokerBonus(bet, payout, true);
    syncBalance();
    reportBigWin('mines', bet, payout, mult, `${mineCount} mines · ${revCountRef.current} safe tiles revealed · ${mult}×`);
    setAllMines(minesRef.current);
    setResult({ win: true, payout, msg: `💎 Cashed out $${payout} (${mult}×)` });
    setPhase('result');
    recordBetResult({ game: 'mines', amount: bet, won: true, multiplier: mult, profit: payout - bet });
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
              <div className="mines-broke-title">You're broke! 😬</div>
              <div className="mines-broke-sub">Your hourly $1,000 arrives in</div>
              <div className="mines-broke-countdown">{countdown}</div>
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

      <div className="mines-hint">{GRID_SIZE - mineCount} safe tiles · {mineCount} mines · 7% house edge</div>
    </div>
  );
}
