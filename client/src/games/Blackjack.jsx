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
    setDoubled(false);
    setResult(null);
    setDealAnim(true);
    setTimeout(() => setDealAnim(false), 400);

    // Check instant blackjack
    if (isBlackjack(pHand)) {
      if (isBlackjack(dHand)) {
        // Push — return original bet
        addBalance(bet);
        syncBalance();
        setResult({ msg: '🤝 Push — Both Blackjack!', net: 0 });
      } else {
        // Blackjack pays 3:1 (return original bet + 3× profit)
        const payout = bet * 4;
        addBalance(payout);
        syncBalance();
        setResult({ msg: '🃏 Blackjack! 3:1 Payout!', net: bet * 3 });
      }
      setPhase('result');
    } else {
      setPhase('playing');
    }
  }

  function hit() {
    const card = getCard();
    const newHand = [...player, card];
    setPlayer(newHand);
    if (isBust(newHand)) {
      runDealer(newHand, true);
    }
  }

  function stand() {
    runDealer(player, false);
  }

  function doubleDown() {
    if (getBalance() < bet) return;
    subtractBalance(bet);
    syncBalance();
    setDoubled(true);
    const card = getCard();
    const newHand = [...player, card];
    setPlayer(newHand);
    runDealer(newHand, false);
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
    const thisBet = doubled ? bet * 2 : bet;
    const pTotal  = handTotal(pHand);
    const dTotal  = handTotal(dHand);
    const dBust   = isBust(dHand);
    let net = 0;
    let msg = '';

    if (pBust) {
      net = -thisBet;
      msg = '💥 Bust!';
    } else if (dBust || pTotal > dTotal) {
      addBalance(thisBet * 3); // return bet + 2× profit
      syncBalance();
      net = thisBet * 2;
      msg = '✅ You Win!';
    } else if (pTotal === dTotal) {
      addBalance(thisBet); // push — return bet
      syncBalance();
      net = 0;
      msg = '🤝 Push';
    } else {
      net = -thisBet;
      msg = '❌ Dealer Wins';
    }

    syncBalance();
    setResult({ msg, net });
    setPhase('result');
  }

  const pTotal   = handTotal(player);
  const dTotal   = handTotal(dealer);
  const pSoft    = isSoft(player);
  const balance_ = getBalance();
  const quickBets = [5, 10, 25, 50, 100, 250].filter(v => v <= balance_);
  const canDouble = phase === 'playing' && player.length === 2 && balance_ >= bet;
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
        <Hand cards={player} label="You" total={pTotal} soft={pSoft} />
      )}

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
        </div>
      )}

      <div className="bj-hint">Dealer hits soft 17 • Blackjack pays 3:1 • {NUM_DECKS}-deck shoe</div>
    </div>
  );
}
