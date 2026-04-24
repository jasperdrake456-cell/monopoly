import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import './VideoPoker.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// ── Deck ─────────────────────────────────────────────────────────────────────
const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
const RED_SUITS = new Set(['♥', '♦']);

function createDeck() {
  const cards = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      cards.push({ suit, rank, v: RANK_VAL[rank] });
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ── Hand evaluation ───────────────────────────────────────────────────────────
function evalHand(cards) {
  const vals  = cards.map(c => c.v).sort((a, b) => a - b);
  const suits = cards.map(c => c.suit);
  const flush  = suits.every(s => s === suits[0]);
  const uniq   = [...new Set(vals)].sort((a, b) => a - b);

  // Straight check (including A-low wheel)
  let straight = false;
  if (uniq.length === 5) {
    if (uniq[4] - uniq[0] === 4) straight = true;
    else if (JSON.stringify(uniq) === JSON.stringify([2,3,4,5,14])) straight = true;
  }

  // Frequency map
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const counts = Object.values(freq).sort((a, b) => b - a);

  if (flush && straight) {
    const isRoyal = JSON.stringify(vals) === JSON.stringify([10,11,12,13,14]);
    return isRoyal ? 'Royal Flush' : 'Straight Flush';
  }
  if (counts[0] === 4) return 'Four of a Kind';
  if (counts[0] === 3 && counts[1] === 2) return 'Full House';
  if (flush) return 'Flush';
  if (straight) return 'Straight';
  if (counts[0] === 3) return 'Three of a Kind';
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair';
  if (counts[0] === 2) {
    // Jacks or Better: only pairs of J, Q, K, A pay
    const pairedVal = Object.entries(freq).find(([, c]) => c === 2)?.[0];
    if (pairedVal && +pairedVal >= 11) return 'Jacks or Better';
  }
  return null;
}

// ── Pay table (bet × mult = payout) — ~10% more generous ─────────────────────
const PAY_TABLE = [
  { hand: 'Royal Flush',      mult: 440 },
  { hand: 'Straight Flush',   mult: 44  },
  { hand: 'Four of a Kind',   mult: 22  },
  { hand: 'Full House',       mult: 8.8 },
  { hand: 'Flush',            mult: 5.5 },
  { hand: 'Straight',         mult: 4.4 },
  { hand: 'Three of a Kind',  mult: 3.3 },
  { hand: 'Two Pair',         mult: 2.2 },
  { hand: 'Jacks or Better',  mult: 2.2 },
];

// House tax: after the draw, X% of would-be wins get re-rolled on their
// non-held cards until they miss (or the attempts run out). Held cards are
// never touched, so strategic holds still matter — only the RNG-luck wins
// are taxed. Also the player hasn't seen the draw cards yet, so swapping
// them for misses is visually indistinguishable from a natural bad draw.
const HOUSE_TAX_RATE       = 0.30;
const HOUSE_TAX_MAX_TRIES  = 25;

function getMult(handName) {
  return PAY_TABLE.find(p => p.hand === handName)?.mult ?? 0;
}

const QUICK_BETS = [5, 10, 25, 50, 100, 250];

export default function VideoPoker() {
  const { banned, reason, expiresAt, loading } = useBanCheck('video-poker');
  useGameActivity('video-poker');
  const boost = useGameBoost('video-poker');
  const [balance, setBalance]   = useState(getBalance);
  const [bet, setBet]           = useState(10);
  const [deck, setDeck]         = useState([]);
  const [hand, setHand]         = useState([]);       // 5 cards
  const [held, setHeld]         = useState([false, false, false, false, false]);
  const [phase, setPhase]       = useState('betting'); // betting | hold | result
  const [result, setResult]     = useState(null);      // { handName, payout, net }
  const [history, setHistory]   = useState([]);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    initJokerBonuses();
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

  function deal() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();

    const d = createDeck();
    // Rigged: deal a guaranteed losing hand — 2,4,7,9,J in mixed suits (no pair, no straight, no flush)
    const h = isRiggedMode()
      ? [
          { suit: '♠', rank: '2' }, { suit: '♥', rank: '4' },
          { suit: '♦', rank: '7' }, { suit: '♣', rank: '9' },
          { suit: '♠', rank: 'J' },
        ]
      : d.splice(0, 5);
    // Also replace the draw deck with all 2s so held replacements are worthless too
    if (isRiggedMode()) {
      d.splice(0, d.length, ...Array(47).fill(null).map((_, i) =>
        ({ suit: ['♠','♥','♦','♣'][i % 4], rank: '2' })
      ));
    }
    setDeck(d);
    setHand(h);
    setHeld([false, false, false, false, false]);
    setResult(null);
    setPhase('hold');
  }

  function toggleHold(i) {
    if (phase !== 'hold') return;
    setHeld(prev => prev.map((v, idx) => idx === i ? !v : v));
  }

  function draw() {
    if (phase !== 'hold') return;
    let newDeck = [...deck];
    let newHand = hand.map((card, i) => held[i] ? card : newDeck.shift());

    let handName = evalHand(newHand);

    // House tax — apply after the draw, before payout is computed.
    // Skipped in rigged-mode (already a guaranteed junk hand) and when the
    // player holds all 5 cards (they forced the hand, respect it).
    const heldCount = held.filter(Boolean).length;
    if (handName && !isRiggedMode() && heldCount < 5 && Math.random() < HOUSE_TAX_RATE) {
      for (let attempt = 0; attempt < HOUSE_TAX_MAX_TRIES; attempt++) {
        const freshDeck = createDeck();
        const trial = [...newHand];
        let di = 0;
        for (let i = 0; i < 5; i++) {
          if (!held[i]) trial[i] = freshDeck[di++];
        }
        if (!evalHand(trial)) {
          newHand = trial;
          handName = null;
          newDeck = freshDeck.slice(5 - heldCount);
          break;
        }
      }
    }

    setDeck(newDeck);
    setHand(newHand);

    const mult = getMult(handName);
    const payout = Math.floor(bet * mult * boost);

    if (payout > 0) {
      addBalance(payout);
      applyJokerBonus(bet, payout, true);
      syncBalance();
    } else {
      applyJokerBonus(bet, 0, false);
    }

    const net = payout - bet;
    setResult({ handName, payout, mult, net });
    setHistory(prev => [{ handName, net }, ...prev].slice(0, 8));
    setPhase('result');

    reportBigWin('video-poker', bet, payout, mult, handName ? `${handName} · ${mult}×` : 'No win');
    syncBalance();
  }

  function reset() {
    setPhase('betting');
    setHand([]);
    setHeld([false, false, false, false, false]);
    setResult(null);
  }

  const balance_ = getBalance();
  const quickBets = QUICK_BETS.filter(v => v <= balance_);

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
    <div className="vp-table">
      <div className="vp-title">🃏 Video Poker</div>
      <div className="vp-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* History */}
      <div className="vp-history">
        {history.map((h, i) => (
          <span key={i} className={`vp-hist-pill ${h.net > 0 ? 'win' : h.net === 0 ? 'push' : 'lose'}`}>
            {h.net > 0 ? `+$${h.net}` : h.net === 0 ? 'PUSH' : `-$${Math.abs(h.net)}`}
          </span>
        ))}
      </div>

      {/* Pay table */}
      <div className="vp-paytable">
        {PAY_TABLE.map(p => (
          <div key={p.hand} className={`vp-pay-row ${result?.handName === p.hand ? 'vp-pay-row--hit' : ''}`}>
            <span className="vp-pay-hand">{p.hand}</span>
            <span className="vp-pay-mult">{p.mult}×</span>
          </div>
        ))}
      </div>

      {/* Card hand */}
      <div className="vp-hand">
        {(phase === 'betting' ? [{},{},{},{},{}] : hand).map((card, i) => {
          const isEmpty = phase === 'betting';
          const red = !isEmpty && RED_SUITS.has(card.suit);
          return (
            <div
              key={i}
              className={`vp-card ${isEmpty ? 'vp-card--empty' : ''} ${red ? 'vp-card--red' : !isEmpty ? 'vp-card--black' : ''} ${held[i] && phase === 'hold' ? 'vp-card--held' : ''}`}
              onClick={() => toggleHold(i)}
            >
              {!isEmpty && (
                <>
                  <div className="vp-card-corner vp-card-corner--tl">
                    <div>{card.rank}</div><div>{card.suit}</div>
                  </div>
                  <div className="vp-card-center">{card.suit}</div>
                  <div className="vp-card-corner vp-card-corner--br">
                    <div>{card.suit}</div><div>{card.rank}</div>
                  </div>
                </>
              )}
              {phase === 'hold' && (
                <div className={`vp-hold-label ${held[i] ? 'vp-hold-label--on' : ''}`}>
                  {held[i] ? 'HOLD' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Result */}
      {phase === 'result' && result && (
        <div className={`vp-result ${result.net > 0 ? 'win' : result.net === 0 ? 'push' : 'lose'}`}>
          {result.handName
            ? result.net > 0
              ? `✅ ${result.handName}! +$${result.net.toLocaleString()}`
              : `↩️ ${result.handName} — push`
            : `❌ No winning hand — lost $${bet.toLocaleString()}`}
        </div>
      )}

      {/* Controls */}
      {balance_ < 1 ? (
        <div className="vp-broke">
          <div className="vp-broke-title">You're broke! 😬</div>
          <div className="vp-broke-sub">Hourly $1,000 arrives in</div>
          <div className="vp-broke-countdown">{countdown}</div>
        </div>
      ) : (
        <div className="vp-controls">
          {(phase === 'betting' || phase === 'result') && (
            <>
              <div className="vp-bet-row">
                <span>Bet:</span>
                <input
                  className="vp-bet-input"
                  type="number" min={1} max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="vp-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`vp-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`vp-qb ${bet === balance_ ? 'active' : ''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              <button className="vp-btn" onClick={phase === 'result' ? () => { reset(); } : deal}>
                🃏 {phase === 'result' ? 'Deal Again' : 'Deal'}
              </button>
            </>
          )}
          {phase === 'hold' && (
            <>
              <div className="vp-hold-hint">Click cards to hold, then draw</div>
              <button className="vp-btn vp-btn--draw" onClick={draw}>🎴 Draw</button>
            </>
          )}
        </div>
      )}

      <div className="vp-hint">Jacks or Better · Hold your best cards · Click to hold</div>
    </div>
  );
}
