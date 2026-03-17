import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Tower.css';

// Tower: ROWS floors, each floor has COLS tiles.
// Per difficulty: number of bomb tiles per floor.
// Player picks one tile per floor. Must pick a safe tile to advance.
// Cash out anytime after clearing at least 1 floor.
// All RNG is resolved server-side equivalent: entire tower layout is decided at round start,
// stored in a ref — player cannot inspect it. No way to see tile contents before clicking.

const ROWS = 9;  // 9 floors (bottom = floor 0, top = floor 8)
const COLS = 3;  // 3 tiles per floor

const HOUSE_EDGE = 0.99;

const DIFFICULTIES = {
  easy:   { bombs: 1, label: 'Easy',   emoji: '😌', color: '#22c55e', rowMult: parseFloat(((COLS / (COLS - 1)) * HOUSE_EDGE).toFixed(4)) },
  medium: { bombs: 2, label: 'Medium', emoji: '😰', color: '#eab308', rowMult: parseFloat(((COLS / (COLS - 2)) * HOUSE_EDGE).toFixed(4)) },
  hard:   { bombs: 1, label: 'Hard',   emoji: '💀', color: '#ef4444', rowMult: parseFloat(((COLS / (COLS - 1)) * HOUSE_EDGE * 1.35).toFixed(4)) },
};

// Recalculate: easy=3/2*0.99=1.485, medium=3/1*0.99=2.97, hard=4+ tiers
// Redefine properly:
const DIFF_CONFIG = {
  easy:   { bombs: 1, label: 'Easy',   emoji: '😌', color: '#22c55e' },
  medium: { bombs: 2, label: 'Medium', emoji: '😰', color: '#eab308' },
  hard:   { bombs: 2, label: 'Hard',   emoji: '💀', color: '#ef4444', colsOverride: 3, bombsOverride: 2 },
};

// Row multiplier: safe_tiles/total_tiles probability inverted with house edge
function rowMultiplier(bombs) {
  const safe = COLS - bombs;
  return parseFloat(((COLS / safe) * HOUSE_EDGE).toFixed(4));
}

// Generate tower layout: array of ROWS floors, each floor is array of COLS booleans (true=bomb)
function generateTower(bombs) {
  const tower = [];
  for (let r = 0; r < ROWS; r++) {
    const floor = Array(COLS).fill(false);
    // Place bombs randomly
    const positions = [...Array(COLS).keys()];
    for (let b = 0; b < bombs; b++) {
      const idx = Math.floor(Math.random() * positions.length);
      floor[positions[idx]] = true;
      positions.splice(idx, 1);
    }
    tower.push(floor);
  }
  return tower;
}

// Cell states: 'hidden' | 'safe' | 'bomb' | 'bomb-dim' | 'missed-safe'
const MAX_HISTORY = 8;

export default function Tower() {
  const [balance, setBalance]       = useState(getBalance);
  const [bet, setBet]               = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [phase, setPhase]           = useState('betting'); // betting | playing | won | lost
  const [tower, setTower]           = useState(null); // 2D array of bools
  const [cellStates, setCellStates] = useState(null); // 2D array of state strings
  const [currentFloor, setCurrentFloor] = useState(0); // next floor to pick
  const [currentMult, setCurrentMult]   = useState(1.00);
  const [history, setHistory]       = useState([]);
  const [countdown, setCountdown]   = useState('');

  useEffect(() => {
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

  const diff = DIFF_CONFIG[difficulty];
  const rowMult = rowMultiplier(diff.bombs);

  function startGame() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();

    const newTower = generateTower(diff.bombs);
    const initStates = newTower.map(floor => floor.map(() => 'hidden'));

    setTower(newTower);
    setCellStates(initStates);
    setCurrentFloor(0);
    setCurrentMult(1.00);
    setPhase('playing');
  }

  function pickTile(floor, col) {
    if (phase !== 'playing') return;
    if (floor !== currentFloor) return; // can only pick active floor
    const isBomb = tower[floor][col];

    const newStates = cellStates.map(r => [...r]);

    if (isBomb) {
      // Reveal the bomb they hit
      newStates[floor][col] = 'bomb';
      // Reveal all other bombs on all floors (dimmed)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (r === floor && c === col) continue;
          if (tower[r][c]) {
            newStates[r][c] = 'bomb-dim';
          }
        }
      }
      setCellStates(newStates);
      setPhase('lost');
      setHistory(h => [{ win: false, floors: floor, mult: currentMult }, ...h].slice(0, MAX_HISTORY));
      syncBalance();
    } else {
      // Safe tile
      newStates[floor][col] = 'safe';
      const newMult = parseFloat((currentMult * rowMult).toFixed(4));
      setCurrentMult(newMult);

      const nextFloor = floor + 1;
      if (nextFloor >= ROWS) {
        // Cleared all floors — auto cash out
        setCellStates(newStates);
        setCurrentFloor(nextFloor);
        doWin(newMult, newStates);
      } else {
        setCurrentFloor(nextFloor);
        setCellStates(newStates);
      }
    }
  }

  function doWin(mult, states) {
    const payout = Math.floor(bet * mult);
    addBalance(payout);
    syncBalance();
    setPhase('won');
    setHistory(h => [{ win: true, floors: ROWS, mult }, ...h].slice(0, MAX_HISTORY));
  }

  function cashOut() {
    if (phase !== 'playing' || currentFloor === 0) return;
    const payout = Math.floor(bet * currentMult);
    addBalance(payout);
    syncBalance();
    // Reveal safe tiles on remaining floors
    const newStates = cellStates.map(r => [...r]);
    setPhase('won');
    setCellStates(newStates);
    setHistory(h => [{ win: true, floors: currentFloor, mult: currentMult }, ...h].slice(0, MAX_HISTORY));
  }

  function reset() {
    setPhase('betting');
    setTower(null);
    setCellStates(null);
    setCurrentFloor(0);
    setCurrentMult(1.00);
    syncBalance();
  }

  const bal = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= bal);

  // Render floors top-to-bottom (floor ROWS-1 at top, floor 0 at bottom)
  const floorsToRender = [...Array(ROWS).keys()].reverse();

  return (
    <div className="tower-table">
      <div className="tower-title">🗼 Tower</div>
      <div className="tower-balance">💰 Balance: <strong>${bal.toLocaleString()}</strong></div>

      {/* History */}
      <div className="tower-history">
        {history.map((h, i) => (
          <span key={i} className={`tower-hist-pill ${h.win ? 'win' : 'lose'}`}>
            {h.win ? `${h.floors}F ${h.mult.toFixed(2)}×` : `✗`}
          </span>
        ))}
        {history.length === 0 && <span className="tower-hist-empty">No rounds yet</span>}
      </div>

      {/* Multiplier + cashout during play */}
      {phase === 'playing' && (
        <div className="tower-play-header">
          <div className="tower-mult-info">
            <span className="tower-mult-label">Multiplier</span>
            <span className="tower-mult-val">{currentMult.toFixed(2)}×</span>
          </div>
          <button
            className="tower-cashout-btn"
            onClick={cashOut}
            disabled={currentFloor === 0}
          >
            💰 Cash Out ${Math.floor(bet * currentMult)}
          </button>
        </div>
      )}

      {/* Tower grid */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost') && cellStates && (
        <div className="tower-grid">
          {floorsToRender.map(floor => {
            const isActive = phase === 'playing' && floor === currentFloor;
            const isCleared = floor < currentFloor;
            const isPending = floor > currentFloor;

            return (
              <div key={floor} className={`tower-floor ${isActive ? 'tower-floor--active' : ''} ${isCleared ? 'tower-floor--cleared' : ''}`}>
                <div className="tower-floor-label">
                  {isCleared ? '✓' : `F${floor + 1}`}
                </div>
                <div className="tower-cells">
                  {Array(COLS).fill(0).map((_, col) => {
                    const state = cellStates[floor][col];
                    return (
                      <button
                        key={col}
                        className={`tower-cell tower-cell--${state} ${isActive ? 'tower-cell--clickable' : ''}`}
                        onClick={() => pickTile(floor, col)}
                        disabled={!isActive || state !== 'hidden'}
                      >
                        {state === 'safe'     ? '💎' :
                         state === 'bomb'     ? '💣' :
                         state === 'bomb-dim' ? '💣' :
                         isActive ? '?' : isPending ? '·' : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="tower-floor-mult">
                  {isCleared ? '' : `${(Math.pow(rowMult, floor + 1)).toFixed(2)}×`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Won / Lost result */}
      {phase === 'won' && (
        <div className="tower-result tower-result--win">
          <div>🎉 Cashed Out!</div>
          <div>+${Math.floor(bet * currentMult) - bet} at {currentMult.toFixed(2)}×</div>
          <button className="tower-btn tower-btn--start" onClick={reset}>🔄 Play Again</button>
        </div>
      )}
      {phase === 'lost' && (
        <div className="tower-result tower-result--lose">
          <div>💣 Bombed Out!</div>
          <div>Lost ${bet}</div>
          <button className="tower-btn tower-btn--start" onClick={reset}>🔄 Try Again</button>
        </div>
      )}

      {/* Betting phase */}
      {phase === 'betting' && (
        <div className="tower-betting">
          {bal < 1 ? (
            <div className="tower-broke">
              <div className="tower-broke-title">You're broke! 😬</div>
              <div className="tower-broke-sub">Your daily $250 arrives in</div>
              <div className="tower-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              {/* Difficulty */}
              <div className="tower-diff-row">
                {Object.entries(DIFF_CONFIG).map(([key, d]) => (
                  <button
                    key={key}
                    className={`tower-diff-btn ${difficulty === key ? 'active' : ''}`}
                    style={difficulty === key ? { borderColor: d.color, background: `${d.color}22` } : {}}
                    onClick={() => setDifficulty(key)}
                  >
                    {d.emoji} {d.label}
                    <span className="tower-diff-mult">{rowMultiplier(d.bombs).toFixed(2)}×/floor</span>
                  </button>
                ))}
              </div>

              <div className="tower-input-group">
                <label className="tower-label">Bet Amount</label>
                <input
                  className="tower-input"
                  type="number" min={1} max={bal}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(bal, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="tower-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`tower-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`tower-qb ${bet === bal ? 'active' : ''}`} onClick={() => setBet(bal)}>All In</button>
              </div>
              <button className="tower-btn tower-btn--start" onClick={startGame}>
                🗼 Climb!
              </button>
            </>
          )}
        </div>
      )}

      <div className="tower-hint">Pick a safe tile each floor • {DIFF_CONFIG[difficulty].bombs} bomb{DIFF_CONFIG[difficulty].bombs > 1 ? 's' : ''} per floor • Cash out anytime after floor 1</div>
    </div>
  );
}
