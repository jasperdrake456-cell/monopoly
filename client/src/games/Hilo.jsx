import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Hilo.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

// Standard 52-card deck
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

// House edge per pick
const HOUSE_EDGE = 0.99;

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Given current card value, compute multiplier for higher/lower bet
// mult = (totalRemaining / countInDirection) * HOUSE_EDGE
function calcMultipliers(cardValue, usedValues) {
  const fullDeck = buildDeck();
  const usedCount = usedValues.length;
  const totalRemaining = 52 - usedCount;

  let higher = 0, lower = 0, equal = 0;
  for (const c of fullDeck) {
    // Count how many of this rank have already been used
    const alreadyUsed = usedValues.filter(v => v === c.value).length;
    const available = 4 - alreadyUsed;
    if (available <= 0) continue;
    if (c.value > cardValue) higher += available;
    else if (c.value < cardValue) lower += available;
    else equal += available;
  }

  // Show multiplier whenever there are valid cards in that direction
  const multHigher = higher > 0
    ? parseFloat(((totalRemaining / higher) * HOUSE_EDGE).toFixed(2))
    : null;
  const multLower = lower > 0
    ? parseFloat(((totalRemaining / lower) * HOUSE_EDGE).toFixed(2))
    : null;

  return { higher, lower, equal, total: totalRemaining, multHigher, multLower };
}

function cardColor(suit) {
  return suit === '♥' || suit === '♦' ? '#ef4444' : '#fff';
}

const MAX_HISTORY = 8;

export default function Hilo() {
  const { banned, reason, expiresAt, loading } = useBanCheck('hilo');
  useGameActivity('hilo');
  const [balance, setBalance]       = useState(getBalance);
  const [bet, setBet]               = useState(10);
  const [phase, setPhase]           = useState('betting'); // betting | playing | won | lost
  const [deck, setDeck]             = useState([]);
  const [cardIndex, setCardIndex]   = useState(0);
  const [revealedCards, setRevealedCards] = useState([]);
  const [currentMult, setCurrentMult]     = useState(1.00);
  const [profit, setProfit]         = useState(0);
  const [lastGuess, setLastGuess]   = useState(null); // 'higher'|'lower'
  const [history, setHistory]       = useState([]);
  const [countdown, setCountdown]   = useState('');
  const [animating, setAnimating]   = useState(false);

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

  function startGame() {
    const b = getBalance();
    if (bet < 1 || bet > b) return;
    subtractBalance(bet);
    syncBalance();

    const shuffled = shuffleDeck(buildDeck());
    setDeck(shuffled);
    setCardIndex(0);
    setRevealedCards([shuffled[0]]);
    setCurrentMult(1.00);
    setProfit(0);
    setLastGuess(null);
    setPhase('playing');
  }

  function guess(direction) {
    if (phase !== 'playing' || animating) return;
    const currentCard = revealedCards[revealedCards.length - 1];
    const nextCard = deck[cardIndex + 1];
    if (!nextCard) return;

    setAnimating(true);
    setLastGuess(direction);

    const isCorrect =
      (direction === 'higher' && nextCard.value > currentCard.value) ||
      (direction === 'lower'  && nextCard.value < currentCard.value);

    // Skip ties — ties always lose (no tie refund — house keeps)
    const isTie = nextCard.value === currentCard.value;

    const usedValues = revealedCards.map(c => c.value);
    const { multHigher, multLower } = calcMultipliers(currentCard.value, usedValues);
    const pickedMult = direction === 'higher' ? multHigher : multLower;

    setTimeout(() => {
      const newRevealed = [...revealedCards, nextCard];
      setRevealedCards(newRevealed);
      setCardIndex(i => i + 1);

      if (isCorrect && !isTie) {
        const newMult = parseFloat((currentMult * pickedMult).toFixed(2));
        setCurrentMult(newMult);
        setProfit(Math.floor(bet * newMult) - bet);
        // Max 10 correct guesses then auto-win
        if (newRevealed.length >= 11) {
          cashOut(newMult);
        } else {
          setPhase('playing');
        }
      } else {
        // Wrong or tie = lose
        setPhase('lost');
        setHistory(h => [{ win: false, mult: currentMult }, ...h].slice(0, MAX_HISTORY));
        syncBalance();
      }
      setAnimating(false);
    }, 400);
  }

  function cashOut(forceMult) {
    const mult = forceMult ?? currentMult;
    const payout = Math.floor(bet * mult);
    addBalance(payout);
    syncBalance();
    setProfit(payout - bet);
    setPhase('won');
    setHistory(h => [{ win: true, mult }, ...h].slice(0, MAX_HISTORY));
  }

  function reset() {
    setPhase('betting');
    setDeck([]);
    setRevealedCards([]);
    setCardIndex(0);
    setCurrentMult(1.00);
    setProfit(0);
    setLastGuess(null);
    syncBalance();
  }

  const bal = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= bal);
  const currentCard = revealedCards[revealedCards.length - 1];
  const usedValues = revealedCards.map(c => c.value);
  const mults = currentCard ? calcMultipliers(currentCard.value, usedValues) : null;

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
    <div className="hilo-table">
      <div className="hilo-title">🃏 HiLo</div>
      <div className="hilo-balance">💰 Balance: <strong>${bal.toLocaleString()}</strong></div>

      {/* History */}
      <div className="hilo-history">
        {history.map((h, i) => (
          <span key={i} className={`hilo-hist-pill ${h.win ? 'win' : 'lose'}`}>
            {h.win ? `+${h.mult.toFixed(2)}×` : `✗`}
          </span>
        ))}
        {history.length === 0 && <span className="hilo-hist-empty">No rounds yet</span>}
      </div>

      {/* Card display */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost') && (
        <div className="hilo-cards-area">
          <div className="hilo-cards-scroll">
            {revealedCards.map((card, i) => (
              <div
                key={i}
                className={`hilo-card ${i === revealedCards.length - 1 ? 'hilo-card--current' : 'hilo-card--old'}`}
                style={{ color: cardColor(card.suit) }}
              >
                <div className="hilo-card-rank">{card.rank}</div>
                <div className="hilo-card-suit">{card.suit}</div>
              </div>
            ))}
          </div>

          <div className="hilo-mult-display">
            <span className="hilo-mult-label">Multiplier</span>
            <span className="hilo-mult-value" style={{ color: currentMult >= 2 ? '#22c55e' : '#eab308' }}>
              {currentMult.toFixed(2)}×
            </span>
            <span className="hilo-mult-cashval">Cash out: ${Math.floor(bet * currentMult)}</span>
          </div>
        </div>
      )}

      {/* Phase: betting */}
      {phase === 'betting' && (
        <div className="hilo-betting">
          {bal < 1 ? (
            <div className="hilo-broke">
              <div className="hilo-broke-title">You're broke! 😬</div>
              <div className="hilo-broke-sub">Your hourly $1,000 arrives in</div>
              <div className="hilo-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="hilo-input-group">
                <label className="hilo-label">Bet Amount</label>
                <input
                  className="hilo-input"
                  type="number" min={1} max={bal}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(bal, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="hilo-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`hilo-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`hilo-qb ${bet === bal ? 'active' : ''}`} onClick={() => setBet(bal)}>All In</button>
              </div>
              <button className="hilo-btn hilo-btn--start" onClick={startGame}>
                🃏 Deal Card
              </button>
            </>
          )}
        </div>
      )}

      {/* Phase: playing */}
      {phase === 'playing' && currentCard && mults && (
        <div className="hilo-controls">
          <button
            className="hilo-btn hilo-btn--higher"
            onClick={() => guess('higher')}
            disabled={animating || !mults.multHigher}
          >
            ⬆️ Higher
            {mults.multHigher ? <span className="hilo-btn-mult">{mults.multHigher}×</span> : <span className="hilo-btn-mult">N/A</span>}
          </button>
          <button
            className="hilo-btn hilo-btn--cashout"
            onClick={() => cashOut()}
            disabled={animating || currentMult <= 1.0}
          >
            💰 Cash Out ${Math.floor(bet * currentMult)}
          </button>
          <button
            className="hilo-btn hilo-btn--lower"
            onClick={() => guess('lower')}
            disabled={animating || !mults.multLower}
          >
            ⬇️ Lower
            {mults.multLower ? <span className="hilo-btn-mult">{mults.multLower}×</span> : <span className="hilo-btn-mult">N/A</span>}
          </button>
          <div className="hilo-tie-warning">⚠️ Ties lose</div>
        </div>
      )}

      {/* Phase: won */}
      {phase === 'won' && (
        <div className="hilo-result hilo-result--win">
          <div className="hilo-result-emoji">🎉</div>
          <div className="hilo-result-title">Cashed Out!</div>
          <div className="hilo-result-sub">+${profit} at {currentMult.toFixed(2)}×</div>
          <button className="hilo-btn hilo-btn--start" onClick={reset}>🔄 Play Again</button>
        </div>
      )}

      {/* Phase: lost */}
      {phase === 'lost' && (
        <div className="hilo-result hilo-result--lose">
          <div className="hilo-result-emoji">💥</div>
          <div className="hilo-result-title">Wrong Guess!</div>
          <div className="hilo-result-sub">Lost ${bet}</div>
          <button className="hilo-btn hilo-btn--start" onClick={reset}>🔄 Try Again</button>
        </div>
      )}

      <div className="hilo-hint">Guess higher or lower • Ties lose • Cash out anytime • 1% house edge</div>
    </div>
  );
}
