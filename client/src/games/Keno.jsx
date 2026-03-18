import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin } from '../utils/casinoBalance';
import './Keno.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

// ── Keno configuration ────────────────────────────────────────────────────────
// 40 numbers, player picks 1-10, system draws 10
const TOTAL_NUMBERS = 40;
const DRAW_COUNT    = 10;
const MIN_PICK      = 1;
const MAX_PICK      = 10;

// Pay table: [picks][matches] = multiplier on bet
// Aggressive house edge ~25%
const PAY_TABLE = {
  1:  { 1: 2.5 },
  2:  { 2: 6 },
  3:  { 2: 1, 3: 18 },
  4:  { 2: 1, 3: 4, 4: 60 },
  5:  { 3: 2, 4: 12, 5: 200 },
  6:  { 3: 1, 4: 6, 5: 50,  6: 500 },
  7:  { 3: 1, 4: 3, 5: 20,  6: 100, 7: 1000 },
  8:  { 4: 2, 5: 10, 6: 50, 7: 300, 8: 2000 },
  9:  { 4: 1, 5: 5,  6: 25, 7: 150, 8: 1000, 9: 5000 },
  10: { 5: 3, 6: 12, 7: 60, 8: 500, 9: 2000, 10: 10000 },
};

function getPayouts(picks) {
  const table = PAY_TABLE[picks] || {};
  return table;
}

function getMultiplier(picks, matches) {
  const table = PAY_TABLE[picks] || {};
  return table[matches] ?? 0;
}

function drawNumbers(count, total) {
  const pool = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, count));
}

const QUICK_BETS = [5, 10, 25, 50, 100, 250];

export default function Keno() {
  const { banned, reason, expiresAt, loading } = useBanCheck('keno');
  useGameActivity('keno');
  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet]         = useState(10);
  const [picks, setPicks]     = useState(new Set());   // player's chosen numbers
  const [drawn, setDrawn]     = useState(new Set());   // system drawn numbers
  const [phase, setPhase]     = useState('picking');   // picking | revealing | result
  const [matches, setMatches] = useState(0);
  const [result, setResult]   = useState(null);        // { payout, mult, net }
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState('');
  const [revealQueue, setRevealQueue] = useState([]);
  const [revealed, setRevealed] = useState(new Set()); // drawn numbers revealed so far

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

  // Reveal animation: pop one drawn number at a time
  useEffect(() => {
    if (revealQueue.length === 0) return;
    const timer = setTimeout(() => {
      const [next, ...rest] = revealQueue;
      setRevealed(prev => new Set([...prev, next]));
      setRevealQueue(rest);
    }, 120);
    return () => clearTimeout(timer);
  }, [revealQueue]);

  // When reveal is complete, show result
  useEffect(() => {
    if (phase !== 'revealing' || revealQueue.length > 0) return;
    // All numbers revealed — show final result
    setPhase('result');
  }, [phase, revealQueue]);

  function syncBalance() { setBalance(getBalance()); }

  function togglePick(n) {
    if (phase !== 'picking') return;
    setPicks(prev => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else if (next.size < MAX_PICK) {
        next.add(n);
      }
      return next;
    });
  }

  function play() {
    if (picks.size < MIN_PICK || picks.size > MAX_PICK) return;
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();

    const d = drawNumbers(DRAW_COUNT, TOTAL_NUMBERS);
    const numMatches = [...picks].filter(n => d.has(n)).length;
    const mult = getMultiplier(picks.size, numMatches);
    const payout = Math.floor(bet * mult);

    if (payout > 0) {
      addBalance(payout);
      syncBalance();
    }

    const net = payout - bet;
    setDrawn(d);
    setMatches(numMatches);
    setResult({ payout, mult, net, numMatches });
    setHistory(prev => [{ net, numMatches, picks: picks.size }, ...prev].slice(0, 8));
    setRevealed(new Set());
    setRevealQueue([...d]);
    setPhase('revealing');

    reportBigWin('keno', bet, payout, mult, `Picked ${picks.size} · matched ${numMatches}/${DRAW_COUNT} · ${mult}×`);
  }

  function reset() {
    setPicks(new Set());
    setDrawn(new Set());
    setRevealed(new Set());
    setRevealQueue([]);
    setMatches(0);
    setResult(null);
    setPhase('picking');
  }

  const balance_ = getBalance();
  const quickBets = QUICK_BETS.filter(v => v <= balance_);
  const payouts = getPayouts(picks.size);
  const canPlay = picks.size >= MIN_PICK && bet >= 1 && bet <= balance_;

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
    <div className="keno-table">
      <div className="keno-title">🎱 Keno</div>
      <div className="keno-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* History */}
      <div className="keno-history">
        {history.map((h, i) => (
          <span key={i} className={`keno-hist-pill ${h.net > 0 ? 'win' : 'lose'}`}>
            {h.net > 0 ? `+$${h.net}` : `-$${Math.abs(h.net)}`}
          </span>
        ))}
      </div>

      {/* Pick indicator */}
      <div className="keno-pick-info">
        <span className="keno-picks-chosen">
          {picks.size > 0 ? `${picks.size} number${picks.size > 1 ? 's' : ''} picked` : 'Pick 1–10 numbers'}
        </span>
        {picks.size > 0 && Object.entries(payouts).length > 0 && (
          <div className="keno-payouts-inline">
            {Object.entries(payouts).map(([m, mult]) => (
              <span key={m} className={`keno-pay-chip ${matches === +m && phase === 'result' ? 'hit' : ''}`}>
                {m} hit → {mult}×
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Number grid */}
      <div className="keno-grid">
        {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(n => {
          const isPick = picks.has(n);
          const isDrawn = drawn.has(n);
          const isRevealed = revealed.has(n);
          const isMatch = isPick && isDrawn && isRevealed;
          const isMiss  = !isPick && isDrawn && isRevealed;
          return (
            <button
              key={n}
              className={`keno-num ${isPick ? 'keno-num--pick' : ''} ${isMatch ? 'keno-num--match' : ''} ${isMiss ? 'keno-num--drawn' : ''}`}
              onClick={() => togglePick(n)}
              disabled={phase !== 'picking'}
            >
              {n}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {phase === 'result' && result && (
        <div className={`keno-result ${result.net > 0 ? 'win' : 'lose'}`}>
          {result.numMatches} match{result.numMatches !== 1 ? 'es' : ''} out of {DRAW_COUNT} drawn
          {result.net > 0
            ? ` — ✅ Won $${result.payout.toLocaleString()}! (+$${result.net.toLocaleString()})`
            : ` — ❌ Lost $${bet.toLocaleString()}`}
        </div>
      )}

      {/* Controls */}
      {balance_ < 1 ? (
        <div className="keno-broke">
          <div className="keno-broke-title">You're broke! 😬</div>
          <div className="keno-broke-sub">Hourly $1,000 arrives in</div>
          <div className="keno-broke-countdown">{countdown}</div>
        </div>
      ) : (
        <div className="keno-controls">
          {(phase === 'picking' || phase === 'result') && (
            <>
              <div className="keno-bet-row">
                <span>Bet:</span>
                <input
                  className="keno-bet-input"
                  type="number" min={1} max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="keno-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`keno-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`keno-qb ${bet === balance_ ? 'active' : ''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              {phase === 'result' ? (
                <div className="keno-btn-row">
                  <button className="keno-btn keno-btn--secondary" onClick={reset}>🔄 Pick Again</button>
                  <button className="keno-btn" onClick={() => { reset(); setTimeout(play, 0); }} disabled={picks.size < 1}>
                    ▶ Play Same Picks
                  </button>
                </div>
              ) : (
                <button className="keno-btn" onClick={play} disabled={!canPlay}>
                  🎱 Play Keno ({picks.size}/{MAX_PICK} picked)
                </button>
              )}
              {picks.size > 0 && (
                <button className="keno-btn keno-btn--clear" onClick={() => setPicks(new Set())}>✕ Clear Picks</button>
              )}
            </>
          )}
          {phase === 'revealing' && (
            <div className="keno-drawing-msg">🎱 Drawing numbers…</div>
          )}
        </div>
      )}

      <div className="keno-hint">Pick 1–{MAX_PICK} numbers · {DRAW_COUNT} drawn from {TOTAL_NUMBERS} · Match to win</div>
    </div>
  );
}
