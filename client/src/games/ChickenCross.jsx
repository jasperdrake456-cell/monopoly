import React, { useState, useEffect, useRef } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './ChickenCross.css';
import useBanCheck from '../hooks/useBanCheck';

const ROWS = 8;
const COLS = 5;
const HOUSE_EDGE = 0.99;

const DIFFICULTIES = {
  easy:   { cars: 1, rowMult: parseFloat(((COLS / (COLS - 1)) * HOUSE_EDGE).toFixed(4)), label: 'Easy',   emoji: '😌', color: '#22c55e' },
  medium: { cars: 2, rowMult: parseFloat(((COLS / (COLS - 2)) * HOUSE_EDGE).toFixed(4)), label: 'Medium', emoji: '😰', color: '#eab308' },
  hard:   { cars: 3, rowMult: parseFloat(((COLS / (COLS - 3)) * HOUSE_EDGE).toFixed(4)), label: 'Hard',   emoji: '💀', color: '#ef4444' },
};

function generateGrid(difficulty) {
  const { cars } = DIFFICULTIES[difficulty];
  return Array.from({ length: ROWS }, () => {
    const indices = [...Array(COLS).keys()];
    for (let i = COLS - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const carSet = new Set(indices.slice(0, cars));
    return Array.from({ length: COLS }, (_, c) => carSet.has(c));
  });
}

// cellStates[row][col]: 'hidden' | 'safe' | 'car' | 'car-dim'
function makeEmptyCells() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill('hidden'));
}

export default function ChickenCross() {
  const { banned, reason, expiresAt, loading } = useBanCheck('chicken-cross');
  const [balance, setBalance]       = useState(getBalance);
  const [bet, setBet]               = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [phase, setPhase]           = useState('betting'); // betting | playing | won | lost
  const [grid, setGrid]             = useState(null);
  const [cells, setCells]           = useState(null);      // cellStates
  const [currentRow, setCurrentRow] = useState(0);
  const [multiplier, setMultiplier] = useState(1.00);
  const [countdown, setCountdown]   = useState('');
  const [history, setHistory]       = useState([]);

  const betRef  = useRef(10);
  const multRef = useRef(1.00);
  const gridRef = useRef(null);

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

  function startGame() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();
    betRef.current  = bet;
    multRef.current = 1.00;

    const newGrid = generateGrid(difficulty);
    gridRef.current = newGrid;
    setGrid(newGrid);
    setCells(makeEmptyCells());
    setCurrentRow(0);
    setMultiplier(1.00);
    setPhase('playing');
  }

  function clickCell(row, col) {
    if (phase !== 'playing' || row !== currentRow) return;

    const isCar = gridRef.current[row][col];

    if (isCar) {
      // Bust — reveal this car + all hidden cars
      setCells(prev => {
        const next = prev.map(r => [...r]);
        next[row][col] = 'car';
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (gridRef.current[r][c] && next[r][c] === 'hidden') {
              next[r][c] = 'car-dim';
            }
          }
        }
        return next;
      });
      setPhase('lost');
      setHistory(h => [{ win: false, mult: null }, ...h].slice(0, 10));
    } else {
      // Safe — mark cell, update multiplier, advance row
      const { rowMult } = DIFFICULTIES[difficulty];
      const newMult = parseFloat((multRef.current * rowMult).toFixed(3));
      multRef.current = newMult;

      setCells(prev => {
        const next = prev.map(r => [...r]);
        next[row][col] = 'safe';
        return next;
      });
      setMultiplier(newMult);

      if (row + 1 >= ROWS) {
        // Crossed all rows — auto win
        const payout = Math.floor(betRef.current * newMult);
        addBalance(payout);
        syncBalance();
        setPhase('won');
        setHistory(h => [{ win: true, mult: newMult }, ...h].slice(0, 10));
      } else {
        setCurrentRow(row + 1);
      }
    }
  }

  function cashOut() {
    if (phase !== 'playing' || currentRow === 0) return;
    const payout = Math.floor(betRef.current * multRef.current);
    addBalance(payout);
    syncBalance();
    setPhase('won');
    setHistory(h => [{ win: true, mult: multRef.current }, ...h].slice(0, 10));
  }

  function reset() {
    setPhase('betting');
    setGrid(null);
    setCells(null);
    setCurrentRow(0);
    setMultiplier(1.00);
    multRef.current = 1.00;
    gridRef.current = null;
    syncBalance();
  }

  const balance_  = getBalance();
  const diff      = DIFFICULTIES[difficulty];
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const payout    = phase === 'playing' ? Math.floor(betRef.current * multiplier) : null;

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

  // Render grid — rows displayed top (row ROWS-1) to bottom (row 0)
  // Chicken is visually at the bottom, moves up as currentRow increases
  function renderGrid() {
    if (!cells) return null;
    const rows = [];
    for (let row = ROWS - 1; row >= 0; row--) {
      const isActive  = row === currentRow && phase === 'playing';
      const isCleared = row < currentRow;
      const isFuture  = row > currentRow;

      rows.push(
        <div
          key={row}
          className={[
            'cc-row',
            isActive  ? 'cc-row--active'  : '',
            isCleared ? 'cc-row--cleared' : '',
            isFuture  ? 'cc-row--future'  : '',
          ].join(' ')}
        >
          <div className="cc-row-label">{row + 1}</div>
          <div className="cc-cells">
            {Array.from({ length: COLS }, (_, col) => {
              const state = cells[row][col];
              const clickable = isActive && phase === 'playing';
              return (
                <button
                  key={col}
                  className={[
                    'cc-cell',
                    `cc-cell--${state}`,
                    clickable ? 'cc-cell--clickable' : '',
                  ].join(' ')}
                  onClick={() => clickCell(row, col)}
                  disabled={!clickable}
                >
                  {state === 'safe'    ? '✅' :
                   state === 'car'     ? '💥' :
                   state === 'car-dim' ? '🚗' :
                   isActive            ? '?' :
                   ''}
                </button>
              );
            })}
          </div>
          {/* Chicken on active row */}
          {isActive && phase === 'playing' && (
            <div className="cc-chicken">🐔</div>
          )}
          {isActive && phase === 'lost' && (
            <div className="cc-chicken cc-chicken--dead">💀</div>
          )}
          {/* Multiplier label on cleared rows */}
          {isCleared && (
            <div className="cc-row-mult-label">
              ×{parseFloat((Math.pow(diff.rowMult, currentRow)).toFixed(2))}
            </div>
          )}
        </div>
      );
    }
    return rows;
  }

  return (
    <div className="cc-wrap">
      <div className="cc-title">🐔 Chicken Cross</div>
      <div className="cc-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Round history */}
      <div className="cc-history">
        {history.map((h, i) => (
          <span key={i} className={`cc-pill ${h.win ? 'win' : 'lose'}`}>
            {h.win ? `${h.mult.toFixed(2)}×` : '💥'}
          </span>
        ))}
        {history.length === 0 && <span className="cc-hist-empty">No rounds yet</span>}
      </div>

      {/* ── BETTING PHASE ── */}
      {phase === 'betting' && (
        <div className="cc-betting">
          {balance_ < 1 ? (
            <div className="cc-broke">
              <div className="cc-broke-title">You're broke! 😬</div>
              <div className="cc-broke-sub">Hourly $1,000 arrives in</div>
              <div className="cc-broke-timer">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="cc-input-row">
                <div className="cc-field">
                  <label className="cc-label">Bet amount</label>
                  <input
                    className="cc-input"
                    type="number" min={1} max={balance_}
                    value={bet}
                    onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <div className="cc-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`cc-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`cc-qb ${bet === balance_ ? 'active' : ''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>

              <div className="cc-diff-group">
                <label className="cc-label">Difficulty</label>
                <div className="cc-diff-btns">
                  {Object.entries(DIFFICULTIES).map(([key, d]) => (
                    <button
                      key={key}
                      className={`cc-diff-btn ${difficulty === key ? 'active' : ''}`}
                      style={{ '--diff-color': d.color }}
                      onClick={() => setDifficulty(key)}
                    >
                      <span className="cc-diff-emoji">{d.emoji}</span>
                      <span className="cc-diff-label">{d.label}</span>
                      <span className="cc-diff-info">{d.cars} car{d.cars > 1 ? 's' : ''} · {d.rowMult.toFixed(2)}× per row</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-preview">
                Max payout (all {ROWS} rows): <strong>${Math.floor(bet * Math.pow(diff.rowMult, ROWS)).toLocaleString()}</strong>
              </div>

              <button className="cc-btn cc-btn--go" onClick={startGame}>
                🐔 Cross the Road!
              </button>
            </>
          )}
        </div>
      )}

      {/* ── PLAYING / RESULT PHASE ── */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost') && (
        <>
          {/* Multiplier display */}
          <div className={`cc-mult ${phase === 'lost' ? 'cc-mult--lost' : 'cc-mult--live'}`}>
            {phase === 'lost'
              ? '💥 BUSTED'
              : `${multiplier.toFixed(2)}×`}
          </div>

          {/* Cash out button while playing */}
          {phase === 'playing' && currentRow > 0 && (
            <button className="cc-btn cc-btn--cashout" onClick={cashOut}>
              💰 Cash Out ${payout}
            </button>
          )}
          {phase === 'playing' && currentRow === 0 && (
            <div className="cc-hint-row">Pick a cell to start crossing!</div>
          )}

          {/* Result banners */}
          {phase === 'won' && (
            <div className="cc-banner cc-banner--win">
              🎉 You won ${Math.floor(betRef.current * multiplier).toLocaleString()}!
            </div>
          )}
          {phase === 'lost' && (
            <div className="cc-banner cc-banner--lose">
              💥 Hit a car! Lost ${betRef.current}
            </div>
          )}

          {/* The grid */}
          <div className="cc-grid">
            {renderGrid()}
          </div>

          {/* Play again */}
          {(phase === 'won' || phase === 'lost') && (
            <button className="cc-btn cc-btn--go" onClick={reset}>
              🔄 Play Again
            </button>
          )}
        </>
      )}

      <div className="cc-footer-hint">
        Dodge the 🚗 cars row by row — cash out anytime! • 1% house edge
      </div>
    </div>
  );
}
