import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getBalance, addBalance, subtractBalance,
  msUntilNextDaily, reportBigWin, isRiggedMode,
} from '../utils/casinoBalance';
import './CrossyRoad.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// ── Constants ────────────────────────────────────────────────────────────────

const TOTAL_ROWS = 12;
const COLS = 3;
const COL_LABELS = ['Left', 'Center', 'Right'];
const COL_ARROWS = ['←', '↑', '→'];
const JACKPOT_BONUS = 2.0; // multiply entire multiplier by 2 when all rows cleared

const DIFFICULTIES = {
  easy: {
    label: 'Easy',
    emoji: '😌',
    color: '#22c55e',
    roadMult: 1.22,
    riverMult: 1.35,
    railMult: 1.70,
    grassMult: 1.00,
    roadUnsafe: 1,
    riverUnsafe: 1,
    railDeathChance: 0.07,
    terrainWeights: { grass: 4, road: 4, river: 1, rail: 1 },
    desc: '1 danger · low rail risk',
  },
  medium: {
    label: 'Medium',
    emoji: '😰',
    color: '#eab308',
    roadMult: 1.32,
    riverMult: 1.50,
    railMult: 2.00,
    grassMult: 1.00,
    roadUnsafe: 1,
    riverUnsafe: 1,
    railDeathChance: 0.12,
    terrainWeights: { grass: 2, road: 4, river: 2, rail: 2 },
    desc: '1-2 dangers · moderate',
  },
  hard: {
    label: 'Hard',
    emoji: '💀',
    color: '#ef4444',
    roadMult: 1.45,
    riverMult: 1.70,
    railMult: 2.50,
    grassMult: 1.00,
    roadUnsafe: 2,
    riverUnsafe: 2,
    railDeathChance: 0.18,
    terrainWeights: { grass: 1, road: 3, river: 3, rail: 3 },
    desc: '2 dangers · high rail risk',
  },
};

// Terrain icons
const TERRAIN_ICONS = {
  grass: '🌿',
  road: '🛣️',
  river: '💧',
  rail: '🚂',
};

const TERRAIN_NAMES = {
  grass: 'GRASS',
  road: 'ROAD',
  river: 'RIVER',
  rail: 'RAIL',
};

// Car emojis pool
const CAR_EMOJIS = ['🚗', '🚕', '🚙', '🏎️', '🚓', '🚐', '🚑', '🚌'];
const CAR_EMOJIS_2 = ['🚚', '🚛', '🚜', '🏎️', '🚘', '🚖', '🚔', '🛻'];
const LOG_EMOJI = '🪵';
const TRAIN_EMOJI = '🚂';

// ── Terrain generation ────────────────────────────────────────────────────────

function pickTerrain(weights) {
  const types = Object.keys(weights);
  const total = types.reduce((s, t) => s + weights[t], 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= weights[t];
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRows(difficulty) {
  const diff = DIFFICULTIES[difficulty];
  const rows = [];

  // Ensure the first 2 rows are grass (warm-up), the rest follow weights
  for (let i = 0; i < TOTAL_ROWS; i++) {
    let type;
    if (i < 2) {
      type = 'grass';
    } else {
      type = pickTerrain(diff.terrainWeights);
    }

    let safeColumns;
    let trainDir = null;
    let carDir = null;
    let carEmoji = null;
    let car2Emoji = null;
    let logDir = null;
    let isDangerous = false; // rail: all cols unsafe

    if (type === 'grass') {
      safeColumns = [0, 1, 2];
    } else if (type === 'road') {
      const allCols = shuffle([0, 1, 2]);
      const unsafeSet = new Set(allCols.slice(0, diff.roadUnsafe));
      safeColumns = [0, 1, 2].filter(c => !unsafeSet.has(c));
      carDir = Math.random() < 0.5 ? 'left' : 'right';
      carEmoji = CAR_EMOJIS[Math.floor(Math.random() * CAR_EMOJIS.length)];
      car2Emoji = CAR_EMOJIS_2[Math.floor(Math.random() * CAR_EMOJIS_2.length)];
    } else if (type === 'river') {
      const allCols = shuffle([0, 1, 2]);
      const unsafeSet = new Set(allCols.slice(0, diff.riverUnsafe));
      safeColumns = [0, 1, 2].filter(c => !unsafeSet.has(c));
      logDir = Math.random() < 0.5 ? 'left' : 'right';
    } else if (type === 'rail') {
      if (Math.random() < diff.railDeathChance) {
        // All deadly — train is coming
        safeColumns = [];
        isDangerous = true;
      } else {
        safeColumns = [0, 1, 2];
      }
      trainDir = Math.random() < 0.5 ? 'left' : 'right';
    } else {
      safeColumns = [0, 1, 2];
    }

    rows.push({
      type,
      safeColumns,
      trainDir,
      carDir,
      carEmoji,
      car2Emoji,
      logDir,
      isDangerous,
      // Visual details
      carSpeed: 2.5 + Math.random() * 3,     // seconds per pass
      car2Speed: 3.0 + Math.random() * 2.5,  // second car speed
      logSpeed: 4 + Math.random() * 4,
      trainSpeed: 1.0 + Math.random() * 0.8,
      logWidth: 60 + Math.floor(Math.random() * 50), // px
      // Random offsets for staggering
      carDelay: Math.random(),
      car2Delay: Math.random(),
    });
  }
  return rows;
}

// ── Multiplier helpers ────────────────────────────────────────────────────────

function computeMultiplierAtRow(rows, difficulty, upToRow) {
  // upToRow: index of the last cleared row (0-based). -1 means no rows cleared.
  const diff = DIFFICULTIES[difficulty];
  let mult = 1.0;
  for (let i = 0; i <= upToRow; i++) {
    const { type } = rows[i];
    if (type === 'road')  mult *= diff.roadMult;
    else if (type === 'river') mult *= diff.riverMult;
    else if (type === 'rail')  mult *= diff.railMult;
    // grass: no change
  }
  return mult;
}

function getMultColor(mult) {
  if (mult >= 8)   return 'cr-mult--red';
  if (mult >= 4)   return 'cr-mult--orange';
  if (mult >= 2)   return 'cr-mult--yellow';
  return 'cr-mult--green';
}

// Pulse speed based on multiplier (lower = faster = more urgent)
function getPulseSpeed(mult) {
  if (mult >= 8)  return 0.55;
  if (mult >= 4)  return 0.8;
  if (mult >= 2)  return 1.1;
  return 1.4;
}

// ── Confetti ──────────────────────────────────────────────────────────────────

function ConfettiPiece({ left, delay, duration }) {
  const emojis = ['🪙', '💰', '✨', '🌟', '💎', '🎉'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  return (
    <div
      className="cr-confetti-piece"
      style={{
        left: `${left}%`,
        animationDuration: `${duration}s`,
        animationDelay: `${delay}s`,
      }}
    >
      {emoji}
    </div>
  );
}

// ── Floating multiplier text ──────────────────────────────────────────────────

function FloatingText({ text }) {
  return (
    <div className="cr-float-text">
      {text}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CrossyRoad() {
  const { banned, reason, expiresAt, loading } = useBanCheck('crossy-road');
  useGameActivity('crossy-road');
  const boost = useGameBoost('crossy-road');

  const [balance, setBalance]         = useState(getBalance);
  const [bet, setBet]                 = useState(100);
  const [difficulty, setDifficulty]   = useState('medium');
  const [phase, setPhase]             = useState('betting'); // betting | playing | won | lost | jackpot
  const [rows, setRows]               = useState(null);      // generated terrain
  const [currentRow, setCurrentRow]   = useState(-1);        // -1 = start zone
  const [currentCol, setCurrentCol]   = useState(1);         // 0=left, 1=center, 2=right
  const [multiplier, setMultiplier]   = useState(1.00);
  const [hopAnim, setHopAnim]         = useState(null);      // col index animating
  const [deathAnim, setDeathAnim]     = useState(false);
  const [shaking, setShaking]         = useState(false);
  const [justClearedRow, setJustClearedRow] = useState(null);
  const [history, setHistory]         = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [multPump, setMultPump]       = useState(false);
  const [countdown, setCountdown]     = useState('');
  const [revealedRows, setRevealedRows] = useState(new Set()); // rows whose result is revealed after death
  const [hopDisabled, setHopDisabled] = useState(false);
  const [floatingText, setFloatingText] = useState(null); // { text, id }

  const betRef     = useRef(100);
  const multRef    = useRef(1.00);
  const rowsRef    = useRef(null);
  const currentRowRef = useRef(-1);
  const currentColRef = useRef(1);

  // Countdown for daily
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

  // Clear floating text after animation
  useEffect(() => {
    if (!floatingText) return;
    const id = setTimeout(() => setFloatingText(null), 1200);
    return () => clearTimeout(id);
  }, [floatingText]);

  function syncBalance() { setBalance(getBalance()); }

  // ── Start game ──────────────────────────────────────────────────────────────

  function startGame() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();
    betRef.current = bet;
    multRef.current = 1.00;
    currentRowRef.current = -1;
    currentColRef.current = 1;

    const newRows = generateRows(difficulty);
    rowsRef.current = newRows;
    setRows(newRows);
    setCurrentRow(-1);
    setCurrentCol(1);
    setMultiplier(1.00);
    setHopAnim(null);
    setDeathAnim(false);
    setShaking(false);
    setJustClearedRow(null);
    setShowConfetti(false);
    setRevealedRows(new Set());
    setHopDisabled(false);
    setFloatingText(null);
    setPhase('playing');
  }

  // ── Hop into a column ───────────────────────────────────────────────────────

  function hop(col) {
    if (phase !== 'playing' || hopDisabled) return;
    const nextRow = currentRowRef.current + 1;
    if (nextRow >= TOTAL_ROWS) return;

    const rowData = rowsRef.current[nextRow];

    // Rigged: forced loss on every hop
    const isSafe = isRiggedMode() ? false : rowData.safeColumns.includes(col);

    setHopDisabled(true);
    setHopAnim(col);

    setTimeout(() => {
      setHopAnim(null);

      if (!isSafe) {
        // Death sequence
        setCurrentCol(col);
        currentColRef.current = col;
        setDeathAnim(true);
        setShaking(true);
        // Reveal all unsafe columns across all future rows
        setRevealedRows(new Set([...Array(TOTAL_ROWS).keys()]));
        setPhase('lost');
        setHistory(h => [{ win: false, mult: null, type: 'lose' }, ...h].slice(0, 10));
        setTimeout(() => setShaking(false), 600);
        setTimeout(() => setDeathAnim(false), 1200);
      } else {
        // Safe — advance
        const newRow = nextRow;
        currentRowRef.current = newRow;
        currentColRef.current = col;
        setCurrentRow(newRow);
        setCurrentCol(col);

        // Flash row clear
        setJustClearedRow(newRow);
        setTimeout(() => setJustClearedRow(null), 600);

        // Update multiplier
        const diff = DIFFICULTIES[difficulty];
        let mult = multRef.current;
        let oldMult = mult;
        if (rowData.type === 'road')  mult = parseFloat((mult * diff.roadMult).toFixed(4));
        else if (rowData.type === 'river') mult = parseFloat((mult * diff.riverMult).toFixed(4));
        else if (rowData.type === 'rail')  mult = parseFloat((mult * diff.railMult).toFixed(4));

        multRef.current = mult;
        setMultiplier(mult);

        // Floating text for multiplier gain (non-grass only)
        if (mult !== oldMult) {
          const gain = (mult / oldMult);
          setFloatingText({ text: `+${gain.toFixed(2)}×`, id: Date.now() });
        }

        // Pump animation
        setMultPump(true);
        setTimeout(() => setMultPump(false), 400);

        if (newRow >= TOTAL_ROWS - 1) {
          // All rows cleared — jackpot!
          const finalMult = parseFloat((mult * JACKPOT_BONUS).toFixed(4));
          multRef.current = finalMult;
          setMultiplier(finalMult);
          const payout = Math.floor(betRef.current * finalMult * boost);
          addBalance(payout);
          syncBalance();
          reportBigWin(
            'crossy-road', betRef.current, payout, finalMult,
            `${difficulty} · all ${TOTAL_ROWS} rows cleared · jackpot · ${finalMult.toFixed(2)}×`
          );
          setPhase('jackpot');
          setShowConfetti(true);
          setHistory(h => [{ win: true, mult: finalMult, type: 'jackpot' }, ...h].slice(0, 10));
          setTimeout(() => setShowConfetti(false), 4000);
        } else {
          setHopDisabled(false);
        }
      }
    }, 320);
  }

  // ── Cash out ────────────────────────────────────────────────────────────────

  function cashOut() {
    if (phase !== 'playing' || currentRowRef.current < 0) return;
    const payout = Math.floor(betRef.current * multRef.current * boost);
    addBalance(payout);
    syncBalance();
    reportBigWin(
      'crossy-road', betRef.current, payout, multRef.current,
      `${difficulty} · ${currentRowRef.current + 1} row(s) cleared · ${multRef.current.toFixed(2)}×`
    );
    setPhase('won');
    setShowConfetti(true);
    setHistory(h => [{ win: true, mult: multRef.current, type: 'cashout' }, ...h].slice(0, 10));
    setTimeout(() => setShowConfetti(false), 3000);
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  function reset() {
    setPhase('betting');
    setRows(null);
    setCurrentRow(-1);
    setCurrentCol(1);
    currentRowRef.current = -1;
    currentColRef.current = 1;
    setMultiplier(1.00);
    multRef.current = 1.00;
    rowsRef.current = null;
    setHopAnim(null);
    setDeathAnim(false);
    setShaking(false);
    setJustClearedRow(null);
    setShowConfetti(false);
    setRevealedRows(new Set());
    setHopDisabled(false);
    setMultPump(false);
    setFloatingText(null);
    syncBalance();
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const balance_   = getBalance();
  const diff       = DIFFICULTIES[difficulty];
  const quickBets  = [10, 50, 100, 500, 1000].filter(v => v <= balance_);
  const potentialPayout = phase === 'playing'
    ? Math.floor(betRef.current * multiplier * boost)
    : null;

  // Max possible payout preview (rough — all hard rows)
  function previewMaxPayout() {
    if (!rows) {
      let mult = 1;
      for (let i = 0; i < TOTAL_ROWS; i++) {
        mult *= diff.roadMult;
      }
      return Math.floor(bet * mult * JACKPOT_BONUS);
    }
    return Math.floor(bet * computeMultiplierAtRow(rows, difficulty, TOTAL_ROWS - 1) * JACKPOT_BONUS);
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  // Determine hop button state for a given column (looking at NEXT row)
  function getHopBtnState(col) {
    if (phase !== 'playing' || hopDisabled) return 'disabled';
    const nextRow = currentRowRef.current + 1;
    if (nextRow >= TOTAL_ROWS) return 'disabled';
    const rowData = rowsRef.current[nextRow];
    if (rowData.type === 'grass') return 'safe';
    return 'active';
  }

  // Next row data
  const nextRowData = rows && phase === 'playing'
    ? (currentRowRef.current + 1 < TOTAL_ROWS ? rows[currentRowRef.current + 1] : null)
    : null;

  // Get terrain hint for hop button
  function getHopBtnHint(col, rowData) {
    if (!rowData) return null;
    switch (rowData.type) {
      case 'grass':
        return { icon: '🌿', label: 'Safe!', cls: 'hint--grass' };
      case 'road':
        return { icon: '🚗', label: rowData.carDir === 'left' ? '◀ Traffic' : 'Traffic ▶', cls: 'hint--road' };
      case 'river':
        return { icon: '❓', label: '~ River ~', cls: 'hint--river', animated: true };
      case 'rail':
        return { icon: '🚂', label: '⚡ DANGER', cls: 'hint--rail' };
      default:
        return null;
    }
  }

  // ── Render terrain row ──────────────────────────────────────────────────────

  function renderRow(rowIndex) {
    if (!rows) return null;
    const rowData = rows[rowIndex];
    const { type, safeColumns, isDangerous, carDir, carEmoji, car2Emoji, carSpeed, car2Speed, carDelay, car2Delay, logDir, logWidth, logSpeed, trainDir, trainSpeed } = rowData;

    const isNext    = phase === 'playing' && rowIndex === currentRowRef.current + 1;
    const isCleared = rowIndex <= currentRowRef.current;
    const isFuture  = rowIndex > currentRowRef.current + 1;
    const isCurrent = rowIndex === currentRowRef.current;
    const isJustCleared = justClearedRow === rowIndex;
    const isRevealed    = revealedRows.has(rowIndex);

    // Depth scale: future rows further away get slightly smaller
    const rowsAhead = rowIndex - currentRowRef.current;
    let depthScale = 1.0;
    if (isFuture && rowsAhead > 2) {
      depthScale = Math.max(0.88, 1 - (rowsAhead - 2) * 0.018);
    }

    const rowClasses = [
      'cr-row',
      `cr-row--${type}`,
      isNext ? 'cr-row--next' : '',
      isCleared ? 'cr-row--cleared' : '',
      isFuture ? 'cr-row--future' : '',
      isJustCleared ? 'cr-row--just-cleared' : '',
      type === 'rail' && isDangerous && isNext ? 'cr-row--dangerous' : '',
    ].filter(Boolean).join(' ');

    // Multiplier for this row
    const multForRow = (() => {
      if (type === 'road')  return `${diff.roadMult.toFixed(2)}×`;
      if (type === 'river') return `${diff.riverMult.toFixed(2)}×`;
      if (type === 'rail')  return `${diff.railMult.toFixed(2)}×`;
      return '—';
    })();

    const multColorClass = (() => {
      if (isCleared) return 'cleared';
      return type;
    })();

    // Should we show the unsafe cols? Yes on cleared rows (reveal after pass) + all after death
    const showUnsafe = isCleared || isRevealed || phase === 'lost' || phase === 'won' || phase === 'jackpot';

    // Opposite direction for second car
    const car2Dir = carDir === 'left' ? 'right' : 'left';

    return (
      <div
        key={rowIndex}
        className={rowClasses}
        style={{ transform: `scaleX(${depthScale})`, transformOrigin: 'center' }}
      >
        {/* Left label */}
        <div className="cr-row-label">
          <span className="cr-row-num">{rowIndex + 1}</span>
          <span className="cr-row-icon">{TERRAIN_ICONS[type]}</span>
          <span className="cr-row-terrain-name">{TERRAIN_NAMES[type]}</span>
        </div>

        {/* Columns area */}
        <div className="cr-row-cols">
          {/* Road: two cars going opposite directions */}
          {type === 'road' && (
            <>
              <div
                className={`cr-car cr-car--${carDir}`}
                style={{
                  animationDuration: `${carSpeed}s`,
                  animationDelay: `${-carDelay * carSpeed}s`,
                  top: '30%',
                }}
              >
                <span className="cr-car-body">
                  {carDir === 'right' ? carEmoji : <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>{carEmoji}</span>}
                </span>
              </div>
              <div
                className={`cr-car cr-car-2 cr-car--${car2Dir}`}
                style={{
                  animationDuration: `${car2Speed}s`,
                  animationDelay: `${-car2Delay * car2Speed}s`,
                  top: '65%',
                }}
              >
                <span className="cr-car-body">
                  {car2Dir === 'right' ? car2Emoji : <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>{car2Emoji}</span>}
                </span>
              </div>
              {/* Dust particles */}
              <div className={`cr-dust cr-dust--${carDir}`} />
              <div className={`cr-dust cr-dust-2 cr-dust--${car2Dir}`} />
            </>
          )}

          {/* River: column-based logs and water */}
          {type === 'river' && [0, 1, 2].map(col => {
            const isSafe = safeColumns.includes(col);
            if (isSafe) {
              // Show log platform for safe columns
              return (
                <div key={col} className="cr-log-col-wrapper">
                  <div
                    className={`cr-log-col cr-log-col--${logDir}`}
                    style={{
                      animationDuration: `${logSpeed}s`,
                      animationDelay: `${-col * (logSpeed / 3)}s`,
                    }}
                  >
                    <span className="cr-log-col-emoji">{LOG_EMOJI}</span>
                  </div>
                </div>
              );
            } else {
              return (
                <div key={col} className="cr-water-col-wrapper">
                  <div className="cr-water-col">
                    <div className="cr-water-ripple" />
                    <div className="cr-water-ripple cr-water-ripple--2" />
                  </div>
                </div>
              );
            }
          })}

          {/* Train */}
          {type === 'rail' && (phase === 'playing' || phase === 'won' || phase === 'lost' || phase === 'jackpot') && (
            <div
              className={`cr-train cr-train--${trainDir}`}
              style={{
                animationDuration: `${trainSpeed}s`,
                animationDelay: isDangerous ? '0s' : `${Math.random() * -4 - 3}s`,
              }}
            >
              {TRAIN_EMOJI}
            </div>
          )}

          {/* Rail sparks when dangerous */}
          {type === 'rail' && isDangerous && [0, 1, 2, 3, 4].map(si => (
            <div
              key={si}
              className="cr-rail-spark"
              style={{
                left: `${15 + si * 17}%`,
                animationDelay: `${si * 0.18}s`,
              }}
            />
          ))}

          {/* 3 column cells */}
          {[0, 1, 2].map(col => {
            const isUnsafe  = !safeColumns.includes(col);
            const showHazard = showUnsafe && isUnsafe;

            // Character is in THIS column when this is the current row and column matches
            const charHere = isCurrent && !deathAnim && phase === 'playing' && col === currentCol;
            const charHopping = hopAnim === col && (rowIndex === currentRowRef.current + 1);
            const charDeadHere = phase === 'lost' && rowIndex === currentRowRef.current + 1 && col === currentColRef.current;

            // Also show char in current row at current col (after landing)
            const charCurrentHere = isCurrent && !deathAnim && (phase === 'playing' || phase === 'won' || phase === 'jackpot') && col === currentCol && hopAnim === null;

            const colClasses = [
              'cr-col',
              `cr-col--${type}`,
              showHazard && type === 'road'  ? 'cr-col--road-unsafe' : '',
              showHazard && type === 'river' ? 'cr-col--river-unsafe' : '',
              showHazard && type === 'rail' && isDangerous ? 'cr-col--rail-all-unsafe' : '',
              // Column divider styling by terrain
              `cr-col-divider--${type}`,
            ].filter(Boolean).join(' ');

            return (
              <div key={col} className={colClasses}>
                {/* Danger overlay (shown when revealed) */}
                {showHazard && type === 'road' && (
                  <div className="cr-col-danger">
                    <span style={{ fontSize: '1.1rem' }}>{carEmoji}</span>
                  </div>
                )}
                {showHazard && type === 'rail' && isDangerous && (
                  <div className="cr-col-danger cr-col-danger--rail">
                    <span>💀</span>
                  </div>
                )}

                {/* Safe indicator for cleared safe cols */}
                {showUnsafe && !isUnsafe && isCleared && type !== 'river' && (
                  <div className="cr-col-safe-check">✓</div>
                )}

                {/* Character idle in current row */}
                {charCurrentHere && currentRowRef.current >= 0 && (
                  <div className="cr-character cr-character--idle cr-character--large">🐸</div>
                )}

                {/* Character hopping into this col in next row */}
                {charHopping && (
                  <div className="cr-character cr-character--hopping cr-character--large">🐸</div>
                )}

                {/* Character dead */}
                {charDeadHere && (
                  <div className="cr-character cr-character--dead cr-character--large">🐸</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right mult */}
        <div className="cr-row-mult">
          <span className={`cr-row-mult-val ${multColorClass}`}>
            {isCleared ? '✓' : multForRow}
          </span>
        </div>
      </div>
    );
  }

  // ── Multiplier color class ──────────────────────────────────────────────────
  const multColorCls = (phase === 'lost') ? 'cr-mult--lost'
    : `${getMultColor(multiplier)}${multPump ? ' cr-mult--pump' : ''}`;

  const pulseSpeed = getPulseSpeed(multiplier);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return null;

  if (banned) {
    const exp = expiresAt ? new Date(expiresAt).toLocaleString() : null;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0f0f1a', color: '#fff',
        fontFamily: 'Roboto,sans-serif', gap: '12px',
        padding: '32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '4rem' }}>🚫</div>
        <h2 style={{ margin: 0, color: '#ef4444' }}>Access Denied</h2>
        <p style={{ margin: 0, color: '#aaa', maxWidth: '360px' }}>
          You have been banned from this game{reason ? `: ${reason}` : '.'}
        </p>
        {exp
          ? <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>Ban expires: {exp}</p>
          : <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>This ban is permanent.</p>
        }
      </div>
    );
  }

  return (
    <div className={`cr-wrap${shaking ? ' cr-wrap--shaking' : ''}`}>

      {/* Death flash overlay */}
      {deathAnim && <div className="cr-death-overlay" />}

      {/* Jackpot overlay */}
      {phase === 'jackpot' && <div className="cr-jackpot-overlay" />}

      {/* Confetti */}
      {showConfetti && (
        <div className="cr-confetti-wrap">
          {Array.from({ length: 22 }, (_, i) => (
            <ConfettiPiece
              key={i}
              left={5 + Math.random() * 90}
              delay={Math.random() * 0.8}
              duration={1.5 + Math.random() * 1.5}
            />
          ))}
        </div>
      )}

      {/* ── Header ── */}
      <div className="cr-header">
        <div className="cr-title">🐸 Crossy Road</div>
        <div className="cr-balance-area">
          <div className="cr-balance">
            💰 <strong>${balance_.toLocaleString()}</strong>
            {boost > 1 && <span className="cr-boost-badge">{boost.toFixed(2)}× Boost</span>}
          </div>
          {phase === 'playing' && (
            <div className="cr-balance" style={{ fontSize: '0.8rem', marginTop: 2 }}>
              Bet: <strong style={{ color: '#eab308' }}>${betRef.current.toLocaleString()}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── History ── */}
      <div className="cr-history">
        {history.map((h, i) => (
          <span
            key={i}
            className={`cr-pill ${h.type === 'jackpot' ? 'jackpot' : h.win ? 'win' : 'lose'}`}
          >
            {h.type === 'jackpot' ? `🏆 ${h.mult.toFixed(2)}×`
              : h.win ? `${h.mult.toFixed(2)}×`
              : '💥'}
          </span>
        ))}
        {history.length === 0 && <span className="cr-hist-empty">No rounds yet</span>}
      </div>

      {/* ── BETTING PHASE ── */}
      {phase === 'betting' && (
        <div className="cr-betting">
          {balance_ < 1 ? (
            <div className="cr-broke">
              <div className="cr-broke-title">You're broke! 😬</div>
              <div className="cr-broke-sub">Hourly $1,000 arrives in</div>
              <div className="cr-broke-timer">{countdown}</div>
            </div>
          ) : (
            <>
              {/* Bet input */}
              <div className="cr-input-row">
                <div className="cr-field">
                  <label className="cr-label">Bet Amount</label>
                  <input
                    className="cr-input"
                    type="number"
                    min={1}
                    max={balance_}
                    value={bet}
                    onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </div>

              {/* Quick bet chips */}
              <div className="cr-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`cr-qb${bet === v ? ' active' : ''}`} onClick={() => setBet(v)}>
                    ${v.toLocaleString()}
                  </button>
                ))}
                <button
                  className={`cr-qb${bet === balance_ ? ' active' : ''}`}
                  onClick={() => setBet(balance_)}
                >
                  All-In
                </button>
              </div>

              {/* Difficulty */}
              <div className="cr-diff-group">
                <label className="cr-label">Difficulty</label>
                <div className="cr-diff-btns">
                  {Object.entries(DIFFICULTIES).map(([key, d]) => (
                    <button
                      key={key}
                      className={`cr-diff-btn${difficulty === key ? ' active' : ''}`}
                      style={{ '--diff-color': d.color }}
                      onClick={() => setDifficulty(key)}
                    >
                      <span className="cr-diff-emoji">{d.emoji}</span>
                      <span className="cr-diff-label">{d.label}</span>
                      <span className="cr-diff-info">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview payout table */}
              <div className="cr-preview">
                <div className="cr-preview-row">
                  <span>🛣️ Road row</span>
                  <span>×{diff.roadMult.toFixed(2)} each</span>
                </div>
                <div className="cr-preview-row">
                  <span>💧 River row</span>
                  <span>×{diff.riverMult.toFixed(2)} each</span>
                </div>
                <div className="cr-preview-row">
                  <span>🚂 Rail row</span>
                  <span>×{diff.railMult.toFixed(2)} each</span>
                </div>
                <div className="cr-preview-row">
                  <span>🌿 Grass row</span>
                  <span style={{ color: '#555' }}>×1.00 (breather)</span>
                </div>
                <div className="cr-preview-row jackpot" style={{ borderTop: '1px solid rgba(255,215,0,0.15)', marginTop: 4, paddingTop: 6 }}>
                  <span>🏆 All 12 rows cleared</span>
                  <span>×{JACKPOT_BONUS.toFixed(1)} jackpot bonus!</span>
                </div>
                <div className="cr-preview-row jackpot">
                  <span>Max payout (estimate)</span>
                  <span>${previewMaxPayout().toLocaleString()}</span>
                </div>
              </div>

              <button className="cr-btn cr-btn--go" onClick={startGame}>
                🐸 Start Hopping!
              </button>
            </>
          )}
        </div>
      )}

      {/* ── PLAYING / RESULT PHASE ── */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost' || phase === 'jackpot') && rows && (
        <>
          {/* Multiplier + floating text */}
          <div className="cr-mult-wrap">
            <div className="cr-mult-float-anchor">
              <div className={`cr-mult ${multColorCls}`}>
                {phase === 'lost' ? '💥 BUSTED'
                  : phase === 'jackpot' ? `🏆 ${multiplier.toFixed(2)}×`
                  : `${multiplier.toFixed(2)}×`}
              </div>
              {floatingText && (
                <FloatingText key={floatingText.id} text={floatingText.text} />
              )}
            </div>
            <div className="cr-mult-sub">
              {phase === 'playing' ? `${difficulty.toUpperCase()} · row ${Math.max(0, currentRowRef.current + 1)} / ${TOTAL_ROWS}` : ''}
              {phase === 'won' ? 'CASHED OUT' : ''}
              {phase === 'lost' ? 'GAME OVER' : ''}
              {phase === 'jackpot' ? 'ALL ROWS CLEARED!' : ''}
            </div>
          </div>

          {/* Progress bar */}
          {phase === 'playing' && (
            <div className="cr-progress-bar-wrap">
              <span className="cr-progress-label">
                {currentRowRef.current + 1} / {TOTAL_ROWS}
              </span>
              <div className="cr-progress-track">
                <div
                  className="cr-progress-fill"
                  style={{ width: `${Math.max(0, (currentRowRef.current + 1) / TOTAL_ROWS * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Result banners */}
          {phase === 'won' && (
            <div className="cr-banner cr-banner--win">
              🎉 Cashed out for <strong>${Math.floor(betRef.current * multiplier * boost).toLocaleString()}</strong>! ({multiplier.toFixed(2)}×)
            </div>
          )}
          {phase === 'jackpot' && (
            <div className="cr-banner cr-banner--jackpot">
              🏆 JACKPOT! All {TOTAL_ROWS} rows crossed!<br />
              Won <strong>${Math.floor(betRef.current * multiplier * boost).toLocaleString()}</strong>! ({multiplier.toFixed(2)}×)
            </div>
          )}
          {phase === 'lost' && (
            <div className="cr-banner cr-banner--lose">
              💥 Squashed! Lost ${betRef.current.toLocaleString()}
            </div>
          )}

          {/* FINISH line */}
          <div className="cr-finish-zone">🏁 FINISH LINE — JACKPOT 🏁</div>

          {/* Grid — rows displayed top (row TOTAL_ROWS-1) down to row 0 */}
          <div className="cr-grid">
            {Array.from({ length: TOTAL_ROWS }, (_, i) => TOTAL_ROWS - 1 - i).map(rowIndex =>
              renderRow(rowIndex)
            )}
          </div>

          {/* Start zone + character when at -1 */}
          <div className="cr-start-zone">
            {currentRowRef.current === -1 && (
              <div className="cr-character cr-character--idle cr-character--large">🐸</div>
            )}
            {currentRowRef.current === -1 && phase === 'playing' && (
              <span style={{ position: 'absolute', right: 48, fontSize: '0.72rem', color: '#666' }}>
                Choose your first lane ↓
              </span>
            )}
          </div>

          {/* Hop buttons */}
          {phase === 'playing' && (
            <div className="cr-hop-area">
              <div className="cr-hop-btns">
                {[0, 1, 2].map(col => {
                  const btnState = getHopBtnState(col);
                  const hint = getHopBtnHint(col, nextRowData);
                  return (
                    <button
                      key={col}
                      className={[
                        'cr-hop-btn',
                        btnState === 'safe'      ? 'cr-hop-btn--safe'      : '',
                        btnState === 'dangerous' ? 'cr-hop-btn--dangerous' : '',
                        nextRowData?.type ? `cr-hop-btn--terrain-${nextRowData.type}` : '',
                      ].join(' ')}
                      disabled={btnState === 'disabled' || hopDisabled}
                      onClick={() => hop(col)}
                    >
                      <span className="cr-hop-btn-arrow">{COL_ARROWS[col]}</span>
                      <span className="cr-hop-btn-label-main">{COL_LABELS[col]}</span>
                      {hint && (
                        <span className={`cr-hop-btn-hint ${hint.cls} ${hint.animated ? 'cr-hop-btn-hint--animated' : ''}`}>
                          {hint.icon} {hint.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Cash out */}
              {currentRowRef.current >= 0 && (
                <button
                  className="cr-cashout-btn"
                  style={{ '--pulse-speed': `${pulseSpeed}s` }}
                  onClick={cashOut}
                >
                  💰 Cash Out
                  <span className="cr-cashout-payout">${potentialPayout?.toLocaleString()}</span>
                </button>
              )}
              {currentRowRef.current < 0 && (
                <div className="cr-hint">
                  🐸 Pick a lane to hop into your first row!
                </div>
              )}
            </div>
          )}

          {/* Play again */}
          {(phase === 'won' || phase === 'lost' || phase === 'jackpot') && (
            <button className="cr-btn cr-btn--reset" onClick={reset}>
              🔄 Play Again
            </button>
          )}
        </>
      )}

      <div className="cr-footer">
        Hop across 12 rows of roads, rivers &amp; rails — cash out before you get squashed! • 1% house edge
      </div>
    </div>
  );
}
