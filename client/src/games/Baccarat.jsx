import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Baccarat.css';

// ── Deck ─────────────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);
const NUM_DECKS = 8;

function createShoe() {
  const cards = [];
  for (let d = 0; d < NUM_DECKS; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ suit, rank });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Baccarat card value: 10/J/Q/K = 0, A = 1, others face value
function bVal(rank) {
  if (rank === 'A') return 1;
  const n = parseInt(rank, 10);
  if (!isNaN(n)) return n >= 10 ? 0 : n;
  return 0; // J Q K
}

function handScore(hand) {
  return hand.reduce((s, c) => (s + bVal(c.rank)) % 10, 0);
}

// ── Card visual ───────────────────────────────────────────────────────────────
function BacCard({ card, faceDown }) {
  if (faceDown) {
    return (
      <div className="bac-card bac-card--back">
        <div className="bac-card-back-pattern" />
      </div>
    );
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`bac-card ${red ? 'bac-card--red' : 'bac-card--black'}`}>
      <div className="bac-corner bac-tl">
        <div>{card.rank}</div><div>{card.suit}</div>
      </div>
      <div className="bac-center">{card.suit}</div>
      <div className="bac-corner bac-br">
        <div>{card.suit}</div><div>{card.rank}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Baccarat() {
  const shoeRef   = useRef(createShoe());
  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet]         = useState(10);
  const [side, setSide]       = useState('player'); // 'player' | 'banker' | 'tie'
  const [phase, setPhase]     = useState('betting'); // betting | animating | result
  const [playerHand, setPlayerHand] = useState([]);
  const [bankerHand, setBankerHand] = useState([]);
  const [result, setResult]   = useState(null); // { winner, msg, net }
  const [step, setStep]       = useState(0); // for card-by-card reveal
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

  function syncBalance() { setBalance(getBalance()); }

  function getCard() {
    if (shoeRef.current.length < 20) shoeRef.current = createShoe();
    return shoeRef.current.pop();
  }

  function deal() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();

    // Deal: P1 B1 P2 B2
    const p1 = getCard(), b1 = getCard(), p2 = getCard(), b2 = getCard();
    const pHand = [p1, p2];
    const bHand = [b1, b2];

    setPlayerHand(pHand);
    setBankerHand(bHand);
    setResult(null);
    setStep(0);
    setPhase('animating');

    // Baccarat natural check
    const pScore = handScore(pHand);
    const bScore = handScore(bHand);

    let finalPHand = [...pHand];
    let finalBHand = [...bHand];

    // Draw rules
    if (pScore <= 5 && pScore < 8 && bScore < 8) {
      const p3 = getCard();
      finalPHand = [...pHand, p3];
      const p3Val = bVal(p3.rank);
      const newBScore = handScore(finalBHand);
      // Banker draw rule based on p3Val
      let bankerDraws = false;
      if (newBScore <= 2) bankerDraws = true;
      else if (newBScore === 3 && p3Val !== 8) bankerDraws = true;
      else if (newBScore === 4 && [2,3,4,5,6,7].includes(p3Val)) bankerDraws = true;
      else if (newBScore === 5 && [4,5,6,7].includes(p3Val)) bankerDraws = true;
      else if (newBScore === 6 && [6,7].includes(p3Val)) bankerDraws = true;
      if (bankerDraws) finalBHand = [...bHand, getCard()];
    } else if (bScore <= 5 && bScore < 8 && pScore >= 6) {
      // Player didn't draw, banker draws on 0-5
      finalBHand = [...bHand, getCard()];
    }

    // Reveal with animation delay
    setTimeout(() => {
      setPlayerHand(finalPHand);
      setBankerHand(finalBHand);

      const fp = handScore(finalPHand);
      const fb = handScore(finalBHand);
      let winner;
      if (fp > fb)      winner = 'player';
      else if (fb > fp) winner = 'banker';
      else              winner = 'tie';

      let net = 0;
      let msg = '';
      if (winner === 'tie' && side === 'tie') {
        const payout = bet * 8;
        addBalance(payout + bet);
        net = payout;
        msg = `🎉 Tie! You win $${payout} (8:1)!`;
      } else if (winner === side && side !== 'tie') {
        const mult = side === 'banker' ? 0.95 : 1;
        const payout = Math.floor(bet * mult);
        addBalance(bet + payout);
        net = payout;
        msg = `✅ ${winner === 'player' ? 'Player' : 'Banker'} wins! +$${payout}`;
      } else if (winner === 'tie') {
        // Push on tie when not betting tie
        addBalance(bet);
        net = 0;
        msg = `🤝 Tie — push`;
      } else {
        net = -bet;
        msg = `❌ ${winner === 'player' ? 'Player' : 'Banker'} wins. You lose $${bet}`;
      }

      syncBalance();
      setResult({ winner, msg, net, playerScore: fp, bankerScore: fb });
      setPhase('result');
    }, 1200);
  }

  const balance_ = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);

  const PAYOUTS = {
    player: '1:1',
    banker: '0.95:1 (5% commission)',
    tie:    '8:1',
  };

  return (
    <div className="bac-table">
      <div className="bac-title">🎴 Baccarat</div>
      <div className="bac-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Bet side selector */}
      <div className="bac-sides">
        {['player','banker','tie'].map(s => (
          <button
            key={s}
            className={`bac-side-btn bac-side-btn--${s} ${side === s ? 'selected' : ''}`}
            onClick={() => setSide(s)}
            disabled={phase === 'animating'}
          >
            <span className="bac-side-name">{s === 'player' ? 'Player' : s === 'banker' ? 'Banker' : 'Tie'}</span>
            <span className="bac-side-payout">{PAYOUTS[s]}</span>
          </button>
        ))}
      </div>

      {/* Hands */}
      {phase !== 'betting' && (
        <div className="bac-hands">
          <div className="bac-hand-section">
            <div className="bac-hand-title">🫴 Player</div>
            <div className="bac-hand-cards">
              {playerHand.map((c, i) => <BacCard key={i} card={c} />)}
            </div>
            {phase === 'result' && result && (
              <div className={`bac-score ${result.winner==='player'?'winner':''}`}>{result.playerScore}</div>
            )}
          </div>

          <div className="bac-vs">VS</div>

          <div className="bac-hand-section">
            <div className="bac-hand-title">🏦 Banker</div>
            <div className="bac-hand-cards">
              {bankerHand.map((c, i) => <BacCard key={i} card={c} />)}
            </div>
            {phase === 'result' && result && (
              <div className={`bac-score ${result.winner==='banker'?'winner':''}`}>{result.bankerScore}</div>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`bac-result ${result.net > 0 ? 'win' : result.net < 0 ? 'lose' : 'push'}`}>
          <div className="bac-result-msg">{result.msg}</div>
        </div>
      )}

      {/* Betting / play again */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="bac-betting">
          {balance_ < 1 ? (
            <div className="bac-broke">
              <div className="bac-broke-title">You're broke! 😬</div>
              <div className="bac-broke-sub">Your daily $250 arrives in</div>
              <div className="bac-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="bac-bet-row">
                <span>Bet:</span>
                <input
                  className="bac-bet-input"
                  type="number"
                  min={1}
                  max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
                />
              </div>
              <div className="bac-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`bac-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`bac-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              <button className="bac-btn bac-btn--deal" onClick={deal} disabled={phase==='animating'}>
                {phase === 'result' ? '🎴 Deal Again' : '🎴 Deal'}
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'animating' && (
        <div className="bac-dealing">Dealing cards…</div>
      )}

      <div className="bac-hint">
        Natural 8 or 9 wins immediately · Banker wins pay 5% commission · Tie bets push on natural
      </div>
    </div>
  );
}
