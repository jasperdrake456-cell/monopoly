import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './RideTheBus.css';
import useBanCheck from '../hooks/useBanCheck';

// ── Deck constants ──────────────────────────────────────────────────────────
const SUITS    = ['hearts', 'diamonds', 'clubs', 'spades'];
const SYM      = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_LBL = { hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' };
const IS_RED   = { hearts: true, diamonds: true, clubs: false, spades: false };
const VALUES   = [2,3,4,5,6,7,8,9,10,11,12,13,14];
const VAL_LBL  = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };

// Schedule 1 multipliers: round 1=2x, 2=3x, 3=4x, 4=20x
const MULTIPLIERS = [0, 2, 3, 4, 20];

function createDeck() {
  const cards = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      cards.push({ suit, value });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ── Playing card visual ──────────────────────────────────────────────────────
function Card({ card, faceDown, flipping }) {
  if (faceDown && !flipping) {
    return (
      <div className="rtb-card rtb-card--back">
        <div className="rtb-card-back-inner">
          <div className="rtb-card-back-pattern" />
          <span className="rtb-card-back-label">?</span>
        </div>
      </div>
    );
  }
  if (!card) return <div className="rtb-card rtb-card--empty" />;
  const red  = IS_RED[card.suit];
  const sym  = SYM[card.suit];
  const lbl  = VAL_LBL[card.value];
  return (
    <div className={`rtb-card ${red ? 'rtb-card--red' : 'rtb-card--black'} ${flipping ? 'rtb-card--flip' : ''}`}>
      <div className="rtb-card-corner rtb-card-corner--tl">
        <div>{lbl}</div><div>{sym}</div>
      </div>
      <div className="rtb-card-center">{sym}</div>
      <div className="rtb-card-corner rtb-card-corner--br">
        <div>{sym}</div><div>{lbl}</div>
      </div>
    </div>
  );
}

// ── Main game component ──────────────────────────────────────────────────────
export default function RideTheBus() {
  const { banned, reason, expiresAt, loading } = useBanCheck('ride-the-bus');
  const deckRef = useRef([]);

  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet]         = useState(10);
  const [phase, setPhase]     = useState('betting');
  // 'betting' | 'guessing' | 'decide' | 'over'
  const [round, setRound]     = useState(0);
  const [revealed, setRevealed] = useState([]); // all face-up cards
  const [pending, setPending] = useState(null);  // face-down card awaiting guess
  const [flipping, setFlipping] = useState(false);
  const [result, setResult]   = useState(null);  // { correct, msg, payout }
  const [countdown, setCountdown] = useState('');

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
    return () => clearInterval(id);
  }, []);

  // ── Betting screen ────────────────────────────────────────────────────────
  function startGame() {
    const deck = createDeck();
    deckRef.current = deck;
    const first = deckRef.current.pop();
    setRevealed([]);
    setPending(first);
    setRound(1);
    setResult(null);
    setFlipping(false);
    subtractBalance(bet);
    setBalance(getBalance());
    setPhase('guessing');
  }

  // ── Guessing ──────────────────────────────────────────────────────────────
  function makeGuess(guess) {
    const card = pending;
    let correct = false;

    switch (round) {
      case 1:
        correct = (guess === 'red') === IS_RED[card.suit];
        break;
      case 2: {
        const prev = revealed[revealed.length - 1].value;
        correct = guess === 'higher' ? card.value > prev : card.value < prev;
        break;
      }
      case 3: {
        const vals = revealed.map(c => c.value);
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const inside = lo < hi && card.value > lo && card.value < hi;
        correct = guess === 'inside' ? inside : !inside;
        break;
      }
      case 4:
        correct = card.suit === guess;
        break;
      default: break;
    }

    // Flip animation then reveal
    setFlipping(true);
    setTimeout(() => {
      setFlipping(false);
      const newRevealed = [...revealed, card];
      setRevealed(newRevealed);
      setPending(null);

      if (!correct) {
        setResult({
          correct: false,
          msg: `Wrong! The card was ${VAL_LBL[card.value]}${SYM[card.suit]}.`,
          payout: 0,
        });
        setPhase('over');
      } else if (round === 4) {
        const payout = bet * MULTIPLIERS[4];
        addBalance(payout);
        setBalance(getBalance());
        setResult({ correct: true, msg: `JACKPOT! ${MULTIPLIERS[4]}× your bet!`, payout });
        setPhase('over');
      } else {
        const payout = bet * MULTIPLIERS[round];
        setResult({ correct: true, msg: `Correct! Cash out $${payout} or ride for more?`, payout });
        setPhase('decide');
      }
    }, 350);
  }

  // ── Cash out ──────────────────────────────────────────────────────────────
  function cashOut() {
    const payout = bet * MULTIPLIERS[round];
    addBalance(payout);
    setBalance(getBalance());
    setResult({ correct: true, msg: `Cashed out $${payout} (${MULTIPLIERS[round]}×)`, payout });
    setPhase('over');
  }

  // ── Continue to next round ────────────────────────────────────────────────
  function continueGame() {
    const next = deckRef.current.pop();
    setPending(next);
    setRound(r => r + 1);
    setResult(null);
    setFlipping(false);
    setPhase('guessing');
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function reset() {
    setBalance(getBalance());
    setPhase('betting');
    setRound(0);
    setRevealed([]);
    setPending(null);
    setFlipping(false);
    setResult(null);
    const b = getBalance();
    setBet(Math.min(bet > 0 ? bet : 10, b > 0 ? b : 1));
  }

  // ── Quick-bet helpers ─────────────────────────────────────────────────────
  const quickBets = [10, 25, 50, 100].filter(v => v <= balance);

  // ── Render helpers ────────────────────────────────────────────────────────
  function getQuestion() {
    switch (round) {
      case 1: return 'Red or Black?';
      case 2: return `Higher or Lower than ${VAL_LBL[revealed[revealed.length - 1]?.value]}?`;
      case 3: {
        const vals = revealed.map(c => c.value);
        const lo = Math.min(...vals), hi = Math.max(...vals);
        if (lo === hi) return 'Inside or Outside?';
        return `Inside (${VAL_LBL[lo]}–${VAL_LBL[hi]}) or Outside?`;
      }
      case 4: return 'Pick the Suit!';
      default: return '';
    }
  }

  const ROUND_MULTS = ['', '2×', '3×', '4×', '20×'];

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

  // ── BETTING SCREEN ────────────────────────────────────────────────────────
  if (phase === 'betting') {
    return (
      <div className="rtb-felt">
        <div className="rtb-title">🚌 Ride the Bus</div>
        <div className="rtb-balance-big">💰 ${balance}</div>

        <div className="rtb-rounds-preview">
          {[1,2,3,4].map(r => (
            <div key={r} className="rtb-round-preview">
              <div className="rtb-rp-label">{['Red/Black','Hi/Lo','In/Out','Suit'][r-1]}</div>
              <div className="rtb-rp-mult">{ROUND_MULTS[r]}</div>
            </div>
          ))}
        </div>

        {balance < 1 ? (
          <div className="rtb-broke">
            <div className="rtb-broke-msg">You're broke! 😬</div>
            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Your hourly $1,000 arrives in</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFD700', letterSpacing: 1 }}>{countdown}</div>
          </div>
        ) : (
          <>
            <div className="rtb-bet-section">
              <div className="rtb-bet-label">Your Bet</div>
              <input
                className="rtb-bet-input"
                type="number"
                min={1}
                max={balance}
                value={bet}
                onChange={e => setBet(Math.max(1, Math.min(balance, parseInt(e.target.value) || 1)))}
              />
              <div className="rtb-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`rtb-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>
                    ${v}
                  </button>
                ))}
                <button className={`rtb-qb ${bet === balance ? 'active' : ''}`} onClick={() => setBet(balance)}>
                  All In
                </button>
              </div>
            </div>
            <div className="rtb-potential">
              Win all 4: <span className="rtb-potential-val">${bet * 20}</span>
            </div>
            <button className="rtb-btn rtb-btn--start" onClick={startGame}>
              🚌 Ride the Bus!
            </button>
          </>
        )}
      </div>
    );
  }

  // ── GAME SCREEN (guessing / decide / over) ────────────────────────────────
  const totalCards = round; // always 1 card per round
  const allCards = [...revealed, pending]; // pending is the face-down one (if present)

  return (
    <div className="rtb-felt">
      {/* Round progress */}
      <div className="rtb-progress">
        {[1,2,3,4].map(r => (
          <div key={r} className={`rtb-step ${r < round ? 'done' : r === round ? 'active' : 'pending'}`}>
            <div className="rtb-step-dot" />
            <div className="rtb-step-lbl">{ROUND_MULTS[r]}</div>
          </div>
        ))}
      </div>

      {/* Balance & bet */}
      <div className="rtb-game-info">
        <span>Balance: <b>${balance + (phase === 'over' && !result?.correct ? 0 : 0)}</b></span>
        <span>Bet: <b>${bet}</b></span>
        {phase === 'decide' && <span className="rtb-cashout-preview">Cash out: <b>${bet * MULTIPLIERS[round]}</b></span>}
      </div>

      {/* Cards row */}
      <div className="rtb-cards-row">
        {/* Slots 1–4 */}
        {[0,1,2,3].map(i => {
          const card   = revealed[i] ?? null;
          const isCur  = i === revealed.length && pending !== null;
          const isEmpty = !card && !isCur;
          return (
            <div key={i} className={`rtb-card-slot ${i + 1 === round ? 'rtb-card-slot--active' : ''}`}>
              <div className="rtb-slot-round">R{i+1}</div>
              {isEmpty
                ? <div className="rtb-card rtb-card--empty" />
                : isCur
                  ? <Card card={pending} faceDown={!flipping} flipping={flipping} />
                  : <Card card={card} faceDown={false} />
              }
            </div>
          );
        })}
      </div>

      {/* Question / result message */}
      <div className={`rtb-message ${result ? (result.correct ? 'correct' : 'wrong') : ''}`}>
        {phase === 'guessing' && <span>{getQuestion()}</span>}
        {phase === 'decide'   && <span>{result?.msg}</span>}
        {phase === 'over'     && <span>{result?.msg}</span>}
      </div>

      {/* Action buttons */}
      {phase === 'guessing' && (
        <div className="rtb-actions">
          {round === 1 && (
            <>
              <button className="rtb-btn rtb-btn--red"   onClick={() => makeGuess('red')}>🔴 Red</button>
              <button className="rtb-btn rtb-btn--black" onClick={() => makeGuess('black')}>⚫ Black</button>
            </>
          )}
          {round === 2 && (
            <>
              <button className="rtb-btn rtb-btn--up"   onClick={() => makeGuess('higher')}>⬆ Higher</button>
              <button className="rtb-btn rtb-btn--down" onClick={() => makeGuess('lower')}>⬇ Lower</button>
            </>
          )}
          {round === 3 && (
            <>
              <button className="rtb-btn rtb-btn--in"  onClick={() => makeGuess('inside')}>↔ Inside</button>
              <button className="rtb-btn rtb-btn--out" onClick={() => makeGuess('outside')}>↕ Outside</button>
            </>
          )}
          {round === 4 && (
            <div className="rtb-suit-btns">
              <button className="rtb-btn rtb-btn--hearts"   onClick={() => makeGuess('hearts')}>♥ Hearts</button>
              <button className="rtb-btn rtb-btn--diamonds" onClick={() => makeGuess('diamonds')}>♦ Diamonds</button>
              <button className="rtb-btn rtb-btn--clubs"    onClick={() => makeGuess('clubs')}>♣ Clubs</button>
              <button className="rtb-btn rtb-btn--spades"   onClick={() => makeGuess('spades')}>♠ Spades</button>
            </div>
          )}
        </div>
      )}

      {phase === 'decide' && (
        <div className="rtb-actions rtb-decide">
          <button className="rtb-btn rtb-btn--cashout" onClick={cashOut}>
            💰 Cash Out ${bet * MULTIPLIERS[round]}
          </button>
          <button className="rtb-btn rtb-btn--continue" onClick={continueGame}>
            🚌 Keep Riding → {ROUND_MULTS[round + 1]}
          </button>
        </div>
      )}

      {phase === 'over' && (
        <div className="rtb-actions">
          <button className="rtb-btn rtb-btn--primary" onClick={reset}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  );
}
