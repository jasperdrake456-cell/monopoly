import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import './Slots.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';
import { useAuth } from '../contexts/AuthContext';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authFetch(path, token, options = {}) {
  return fetch(SERVER_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(r => r.json()).catch(() => ({ ok: false }));
}

// Generous pool — paying symbols weighted so wins happen often.
// 💎×2, 7️⃣×2, ⭐×4, 🔔×5, 🍇×5, 🍊×6, 🍋×7, 🍒×12 (43 paying)
// Filler: 🍑×2, 🫐×2, 🥝×2, 🍈×2, 🫒×2 (10 filler) — total 53
const REEL_POOL = [
  '💎','💎',
  '7️⃣','7️⃣',
  '⭐','⭐','⭐','⭐',
  '🔔','🔔','🔔','🔔','🔔',
  '🍇','🍇','🍇','🍇','🍇',
  '🍊','🍊','🍊','🍊','🍊','🍊',
  '🍋','🍋','🍋','🍋','🍋','🍋','🍋',
  '🍒','🍒','🍒','🍒','🍒','🍒','🍒','🍒','🍒','🍒','🍒','🍒',
  '🍑','🍑',
  '🫐','🫐',
  '🥝','🥝',
  '🍈','🍈',
  '🫒','🫒',
];

const PAYTABLE = [
  { symbols: ['💎','💎','💎'], label: '💎 💎 💎', mult: 600 },
  { symbols: ['7️⃣','7️⃣','7️⃣'], label: '7️⃣ 7️⃣ 7️⃣', mult: 300 },
  { symbols: ['⭐','⭐','⭐'], label: '⭐ ⭐ ⭐', mult: 50 },
  { symbols: ['🔔','🔔','🔔'], label: '🔔 🔔 🔔', mult: 25 },
  { symbols: ['🍇','🍇','🍇'], label: '🍇 🍇 🍇', mult: 15 },
  { symbols: ['🍊','🍊','🍊'], label: '🍊 🍊 🍊', mult: 10 },
  { symbols: ['🍋','🍋','🍋'], label: '🍋 🍋 🍋', mult: 5 },
  { symbols: ['🍒','🍒','🍒'], label: '🍒 🍒 🍒', mult: 3 },
  { symbols: ['💎','💎','*'], label: '💎 💎 any (pair)', mult: 25 },
  { symbols: ['7️⃣','7️⃣','*'], label: '7️⃣ 7️⃣ any (pair)', mult: 15 },
  { symbols: ['⭐','⭐','*'], label: '⭐ ⭐ any (pair)', mult: 5 },
  { symbols: ['🔔','🔔','*'], label: '🔔 🔔 any (pair)', mult: 3 },
  { symbols: ['🍇','🍇','*'], label: '🍇 🍇 any (pair)', mult: 2 },
  { symbols: ['🍊','🍊','*'], label: '🍊 🍊 any (pair)', mult: 1.5 },
  { symbols: ['🍋','🍋','*'], label: '🍋 🍋 any (pair)', mult: 1.2 },
  { symbols: ['🍒','🍒','*'], label: '🍒 🍒 any', mult: 1.5 },
  { symbols: ['🍒','*','*'], label: '🍒 any any',  mult: 1.0 },
];

function rand() {
  return REEL_POOL[Math.floor(Math.random() * REEL_POOL.length)];
}

// Returns [top, mid, bottom] for a reel with a given payline symbol
function makeReelFace(paylineSym) {
  return [rand(), paylineSym, rand()];
}

function initReelDisplays() {
  return Array.from({ length: 3 }, () => [rand(), rand(), rand()]);
}

function evaluate(mids) {
  const [r0, r1, r2] = mids;

  // Three-of-a-kind (non-cherry)
  if (r0 === '💎' && r1 === '💎' && r2 === '💎') return { mult: 600, label: '💎 💎 💎 JACKPOT!' };
  if (r0 === '7️⃣' && r1 === '7️⃣' && r2 === '7️⃣') return { mult: 300, label: '7️⃣ 7️⃣ 7️⃣ LUCKY SEVENS!' };
  if (r0 === '⭐' && r1 === '⭐' && r2 === '⭐') return { mult: 50, label: '⭐ ⭐ ⭐ STARS!' };
  if (r0 === '🔔' && r1 === '🔔' && r2 === '🔔') return { mult: 25, label: '🔔 🔔 🔔 BELLS!' };
  if (r0 === '🍇' && r1 === '🍇' && r2 === '🍇') return { mult: 15, label: '🍇 🍇 🍇 GRAPES!' };
  if (r0 === '🍊' && r1 === '🍊' && r2 === '🍊') return { mult: 10, label: '🍊 🍊 🍊 ORANGES!' };
  if (r0 === '🍋' && r1 === '🍋' && r2 === '🍋') return { mult: 5,  label: '🍋 🍋 🍋 LEMONS!' };

  // Cherry combos — count by total, any position
  const cherries = mids.filter(s => s === '🍒').length;
  if (cherries === 3) return { mult: 3,   label: '🍒 🍒 🍒 CHERRIES!' };
  if (cherries === 2) return { mult: 1.5, label: '🍒 🍒 — Double Cherry!' };

  // Two-of-a-kind (non-cherry) — any two matching paying symbols in any
  // position. Ordered high to low so the best pair always wins.
  const has2 = (sym) => mids.filter(s => s === sym).length >= 2;
  if (has2('💎'))  return { mult: 25,  label: '💎 💎 — Double Diamond!' };
  if (has2('7️⃣')) return { mult: 15,  label: '7️⃣ 7️⃣ — Double Seven!' };
  if (has2('⭐'))  return { mult: 5,   label: '⭐ ⭐ — Double Star!' };
  if (has2('🔔'))  return { mult: 3,   label: '🔔 🔔 — Double Bell!' };
  if (has2('🍇'))  return { mult: 2,   label: '🍇 🍇 — Double Grape!' };
  if (has2('🍊'))  return { mult: 1.5, label: '🍊 🍊 — Double Orange!' };
  if (has2('🍋'))  return { mult: 1.2, label: '🍋 🍋 — Double Lemon!' };

  if (cherries === 1) return { mult: 1.0, label: '🍒 — Single Cherry!' };

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
const SPIN_MS = 1000;       // base spin duration
const REEL_GAP_MS = 250;    // gap between each reel stopping
const CYCLE_MS = 70;        // symbol cycle interval during spin

export default function Slots() {
  const { banned, reason, expiresAt, loading } = useBanCheck('slots');
  useGameActivity('slots');
  const boost = useGameBoost('slots');
  const { token } = useAuth();
  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet] = useState(10);
  const [jackpotAmount, setJackpotAmount] = useState(10000);
  const [jackpotModal, setJackpotModal] = useState(null); // { winner, amount } when someone wins
  // reelDisplays[i] = [top, mid, bot]
  const [reelDisplays, setReelDisplays] = useState(initReelDisplays);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [result, setResult] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);
  const cycleIntervals = useRef([null, null, null]);

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

  useEffect(() => { initJokerBonuses(); }, []);

  // ── Jackpot: load current amount + listen for wins ─────────────────────────
  useEffect(() => {
    fetch(SERVER_URL + '/api/jackpot')
      .then(r => r.json())
      .then(d => { if (d.ok) setJackpotAmount(d.amount); })
      .catch(() => {});

    // Poll jackpot amount every 10s
    const pollId = setInterval(() => {
      fetch(SERVER_URL + '/api/jackpot')
        .then(r => r.json())
        .then(d => { if (d.ok) setJackpotAmount(d.amount); })
        .catch(() => {});
    }, 10_000);

    // Listen for jackpotWon socket event via window (fired by AuthContext socket)
    function onJackpotWon(e) {
      const { winner, amount, resetTo } = e.detail || {};
      setJackpotAmount(resetTo || 10000);
      setJackpotModal({ winner, amount });
    }
    window.addEventListener('jackpotWon', onJackpotWon);

    return () => {
      clearInterval(pollId);
      window.removeEventListener('jackpotWon', onJackpotWon);
    };
  }, []);

  // Clamp bet when balance changes
  useEffect(() => {
    if (bet > balance && balance > 0) setBet(Math.max(1, Math.floor(balance)));
  }, [balance]);

  // Cleanup cycle intervals on unmount
  useEffect(() => {
    return () => cycleIntervals.current.forEach(t => clearInterval(t));
  }, []);

  function syncBalance() { setBalance(getBalance()); }

  function handleSpin() {
    if (disabled || broke || bet <= 0 || bet > balance) return;

    // Rigged: return a no-win combo — different non-cherry symbols, no payout
    const finalMids = isRiggedMode()
      ? ['🔔', '🍊', '🍋']
      : [rand(), rand(), rand()];
    const outcome = evaluate(finalMids);

    subtractBalance(bet);
    setBalance(getBalance());
    setResult(null);
    setDisabled(true);
    setSpinning([true, true, true]);

    // Clear any leftover intervals
    cycleIntervals.current.forEach(t => clearInterval(t));

    // Start rapid symbol cycling for each reel
    for (let i = 0; i < 3; i++) {
      cycleIntervals.current[i] = setInterval(() => {
        setReelDisplays(prev => {
          const next = prev.map(r => [...r]);
          next[i] = [rand(), rand(), rand()];
          return next;
        });
      }, CYCLE_MS);
    }

    // Stop each reel sequentially
    const betSnapshot = bet; // capture bet value for payout calculation
    [0, 1, 2].forEach(reelIdx => {
      setTimeout(() => {
        clearInterval(cycleIntervals.current[reelIdx]);
        cycleIntervals.current[reelIdx] = null;

        // Settle this reel on its final symbol
        setReelDisplays(prev => {
          const next = prev.map(r => [...r]);
          next[reelIdx] = makeReelFace(finalMids[reelIdx]);
          return next;
        });
        setSpinning(prev => {
          const next = [...prev];
          next[reelIdx] = false;
          return next;
        });

        // Last reel stopped — apply outcome
        if (reelIdx === 2) {
          const isJackpotSpin = finalMids[0] === '7️⃣' && finalMids[1] === '7️⃣' && finalMids[2] === '7️⃣';
          let payout = 0;
          if (outcome.mult > 0) {
            payout = Math.floor(betSnapshot * outcome.mult * boost);
            addBalance(payout);
            reportBigWin('slots', betSnapshot, payout, outcome.mult, `${outcome.label} · ${outcome.mult}×`);
            applyJokerBonus(betSnapshot, payout, true);
          } else {
            applyJokerBonus(betSnapshot, 0, false);
          }
          setBalance(getBalance());

          // Contribute 2% of wager to jackpot (fire-and-forget)
          if (token) {
            authFetch('/api/jackpot/contribute', token, {
              method: 'POST',
              body: JSON.stringify({ wager: betSnapshot }),
            }).then(d => { if (d.ok) setJackpotAmount(d.amount); });
          }

          // Jackpot win: 7️⃣7️⃣7️⃣ — claim the pool in addition to normal 300× payout
          if (isJackpotSpin && token) {
            authFetch('/api/jackpot/claim', token, {
              method: 'POST',
              body: JSON.stringify({ wager: betSnapshot }),
            }).then(d => {
              if (d.ok) {
                addBalance(d.amount);
                setBalance(getBalance());
                setJackpotAmount(d.resetTo || 10000);
              }
            });
          }

          setResult({ ...outcome, payout, win: outcome.mult > 0, isJackpot: isJackpotSpin });
          setDisabled(false);
        }
      }, SPIN_MS + reelIdx * REEL_GAP_MS);
    });
  }

  function handleBetChange(e) {
    const val = Math.max(1, Math.min(Math.floor(Number(e.target.value) || 1), Math.floor(balance)));
    setBet(val);
  }

  const availableQuickBets = QUICK_BETS.filter(v => v <= balance);
  const anySpinning = spinning.some(Boolean);
  const showWin = result?.win && !anySpinning;

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
      {/* ── Jackpot Won Modal ─────────────────────────────────────── */}
      {jackpotModal && (
        <div className="slots-jackpot-modal-overlay" onClick={() => setJackpotModal(null)}>
          <div className="slots-jackpot-modal" onClick={e => e.stopPropagation()}>
            <div className="slots-jackpot-modal-emoji">🎰🎉🎰</div>
            <div className="slots-jackpot-modal-title">JACKPOT!</div>
            <div className="slots-jackpot-modal-winner">{jackpotModal.winner}</div>
            <div className="slots-jackpot-modal-amount">${jackpotModal.amount.toLocaleString()}</div>
            <div className="slots-jackpot-modal-sub">hit 7️⃣ 7️⃣ 7️⃣ and won the jackpot!</div>
            <button className="slots-jackpot-modal-btn" onClick={() => setJackpotModal(null)}>Close</button>
          </div>
        </div>
      )}

      {/* ── Jackpot Banner ───────────────────────────────────────── */}
      <div className="slots-jackpot-banner">
        <span className="slots-jackpot-label">🎰 JACKPOT POOL</span>
        <span className="slots-jackpot-amount">${jackpotAmount.toLocaleString()}</span>
        <span className="slots-jackpot-hint">Hit 7️⃣ 7️⃣ 7️⃣ to win!</span>
      </div>

      <div className="slots-balance">
        Balance: <span className="slots-balance-amount">${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      {broke && !anySpinning ? (
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
              {/* Payline bar */}
              <div className="slots-payline" />
              {reelDisplays.map((syms, i) => (
                <div
                  key={i}
                  className={[
                    'slots-reel',
                    spinning[i] ? 'slots-reel--spinning' : '',
                    showWin ? 'slots-reel--win' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="slots-sym slots-sym--top">{syms[0]}</div>
                  <div className="slots-sym slots-sym--mid">{syms[1]}</div>
                  <div className="slots-sym slots-sym--bot">{syms[2]}</div>
                </div>
              ))}
            </div>

            {result && (
              <div className={`slots-result ${result.win ? 'slots-result--win' : 'slots-result--lose'} ${result.isJackpot ? 'slots-result--jackpot' : ''}`}>
                {result.isJackpot && <div className="slots-result-jackpot-badge">🎰 JACKPOT! 🎰</div>}
                <div className="slots-result-label">{result.label}</div>
                {result.win && (
                  <div className="slots-result-payout">
                    +${result.payout.toLocaleString()} ({result.mult}×)
                    {result.isJackpot && <span className="slots-result-jackpot-extra"> + JACKPOT POOL!</span>}
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
              <button className="slots-btn slots-btn--max" onClick={() => setBet(Math.max(1, Math.floor(balance)))} disabled={disabled}>
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
