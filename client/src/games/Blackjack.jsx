import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily } from '../utils/casinoBalance';
import './Blackjack.css';

// ── Deck ─────────────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);
const NUM_DECKS = 6;

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

function cardValue(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoft(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return aces > 0 && total <= 21;
}

function isBust(hand)  { return handTotal(hand) > 21; }
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

// ── Card component ────────────────────────────────────────────────────────────
function BjCard({ card, faceDown, small }) {
  if (faceDown) {
    return (
      <div className={`bj-card bj-card--back ${small ? 'bj-card--small' : ''}`}>
        <div className="bj-card-back-pattern" />
      </div>
    );
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`bj-card ${red ? 'bj-card--red' : 'bj-card--black'} ${small ? 'bj-card--small' : ''}`}>
      <div className="bj-card-corner bj-card-tl">
        <div>{card.rank}</div>
        <div>{card.suit}</div>
      </div>
      <div className="bj-card-center">{card.suit}</div>
      <div className="bj-card-corner bj-card-br">
        <div>{card.suit}</div>
        <div>{card.rank}</div>
      </div>
    </div>
  );
}

function Hand({ cards, hideSecond, label, total, soft }) {
  return (
    <div className="bj-hand">
      {label && <div className="bj-hand-label">{label}</div>}
      <div className="bj-cards-row">
        {cards.map((c, i) => (
          <BjCard key={i} card={c} faceDown={hideSecond && i === 1} />
        ))}
      </div>
      {!hideSecond && total !== undefined && (
        <div className={`bj-hand-total ${total > 21 ? 'bust' : total === 21 && cards.length === 2 ? 'blackjack' : ''}`}>
          {total > 21 ? 'BUST' : total === 21 && cards.length === 2 ? 'BLACKJACK!' : `${total}${soft ? ' (soft)' : ''}`}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Blackjack() {
  const shoeRef = useRef(createShoe());

  const [balance, setBalance]     = useState(getBalance);
  const [bet, setBet]             = useState(10);
  const [phase, setPhase]         = useState('betting'); // betting | playing | dealer | result
  const [dealer, setDealer]       = useState([]);
  const [player, setPlayer]       = useState([]);
  const [splits, setSplits]       = useState([]); // array of extra hands from splits
  const [splitIdx, setSplitIdx]   = useState(0);  // which split hand is active
  const [doubled, setDoubled]     = useState(false);
  const [result, setResult]       = useState(null); // { msg, net }
  const [dealAnim, setDealAnim]   = useState(false);
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
    if (shoeRef.current.length < 15) shoeRef.current = createShoe();
    return shoeRef.current.pop();
  }

  function placeBet(amount) {
    const b = getBalance();
    if (amount > b) return;
    setBet(amount);
  }

  function deal() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();

    const c1 = getCard(), c2 = getCard(), d1 = getCard(), d2 = getCard();
    const pHand = [c1, c2];
    const dHand = [d1, d2];
    setPlayer(pHand);
    setDealer(dHand);
    setSplits([]);
    setSplitIdx(0);
    setDoubled(false);
    setResult(null);
    setDealAnim(true);
    setTimeout(() => setDealAnim(false), 400);

    // Check instant blackjack
    if (isBlackjack(pHand)) {
      if (isBlackjack(dHand)) {
        // Push
        addBalance(bet);
        syncBalance();
        setResult({ msg: '🤝 Push — Both Blackjack!', net: 0 });
      } else {
        const payout = Math.floor(bet * 2.5);
        addBalance(payout);
        syncBalance();
        setResult({ msg: '🃏 Blackjack! 3:2 Payout!', net: payout - bet });
      }
      setPhase('result');
    } else {
      setPhase('playing');
    }
  }

  function activeHand() {
    if (splits.length > 0 && splitIdx < splits.length) return splits[splitIdx];
    return player;
  }

  function setActiveHand(hand) {
    if (splits.length > 0 && splitIdx < splits.length) {
      setSplits(sp => { const n=[...sp]; n[splitIdx]=hand; return n; });
    } else {
      setPlayer(hand);
    }
  }

  function hit() {
    const card = getCard();
    const newHand = [...activeHand(), card];
    setActiveHand(newHand);
    if (isBust(newHand)) {
      advanceOrDealer(newHand, true);
    }
  }

  function stand() {
    advanceOrDealer(activeHand(), false);
  }

  function doubleDown() {
    if (getBalance() < bet) return;
    subtractBalance(bet);
    syncBalance();
    setDoubled(true);
    const card = getCard();
    const newHand = [...activeHand(), card];
    setActiveHand(newHand);
    advanceOrDealer(newHand, false);
  }

  function canSplit() {
    const h = activeHand();
    return h.length === 2 && cardValue(h[0].rank) === cardValue(h[1].rank) && getBalance() >= bet && splits.length === 0;
  }

  function splitHand() {
    if (!canSplit()) return;
    subtractBalance(bet);
    syncBalance();
    const [c1, c2] = player;
    const h1 = [c1, getCard()];
    const h2 = [c2, getCard()];
    setPlayer(h1);
    setSplits([h2]);
    setSplitIdx(0);
  }

  function advanceOrDealer(finishedHand, busted) {
    // If there are split hands to play
    if (splits.length > 0) {
      const nextIdx = splitIdx + (splits[splitIdx] !== undefined ? 0 : 0);
      // We've been playing player hand first, then splits
      if (splits[splitIdx] !== undefined && activeHand() === splits[splitIdx]) {
        // Just finished a split hand
        const ni = splitIdx + 1;
        if (ni < splits.length) {
          setSplitIdx(ni);
          return;
        }
      } else {
        // Finished the main player hand — move to first split
        setSplitIdx(0);
        return;
      }
    }
    runDealer(finishedHand, busted);
  }

  function runDealer(lastPlayerHand, busted) {
    setPhase('dealer');
    let dHand = [...dealer];

    // Dealer draws until >= 17 (hits soft 16)
    const draw = () => {
      const total = handTotal(dHand);
      const soft  = isSoft(dHand);
      if (total < 17 || (total === 17 && soft)) {
        dHand = [...dHand, getCard()];
        setDealer([...dHand]);
        setTimeout(draw, 600);
      } else {
        resolveResult(lastPlayerHand, busted, dHand);
      }
    };
    setTimeout(draw, 600);
  }

  function resolveResult(pHand, pBust, dHand) {
    const allHands = splits.length > 0 ? [pHand, ...splits] : [pHand];
    let totalNet = 0;
    const msgs = [];

    const dTotal = handTotal(dHand);
    const dBust  = isBust(dHand);

    allHands.forEach((hand, idx) => {
      const pTotal = handTotal(hand);
      const thisBet = idx === 0 && doubled ? bet * 2 : bet;
      const label = allHands.length > 1 ? ` (Hand ${idx+1})` : '';

      if (pBust && idx === 0) {
        msgs.push(`💥 Bust${label}`);
        totalNet -= thisBet;
      } else if (isBust(hand)) {
        msgs.push(`💥 Bust${label}`);
        totalNet -= thisBet;
      } else if (dBust || pTotal > dTotal) {
        addBalance(thisBet * 2);
        syncBalance();
        msgs.push(`✅ Win${label}`);
        totalNet += thisBet;
      } else if (pTotal === dTotal) {
        addBalance(thisBet);
        syncBalance();
        msgs.push(`🤝 Push${label}`);
        totalNet += 0;
      } else {
        msgs.push(`❌ Lose${label}`);
        totalNet -= thisBet;
      }
    });

    syncBalance();
    setResult({ msg: msgs.join(' · '), net: totalNet });
    setPhase('result');
  }

  const pTotal  = handTotal(player);
  const dTotal  = handTotal(dealer);
  const pSoft   = isSoft(player);
  const balance_ = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const canDouble  = phase === 'playing' && player.length === 2 && balance_ >= bet;
  const inPlay = phase === 'playing';

  return (
    <div className="bj-table">
      <div className="bj-title">♠ Blackjack</div>

      {/* Balance */}
      <div className="bj-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Dealer hand */}
      <Hand
        cards={dealer}
        hideSecond={phase === 'playing'}
        label="Dealer"
        total={phase !== 'playing' ? dTotal : undefined}
      />

      {/* Player hand */}
      {phase !== 'betting' && (
        <Hand
          cards={player}
          label={splits.length > 0 ? 'Your Hand' : 'You'}
          total={pTotal}
          soft={pSoft}
        />
      )}

      {/* Split hands */}
      {splits.map((h, i) => (
        <Hand key={i} cards={h} label={`Split ${i+1}`} total={handTotal(h)} />
      ))}

      {/* Result */}
      {result && (
        <div className={`bj-result ${result.net > 0 ? 'win' : result.net < 0 ? 'lose' : 'push'}`}>
          <div className="bj-result-msg">{result.msg}</div>
          <div className="bj-result-net">
            {result.net > 0 ? `+$${result.net}` : result.net < 0 ? `-$${Math.abs(result.net)}` : 'No change'}
          </div>
        </div>
      )}

      {/* Betting UI */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="bj-betting">
          {balance_ < 1 ? (
            <div className="bj-broke">
              <div className="bj-broke-title">You're broke! 😬</div>
              <div className="bj-broke-sub">Your daily $250 arrives in</div>
              <div className="bj-broke-countdown">{countdown}</div>
            </div>
          ) : (
            <>
              <div className="bj-bet-row">
                <span className="bj-bet-label">Bet:</span>
                <input
                  className="bj-bet-input"
                  type="number"
                  min={1}
                  max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value)||1)))}
                />
              </div>
              <div className="bj-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`bj-qb ${bet===v?'active':''}`} onClick={() => placeBet(v)}>${v}</button>
                ))}
                <button className={`bj-qb ${bet===balance_?'active':''}`} onClick={() => placeBet(balance_)}>All In</button>
              </div>
              <button className="bj-btn bj-btn--deal" onClick={deal}>
                {phase === 'result' ? '🃏 Deal Again' : '🃏 Deal'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Playing controls */}
      {inPlay && (
        <div className="bj-controls">
          <button className="bj-btn bj-btn--hit"   onClick={hit}>Hit</button>
          <button className="bj-btn bj-btn--stand" onClick={stand}>Stand</button>
          {canDouble && (
            <button className="bj-btn bj-btn--double" onClick={doubleDown}>Double</button>
          )}
          {canSplit() && (
            <button className="bj-btn bj-btn--split" onClick={splitHand}>Split</button>
          )}
        </div>
      )}

      <div className="bj-hint">Dealer hits soft 16 • Blackjack pays 3:2 • {NUM_DECKS}-deck shoe</div>
    </div>
  );
}
