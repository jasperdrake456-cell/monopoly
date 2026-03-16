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
// Natural blackjack: exactly 2 cards totaling 21 (not after split)
function isBlackjack(hand) { return hand.length === 2 && handTotal(hand) === 21; }

// ── Card component ────────────────────────────────────────────────────────────
function BjCard({ card, faceDown }) {
  if (faceDown) {
    return (
      <div className="bj-card bj-card--back">
        <div className="bj-card-back-pattern" />
      </div>
    );
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`bj-card ${red ? 'bj-card--red' : 'bj-card--black'}`}>
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

function Hand({ cards, hideSecond, label, total, soft, active, handResult }) {
  const activeClass = active === true ? 'bj-hand--active' : active === false ? 'bj-hand--inactive' : '';
  return (
    <div className={`bj-hand ${activeClass}`}>
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
      {handResult && (
        <div className={`bj-hand-result ${handResult.net > 0 ? 'win' : handResult.net < 0 ? 'lose' : 'push'}`}>
          {handResult.msg} {handResult.net > 0 ? `+$${handResult.net}` : handResult.net < 0 ? `-$${Math.abs(handResult.net)}` : ''}
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
  // hands: [{ cards: [], bet: number, doubled: boolean }]
  const [hands, setHands]         = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [splitAces, setSplitAces] = useState(false);
  const [results, setResults]     = useState([]); // [{ msg, net }] per hand
  const [totalNet, setTotalNet]   = useState(null);
  const [countdown, setCountdown] = useState('');

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

  function deal() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();

    const c1 = getCard(), c2 = getCard(), d1 = getCard(), d2 = getCard();
    const pHand = [c1, c2];
    const dHand = [d1, d2];

    const initialHands = [{ cards: pHand, bet, doubled: false }];
    setHands(initialHands);
    setDealer(dHand);
    setActiveIdx(0);
    setSplitAces(false);
    setResults([]);
    setTotalNet(null);

    // Natural blackjack check (only on initial 2-card deal, not after split)
    if (isBlackjack(pHand)) {
      if (isBlackjack(dHand)) {
        // Push — return original bet
        addBalance(bet);
        syncBalance();
        setResults([{ msg: '🤝 Push — Both Blackjack!', net: 0 }]);
        setTotalNet(0);
      } else {
        // Blackjack pays 3:2 — profit = 1.5× bet (floor on odd bets)
        const profit = Math.floor(bet * 1.5);
        addBalance(bet + profit); // return original bet + profit
        syncBalance();
        setResults([{ msg: `🃏 Blackjack! 3:2 Payout!`, net: profit }]);
        setTotalNet(profit);
      }
      setPhase('result');
    } else {
      setPhase('playing');
    }
  }

  function split() {
    const h0 = hands[0];
    if (hands.length !== 1 || h0.cards.length !== 2) return;
    if (cardValue(h0.cards[0].rank) !== cardValue(h0.cards[1].rank)) return;
    if (getBalance() < h0.bet) return;

    subtractBalance(h0.bet);
    syncBalance();

    const isAces = h0.cards[0].rank === 'A';
    const hand1 = { cards: [h0.cards[0], getCard()], bet: h0.bet, doubled: false };
    const hand2 = { cards: [h0.cards[1], getCard()], bet: h0.bet, doubled: false };
    const newHands = [hand1, hand2];

    setHands(newHands);
    setSplitAces(isAces);

    if (isAces) {
      // Split aces: one card each, no further actions — run dealer immediately
      runDealerWith(newHands, dealer);
    } else {
      setActiveIdx(0);
    }
  }

  function hit() {
    const card = getCard();
    const newHands = hands.map((h, i) =>
      i === activeIdx ? { ...h, cards: [...h.cards, card] } : h
    );
    setHands(newHands);
    if (isBust(newHands[activeIdx].cards)) {
      advanceHand(newHands, activeIdx, dealer);
    }
  }

  function stand() {
    advanceHand(hands, activeIdx, dealer);
  }

  function doubleDown() {
    const h = hands[activeIdx];
    if (getBalance() < h.bet) return;
    subtractBalance(h.bet);
    syncBalance();
    const card = getCard();
    const newHands = hands.map((hand, i) =>
      i === activeIdx ? { ...hand, cards: [...hand.cards, card], doubled: true } : hand
    );
    setHands(newHands);
    advanceHand(newHands, activeIdx, dealer);
  }

  function advanceHand(currentHands, idx, dHand) {
    if (idx + 1 < currentHands.length) {
      setActiveIdx(idx + 1);
    } else {
      runDealerWith(currentHands, dHand);
    }
  }

  function runDealerWith(currentHands, initialDealerHand) {
    setPhase('dealer');
    let dHand = [...initialDealerHand];

    const draw = () => {
      const total = handTotal(dHand);
      const soft  = isSoft(dHand);
      // Dealer must hit on all 16 and below, and on soft 17
      if (total < 17 || (total === 17 && soft)) {
        dHand = [...dHand, getCard()];
        setDealer([...dHand]);
        setTimeout(draw, 600);
      } else {
        resolveAll(currentHands, dHand);
      }
    };
    setTimeout(draw, 600);
  }

  function resolveAll(currentHands, dHand) {
    const dTotal = handTotal(dHand);
    const dBust  = isBust(dHand);
    let netTotal = 0;

    const handResults = currentHands.map(hand => {
      // When doubled, the total risk is bet * 2 (original bet already deducted on deal, extra on double)
      const thisBet = hand.doubled ? hand.bet * 2 : hand.bet;
      const pTotal  = handTotal(hand.cards);
      const pBust   = isBust(hand.cards);
      let net = 0, msg = '';

      if (pBust) {
        // Doubled: extra bet already subtracted in doubleDown()
        // Only the doubled portion was extra; original bet was deducted on deal
        net = -thisBet;
        msg = '💥 Bust';
      } else if (dBust || pTotal > dTotal) {
        // Win pays 1:1 — return original bet + equal profit
        addBalance(thisBet * 2);
        net = thisBet;
        msg = '✅ Win';
      } else if (pTotal === dTotal) {
        // Push — return bet
        addBalance(thisBet);
        net = 0;
        msg = '🤝 Push';
      } else {
        // Dealer wins
        net = -thisBet;
        msg = '❌ Dealer Wins';
      }
      netTotal += net;
      return { msg, net };
    });

    syncBalance();
    setResults(handResults);
    setTotalNet(netTotal);
    setPhase('result');
  }

  const balance_  = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const inPlay    = phase === 'playing';
  const activeHand = hands[activeIdx];
  const dTotal    = handTotal(dealer);

  const canDouble = inPlay && activeHand && activeHand.cards.length === 2 && !splitAces && balance_ >= activeHand.bet;
  const canSplit  = inPlay && hands.length === 1 && activeHand && activeHand.cards.length === 2
    && cardValue(activeHand.cards[0].rank) === cardValue(activeHand.cards[1].rank)
    && balance_ >= activeHand.bet;

  return (
    <div className="bj-table">
      <div className="bj-title">♠ Blackjack</div>
      <div className="bj-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Dealer hand */}
      <Hand
        cards={dealer}
        hideSecond={phase === 'playing'}
        label="Dealer"
        total={phase !== 'playing' ? dTotal : undefined}
      />

      {/* Player hands */}
      {hands.length > 0 && phase !== 'betting' && (
        hands.length === 1 ? (
          <Hand
            cards={hands[0].cards}
            label={hands[0].doubled ? 'You (Doubled)' : 'You'}
            total={handTotal(hands[0].cards)}
            soft={isSoft(hands[0].cards)}
          />
        ) : (
          <div className="bj-split-hands">
            {hands.map((hand, i) => (
              <Hand
                key={i}
                cards={hand.cards}
                label={`Hand ${i + 1}${hand.doubled ? ' (Doubled)' : ''}`}
                total={handTotal(hand.cards)}
                soft={isSoft(hand.cards)}
                active={inPlay ? i === activeIdx : undefined}
                handResult={results[i]}
              />
            ))}
          </div>
        )
      )}

      {/* Overall result */}
      {phase === 'result' && totalNet !== null && (
        <div className={`bj-result ${totalNet > 0 ? 'win' : totalNet < 0 ? 'lose' : 'push'}`}>
          <div className="bj-result-msg">
            {hands.length > 1 ? 'Total Result' : results[0]?.msg}
          </div>
          <div className="bj-result-net">
            {totalNet > 0 ? `+$${totalNet}` : totalNet < 0 ? `-$${Math.abs(totalNet)}` : 'No change'}
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
                  <button key={v} className={`bj-qb ${bet===v?'active':''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`bj-qb ${bet===balance_?'active':''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>
              <button className="bj-btn bj-btn--deal" onClick={deal}>
                {phase === 'result' ? '🃏 Deal Again' : '🃏 Deal'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Playing controls */}
      {inPlay && !splitAces && (
        <div className="bj-controls">
          <button className="bj-btn bj-btn--hit"   onClick={hit}>Hit</button>
          <button className="bj-btn bj-btn--stand" onClick={stand}>Stand</button>
          {canDouble && (
            <button className="bj-btn bj-btn--double" onClick={doubleDown}>Double</button>
          )}
          {canSplit && (
            <button className="bj-btn bj-btn--split" onClick={split}>Split</button>
          )}
        </div>
      )}

      <div className="bj-hint">
        Dealer hits soft 17 • Blackjack pays 3:2 • Win pays 1:1 • Double & Split available • {NUM_DECKS}-deck shoe
      </div>
    </div>
  );
}
