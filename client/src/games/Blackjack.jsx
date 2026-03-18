import React, { useState, useRef, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin } from '../utils/casinoBalance';
import './Blackjack.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';

// ── Deck ─────────────────────────────────────────────────────────────────────
const SUITS    = ['♠', '♥', '♦', '♣'];
const RANKS    = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
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

function isBust(hand)      { return handTotal(hand) > 21; }
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

function Hand({ cards, hideSecond, label, total, soft, active, handResult, betAmt, doubled }) {
  const activeClass = active === true ? 'bj-hand--active' : active === false ? 'bj-hand--inactive' : '';
  return (
    <div className={`bj-hand ${activeClass}`}>
      {label && <div className="bj-hand-label">{label}</div>}
      {betAmt != null && (
        <div className="bj-hand-bet">
          💰 ${doubled ? betAmt * 2 : betAmt} {doubled ? <span className="bj-hand-bet-tag">DOUBLED</span> : ''}
        </div>
      )}
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
  const { banned, reason, expiresAt, loading } = useBanCheck('blackjack');
  useGameActivity('blackjack');
  const shoeRef = useRef(createShoe());

  const [balance, setBalance]       = useState(getBalance);
  const [bet, setBet]               = useState(10);
  // phase: 'betting' | 'insurance' | 'playing' | 'dealer' | 'result'
  const [phase, setPhase]           = useState('betting');
  const [dealer, setDealer]         = useState([]);
  // hands: [{ cards, bet, doubled, surrendered }]
  const [hands, setHands]           = useState([]);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [splitAces, setSplitAces]   = useState(false);
  const [results, setResults]       = useState([]);
  const [totalNet, setTotalNet]     = useState(null);
  // insurance
  const [insuranceBet, setInsuranceBet] = useState(0);
  const [insLost, setInsLost]       = useState(false); // flag for "insurance lost" toast
  const [countdown, setCountdown]   = useState('');

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

  // ── Deal ──────────────────────────────────────────────────────────────────
  function deal() {
    if (bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();

    const c1 = getCard(), c2 = getCard(), d1 = getCard(), d2 = getCard();
    const pHand = [c1, c2];
    const dHand = [d1, d2];

    setHands([{ cards: pHand, bet, doubled: false, surrendered: false }]);
    setDealer(dHand);
    setActiveIdx(0);
    setSplitAces(false);
    setResults([]);
    setTotalNet(null);
    setInsuranceBet(0);
    setInsLost(false);

    if (d1.rank === 'A') {
      // Dealer shows Ace — offer insurance before peeking
      setPhase('insurance');
    } else if (isBlackjack(pHand)) {
      if (isBlackjack(dHand)) {
        addBalance(bet);
        syncBalance();
        setResults([{ msg: '🤝 Push — Both Blackjack!', net: 0 }]);
        setTotalNet(0);
      } else {
        const profit = Math.floor(bet * 1.2);
        addBalance(bet + profit);
        syncBalance();
        setResults([{ msg: '🃏 Blackjack! 6:5 Payout!', net: profit }]);
        setTotalNet(profit);
      }
      setPhase('result');
    } else {
      setPhase('playing');
    }
  }

  // ── Insurance decision ────────────────────────────────────────────────────
  function handleInsurance(insAmount) {
    const pHand = hands[0].cards;
    const dHand = dealer;

    if (insAmount > 0) {
      subtractBalance(insAmount);
      syncBalance();
    }

    const dealerBJ = isBlackjack(dHand);
    const playerBJ = isBlackjack(pHand);

    if (dealerBJ) {
      // Insurance pays 2:1
      const insNet = insAmount > 0 ? insAmount * 2 : 0;
      if (insAmount > 0) { addBalance(insAmount * 3); syncBalance(); } // return stake + profit

      if (playerBJ) {
        // Both BJ → push on main hand, insurance profit only
        addBalance(bet); syncBalance();
        setResults([{ msg: `🤝 Push — Both Blackjack!${insAmount > 0 ? ` Insurance +$${insNet}` : ''}`, net: insNet }]);
        setTotalNet(insNet);
      } else {
        // Dealer BJ wins — player loses main bet
        setResults([{ msg: insAmount > 0 ? `❌ Dealer Blackjack — Insurance +$${insNet}` : '❌ Dealer Blackjack', net: insNet - bet }]);
        setTotalNet(insNet - bet);
        syncBalance();
      }
      setPhase('result');
    } else {
      // No dealer BJ — insurance lost, continue playing
      if (insAmount > 0) setInsLost(true);

      if (playerBJ) {
        const profit = Math.floor(bet * 1.2);
        addBalance(bet + profit); syncBalance();
        setResults([{ msg: `🃏 Blackjack! 6:5 Payout!`, net: profit - insAmount }]);
        setTotalNet(profit - insAmount);
        setPhase('result');
      } else {
        setPhase('playing');
      }
    }
  }

  // ── Player actions ────────────────────────────────────────────────────────
  function hit() {
    setInsLost(false);
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
    setInsLost(false);
    advanceHand(hands, activeIdx, dealer);
  }

  function doubleDown() {
    const h = hands[activeIdx];
    if (getBalance() < h.bet) return;
    subtractBalance(h.bet);
    syncBalance();
    setInsLost(false);
    const card = getCard();
    const newHands = hands.map((hand, i) =>
      i === activeIdx ? { ...hand, cards: [...hand.cards, card], doubled: true } : hand
    );
    setHands(newHands);
    advanceHand(newHands, activeIdx, dealer);
  }

  function surrender() {
    const h = hands[activeIdx];
    if (h.cards.length !== 2 || splitAces) return;
    const newHands = hands.map((hand, i) =>
      i === activeIdx ? { ...hand, surrendered: true } : hand
    );
    setHands(newHands);
    setInsLost(false);
    advanceHand(newHands, activeIdx, dealer);
  }

  function split() {
    const h = hands[activeIdx];
    if (h.cards.length !== 2) return;
    if (cardValue(h.cards[0].rank) !== cardValue(h.cards[1].rank)) return;
    if (hands.length >= 4) return; // max 4 hands via re-split
    if (getBalance() < h.bet) return;

    subtractBalance(h.bet);
    syncBalance();
    setInsLost(false);

    const isAces = h.cards[0].rank === 'A';
    const newHand1 = { cards: [h.cards[0], getCard()], bet: h.bet, doubled: false, surrendered: false };
    const newHand2 = { cards: [h.cards[1], getCard()], bet: h.bet, doubled: false, surrendered: false };

    // Replace activeIdx hand with two new hands
    const newHands = [...hands];
    newHands.splice(activeIdx, 1, newHand1, newHand2);
    setHands(newHands);

    if (isAces) {
      // Split aces: one card each, no further actions
      setSplitAces(true);
      runDealerWith(newHands, dealer);
    } else {
      setActiveIdx(activeIdx); // stay on same index (first of the two new hands)
    }
  }

  function advanceHand(currentHands, idx, dHand) {
    if (idx + 1 < currentHands.length) {
      setActiveIdx(idx + 1);
    } else {
      runDealerWith(currentHands, dHand);
    }
  }

  // ── Dealer plays ──────────────────────────────────────────────────────────
  function runDealerWith(currentHands, initialDealerHand) {
    // If all player hands busted/surrendered, no need for dealer to draw
    const allDone = currentHands.every(h => isBust(h.cards) || h.surrendered);
    if (allDone) { resolveAll(currentHands, initialDealerHand); return; }

    setPhase('dealer');
    let dHand = [...initialDealerHand];

    const draw = () => {
      const total = handTotal(dHand);
      const soft  = isSoft(dHand);
      // Dealer must hit on 16 or below, and on soft 17
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

  // ── Resolve all hands ─────────────────────────────────────────────────────
  function resolveAll(currentHands, dHand) {
    const dTotal = handTotal(dHand);
    const dBust  = isBust(dHand);
    let netTotal = 0;

    const handResults = currentHands.map(hand => {
      const thisBet = hand.doubled ? hand.bet * 2 : hand.bet;

      // Surrender: return half bet regardless of dealer
      if (hand.surrendered) {
        const halfBack = Math.floor(hand.bet / 2);
        addBalance(halfBack);
        const net = -(hand.bet - halfBack);
        netTotal += net;
        return { msg: '🏳️ Surrendered', net };
      }

      const pTotal = handTotal(hand.cards);
      const pBust  = isBust(hand.cards);
      let net = 0, msg = '';

      if (pBust) {
        net = -thisBet;
        msg = '💥 Bust';
      } else if (dBust || pTotal > dTotal) {
        addBalance(thisBet * 2); // return bet + equal profit (1:1)
        net = thisBet;
        msg = dBust ? '✅ Dealer Bust' : '✅ Win';
      } else if (pTotal === dTotal) {
        addBalance(thisBet); // return bet
        net = 0;
        msg = '🤝 Push';
      } else {
        net = -thisBet;
        msg = '❌ Dealer Wins';
      }
      netTotal += net;
      return { msg, net };
    });

    syncBalance();
    if (netTotal > 0) {
      const totalPayout = netTotal + currentHands.reduce((s, h) => s + (h.doubled ? h.bet * 2 : h.bet), 0);
      reportBigWin('blackjack', bet, totalPayout, null, `${currentHands.length} hand(s) · dealer ${dTotal} · net +$${netTotal}`);
    }
    setResults(handResults);
    setTotalNet(netTotal);
    setPhase('result');
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const balance_   = getBalance();
  const quickBets  = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const inPlay     = phase === 'playing';
  const activeHand = hands[activeIdx];
  const dTotal     = handTotal(dealer);
  const maxIns     = Math.floor(bet / 2);

  const canDouble   = inPlay && activeHand && activeHand.cards.length === 2 && !splitAces && balance_ >= activeHand.bet;
  const canSplit    = inPlay && hands.length < 4 && !splitAces && activeHand && activeHand.cards.length === 2
    && cardValue(activeHand.cards[0].rank) === cardValue(activeHand.cards[1].rank)
    && balance_ >= activeHand.bet;
  const canSurrender = inPlay && activeHand && activeHand.cards.length === 2 && !splitAces;

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
    <div className="bj-table">
      <div className="bj-title">♠ Blackjack</div>
      <div className="bj-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* Insurance lost toast */}
      {insLost && (
        <div className="bj-ins-toast">Insurance lost — no dealer Blackjack</div>
      )}

      {/* Dealer hand */}
      <Hand
        cards={dealer}
        hideSecond={phase === 'playing' || phase === 'insurance'}
        label="Dealer"
        total={phase !== 'playing' && phase !== 'insurance' ? dTotal : undefined}
      />

      {/* Player hands */}
      {hands.length > 0 && phase !== 'betting' && (
        hands.length === 1 ? (
          <Hand
            cards={hands[0].cards}
            label={hands[0].surrendered ? 'You (Surrendered)' : 'You'}
            total={handTotal(hands[0].cards)}
            soft={isSoft(hands[0].cards)}
            betAmt={hands[0].bet}
            doubled={hands[0].doubled}
          />
        ) : (
          <div className="bj-split-hands">
            {hands.map((hand, i) => (
              <Hand
                key={i}
                cards={hand.cards}
                label={`Hand ${i + 1}${hand.surrendered ? ' (Surrendered)' : ''}`}
                total={handTotal(hand.cards)}
                soft={isSoft(hand.cards)}
                active={inPlay ? i === activeIdx : undefined}
                handResult={results[i]}
                betAmt={hand.bet}
                doubled={hand.doubled}
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
            {totalNet > 0 ? `+$${totalNet}` : totalNet < 0 ? `-$${Math.abs(totalNet)}` : 'Push — no change'}
          </div>
        </div>
      )}

      {/* Insurance UI */}
      {phase === 'insurance' && (
        <div className="bj-insurance">
          <div className="bj-ins-title">🃏 Dealer shows an Ace</div>
          <div className="bj-ins-sub">Insurance pays 2:1 if dealer has Blackjack</div>
          <div className="bj-ins-bet-row">
            <span>Insurance bet (max ${maxIns}):</span>
            <input
              className="bj-ins-input"
              type="number"
              min={0}
              max={maxIns}
              value={insuranceBet}
              onChange={e => setInsuranceBet(Math.max(0, Math.min(maxIns, parseInt(e.target.value) || 0)))}
            />
          </div>
          <div className="bj-ins-btns">
            <button
              className="bj-btn bj-btn--ins-take"
              onClick={() => handleInsurance(insuranceBet)}
              disabled={insuranceBet < 1 || balance_ < insuranceBet}
            >
              Take Insurance ${insuranceBet}
            </button>
            <button className="bj-btn bj-btn--ins-skip" onClick={() => handleInsurance(0)}>
              No Insurance
            </button>
          </div>
        </div>
      )}

      {/* Betting UI */}
      {(phase === 'betting' || phase === 'result') && (
        <div className="bj-betting">
          {balance_ < 1 ? (
            <div className="bj-broke">
              <div className="bj-broke-title">You're broke! 😬</div>
              <div className="bj-broke-sub">Your hourly $1,000 arrives in</div>
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
          {canSurrender && (
            <button className="bj-btn bj-btn--surrender" onClick={surrender}>Surrender</button>
          )}
        </div>
      )}

      <div className="bj-hint">
        Dealer hits soft 17 • BJ pays 6:5 • Double on any 2 cards • Split up to 4 hands • Insurance • Surrender
      </div>
    </div>
  );
}
