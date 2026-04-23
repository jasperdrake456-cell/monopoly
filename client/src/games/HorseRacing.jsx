import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getBalance, addBalance, subtractBalance } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import './HorseRacing.css';

// ── Horse definitions ─────────────────────────────────────────────────────────
// winProb: true race win probability (these sum to 1.0).
// odds: American odds offered — slightly worse than fair to give house ~12% edge.
const HORSES = [
  { id: 1, name: 'Thunder Bolt',  odds: +150, winProb: 0.35, color: '#f59e0b', jockey: '🏇' },
  { id: 2, name: 'Silver Arrow',  odds: +350, winProb: 0.20, color: '#6366f1', jockey: '🏇' },
  { id: 3, name: 'Dark Knight',   odds: +500, winProb: 0.15, color: '#8b5cf6', jockey: '🏇' },
  { id: 4, name: 'Morning Glory', odds: +575, winProb: 0.13, color: '#ec4899', jockey: '🏇' },
  { id: 5, name: 'Desert Wind',   odds: +800, winProb: 0.10, color: '#14b8a6', jockey: '🏇' },
  { id: 6, name: 'Golden Stride', odds: +1200, winProb: 0.07, color: '#f87171', jockey: '🏇' },
];

// Normalize win probs to sum to 1.0
const TOTAL_PROB = HORSES.reduce((s, h) => s + h.winProb, 0);
const HORSES_NORM = HORSES.map(h => ({ ...h, winProb: h.winProb / TOTAL_PROB }));

const BET_OPTIONS = [100, 250, 500, 1000, 2500, 5000, 10000];
const RACE_DURATION_MS = 12000; // 12 seconds of animation
const TRACK_WIDTH_PCT = 90; // horses travel to 90% of container width

function fmtOdds(o) {
  return o > 0 ? `+${o}` : `${o}`;
}

function calcPayout(amount, odds) {
  if (!amount || !odds) return 0;
  const amt = parseFloat(amount) || 0;
  if (odds > 0) return Math.floor(amt + amt * (odds / 100));
  return Math.floor(amt + amt * (100 / Math.abs(odds)));
}

// Pick a winner weighted by winProb
function pickWinner() {
  const r = Math.random();
  let cum = 0;
  for (const h of HORSES_NORM) {
    cum += h.winProb;
    if (r <= cum) return h;
  }
  return HORSES_NORM[HORSES_NORM.length - 1];
}

// Generate per-horse race progress as array of keyframe percentages (0→TRACK_WIDTH_PCT)
// The winner always ends at TRACK_WIDTH_PCT; losers end slightly behind.
function generateRaceProgression(winnerId) {
  const progressions = {};
  for (const h of HORSES_NORM) {
    const isWinner = h.id === winnerId;
    // base speed: winner's final pos = TRACK_WIDTH_PCT; others get random offset
    const finalPos = isWinner ? TRACK_WIDTH_PCT : TRACK_WIDTH_PCT - (Math.random() * 8 + 1);
    // Create keyframes at 0%, 25%, 50%, 75%, 100% of race time
    const pts = [0];
    let current = 0;
    for (let step = 1; step <= 3; step++) {
      // Add some randomness to create passing / falling behind moments
      const advance = (finalPos / 4) * (0.75 + Math.random() * 0.5);
      current = Math.min(current + advance, isWinner ? TRACK_WIDTH_PCT - 5 : finalPos - 1);
      pts.push(current);
    }
    pts.push(finalPos);
    progressions[h.id] = pts;
  }
  return progressions;
}

// STATE MACHINE: 'betting' | 'countdown' | 'racing' | 'result'

export default function HorseRacing() {
  const [balance,    setBalance]    = useState(getBalance);
  const [phase,      setPhase]      = useState('betting'); // betting | countdown | racing | result
  const [selectedId, setSelectedId] = useState(null);
  const [bet,        setBet]        = useState(500);
  const [errMsg,     setErrMsg]     = useState('');
  const [countdown,  setCountdown]  = useState(3);
  const [horsePcts,  setHorsePcts]  = useState(() => Object.fromEntries(HORSES.map(h => [h.id, 0])));
  const [winner,     setWinner]     = useState(null);
  const [payout,     setPayout]     = useState(0);

  const raceTimer   = useRef(null);
  const animFrames  = useRef(null);
  const startTimeRef = useRef(null);
  const progressRef  = useRef({});

  function syncBalance() { setBalance(getBalance()); }

  function selectHorse(id) {
    if (phase !== 'betting') return;
    setSelectedId(prev => prev === id ? null : id);
    setErrMsg('');
  }

  function startRace() {
    if (!selectedId) return setErrMsg('Select a horse first!');
    if (bet <= 0)     return setErrMsg('Bet must be greater than 0');
    if (bet > getBalance()) return setErrMsg('Insufficient balance');

    subtractBalance(bet);
    syncBalance();
    setErrMsg('');

    // Countdown phase
    setPhase('countdown');
    setCountdown(3);
    let c = 3;
    const cdInterval = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(cdInterval);
        beginRace();
      } else {
        setCountdown(c);
      }
    }, 1000);
  }

  function beginRace() {
    const winnerHorse = pickWinner();
    const progressions = generateRaceProgression(winnerHorse.id);
    progressRef.current = progressions;

    setPhase('racing');
    startTimeRef.current = performance.now();

    function animate(now) {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / RACE_DURATION_MS, 1);
      // Easing: ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      // Interpolate between keyframes
      const newPcts = {};
      for (const h of HORSES_NORM) {
        const pts = progressRef.current[h.id];
        // pts has 5 points for 4 segments (0-25, 25-50, 50-75, 75-100)
        const segCount = pts.length - 1;
        const segF = eased * segCount;
        const segIdx = Math.min(Math.floor(segF), segCount - 1);
        const segT = segF - segIdx;
        newPcts[h.id] = pts[segIdx] + (pts[segIdx + 1] - pts[segIdx]) * segT;
      }
      setHorsePcts({ ...newPcts });

      if (t < 1) {
        animFrames.current = requestAnimationFrame(animate);
      } else {
        // Race finished
        setHorsePcts(Object.fromEntries(HORSES.map(h => [h.id, progressRef.current[h.id].at(-1)])));
        finishRace(winnerHorse);
      }
    }

    animFrames.current = requestAnimationFrame(animate);
  }

  function finishRace(winnerHorse) {
    const selected = HORSES.find(h => h.id === selectedId);
    const won = selected && selected.id === winnerHorse.id;
    const p = won ? calcPayout(bet, selected.odds) : 0;
    if (won) {
      addBalance(p);
      applyJokerBonus(bet, p, true);
    } else {
      applyJokerBonus(bet, 0, false);
    }
    syncBalance();
    setWinner(winnerHorse);
    setPayout(p);
    setPhase('result');
  }

  function playAgain() {
    if (animFrames.current) cancelAnimationFrame(animFrames.current);
    setPhase('betting');
    setWinner(null);
    setPayout(0);
    setSelectedId(null);
    setHorsePcts(Object.fromEntries(HORSES.map(h => [h.id, 0])));
    setErrMsg('');
    syncBalance();
  }

  useEffect(() => {
    initJokerBonuses();
    return () => {
      if (animFrames.current) cancelAnimationFrame(animFrames.current);
      clearInterval(raceTimer.current);
    };
  }, []);

  const selectedHorse = HORSES.find(h => h.id === selectedId);

  return (
    <div className="hr-root">
      <div className="hr-header">
        <div className="hr-header-left">
          <span className="hr-logo">🏇</span>
          <div>
            <div className="hr-title">Horse Racing</div>
            <div className="hr-subtitle">Pick your horse · Place your wager · Watch the race</div>
          </div>
        </div>
        <div className="hr-balance">💰 ${balance.toLocaleString()}</div>
      </div>

      {/* ── Track ──────────────────────────────────────────────── */}
      <div className="hr-track-container">
        {phase === 'countdown' && (
          <div className="hr-countdown-overlay">
            <div className="hr-countdown-num">{countdown}</div>
          </div>
        )}
        {phase === 'result' && (
          <div className="hr-result-overlay">
            <div className="hr-result-winner-badge">
              🏆 {winner.name} wins!
            </div>
          </div>
        )}
        <div className="hr-track">
          {HORSES_NORM.map((horse, idx) => {
            const pct = horsePcts[horse.id] || 0;
            const isWinner = winner?.id === horse.id;
            const isSelected = selectedId === horse.id;
            return (
              <div key={horse.id} className={`hr-lane ${isWinner ? 'hr-lane--winner' : ''}`}>
                <div className="hr-lane-num">{idx + 1}</div>
                <div className="hr-lane-track">
                  <div
                    className={`hr-horse ${isSelected ? 'hr-horse--selected' : ''} ${isWinner ? 'hr-horse--winner' : ''} ${phase === 'racing' ? 'hr-horse--running' : ''}`}
                    style={{ left: `${pct}%` }}
                  >
                    {horse.jockey}
                  </div>
                  {/* Finish line */}
                  <div className="hr-finish-line" />
                </div>
                <div className="hr-lane-name">{horse.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Horse selection (betting phase) ─────────────────────── */}
      {phase === 'betting' && (
        <div className="hr-betting-panel">
          <div className="hr-section-title">Select a Horse</div>
          <div className="hr-horse-grid">
            {HORSES.map(horse => (
              <button
                key={horse.id}
                className={`hr-horse-card ${selectedId === horse.id ? 'hr-horse-card--selected' : ''}`}
                onClick={() => selectHorse(horse.id)}
                style={{ '--horse-color': horse.color }}
              >
                <div className="hr-horse-num" style={{ color: horse.color }}>#{horse.id}</div>
                <div className="hr-horse-emoji">{horse.jockey}</div>
                <div className="hr-horse-name">{horse.name}</div>
                <div className="hr-horse-odds" style={{ color: '#22c55e' }}>
                  {fmtOdds(horse.odds)}
                </div>
                <div className="hr-horse-payout-preview" style={{ opacity: selectedId === horse.id ? 1 : 0.5 }}>
                  Win ${calcPayout(bet, horse.odds).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          <div className="hr-bet-section">
            <div className="hr-section-title">Wager Amount</div>
            <div className="hr-bet-options">
              {BET_OPTIONS.map(v => (
                <button
                  key={v}
                  className={`hr-bet-opt ${bet === v ? 'hr-bet-opt--active' : ''}`}
                  onClick={() => { setBet(v); setErrMsg(''); }}
                  disabled={v > balance}
                >
                  ${v.toLocaleString()}
                </button>
              ))}
            </div>
            <div className="hr-custom-bet-row">
              <span className="hr-dollar">$</span>
              <input
                type="number"
                className="hr-custom-bet-input"
                value={bet}
                min={1}
                max={balance}
                onChange={e => { setBet(Math.max(1, Math.floor(Number(e.target.value) || 1))); setErrMsg(''); }}
              />
            </div>
          </div>

          {selectedHorse && (
            <div className="hr-slip-preview">
              <span>{selectedHorse.name}</span>
              <span className="hr-slip-odds">{fmtOdds(selectedHorse.odds)}</span>
              <span>· Wager ${bet.toLocaleString()}</span>
              <span className="hr-slip-payout">→ Win ${calcPayout(bet, selectedHorse.odds).toLocaleString()}</span>
            </div>
          )}

          {errMsg && <div className="hr-err">{errMsg}</div>}

          <button
            className="hr-go-btn"
            onClick={startRace}
            disabled={!selectedId || bet <= 0 || bet > balance}
          >
            🏁 Start Race · ${bet.toLocaleString()}
          </button>
        </div>
      )}

      {/* ── Racing phase message ─────────────────────────────────── */}
      {phase === 'racing' && (
        <div className="hr-racing-msg">
          <div className="hr-racing-spinner" />
          Race in progress… Go <strong>{selectedHorse?.name}</strong>!
        </div>
      )}

      {/* ── Result panel ────────────────────────────────────────── */}
      {phase === 'result' && (
        <div className="hr-result-panel">
          {payout > 0 ? (
            <div className="hr-result-win">
              <div className="hr-result-win-title">You Won! 🎉</div>
              <div className="hr-result-win-amount">+${payout.toLocaleString()}</div>
              <div className="hr-result-win-detail">
                {selectedHorse.name} · {fmtOdds(selectedHorse.odds)} · ${bet.toLocaleString()} wagered
              </div>
            </div>
          ) : (
            <div className="hr-result-lose">
              <div className="hr-result-lose-title">Better Luck Next Time</div>
              <div className="hr-result-lose-detail">
                {winner.name} won the race. You picked {selectedHorse?.name}.
              </div>
              <div className="hr-result-lose-amount">-${bet.toLocaleString()}</div>
            </div>
          )}

          <div className="hr-finishing-order">
            <div className="hr-section-title" style={{ marginBottom: 8 }}>Race Results</div>
            {HORSES.map(h => {
              const finalPct = horsePcts[h.id] || 0;
              return { ...h, finalPct };
            })
              .sort((a, b) => b.finalPct - a.finalPct)
              .map((h, i) => (
                <div key={h.id} className={`hr-finish-row ${h.id === winner?.id ? 'hr-finish-row--winner' : ''}`}>
                  <span className="hr-finish-place">#{i + 1}</span>
                  <span className="hr-finish-name">{h.name}</span>
                  <span className="hr-finish-odds">{fmtOdds(h.odds)}</span>
                </div>
              ))}
          </div>

          <button className="hr-go-btn" onClick={playAgain}>
            🔄 Play Again
          </button>
        </div>
      )}

      {/* ── Odds table (always visible when betting) ──────────────── */}
      {phase === 'betting' && (
        <div className="hr-odds-table">
          <div className="hr-section-title">Odds Board</div>
          <div className="hr-odds-list">
            {HORSES.map(h => (
              <div key={h.id} className="hr-odds-row">
                <span className="hr-odds-horse" style={{ color: h.color }}>{h.name}</span>
                <span className="hr-odds-val" style={{ color: h.odds < 0 ? '#ef4444' : '#22c55e' }}>{fmtOdds(h.odds)}</span>
                <span className="hr-odds-payout">
                  ${bet > 0 ? calcPayout(bet, h.odds).toLocaleString() : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="hr-odds-legend">
            <span style={{ color: '#ef4444' }}>Negative = Favorite</span>
            &nbsp;·&nbsp;
            <span style={{ color: '#22c55e' }}>Positive = Underdog</span>
          </div>
        </div>
      )}
    </div>
  );
}
