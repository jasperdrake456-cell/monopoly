import React, { useState, useCallback, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';
import './CasinoWar.css';

const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS  = ['♠','♥','♦','♣'];
const SUIT_COLOR = { '♠': '#e2e8f0', '♥': '#ef4444', '♦': '#ef4444', '♣': '#e2e8f0' };

function buildDeck() {
  const d = [];
  SUITS.forEach(s => RANKS.forEach((r, i) => d.push({ rank: r, suit: s, value: i + 2 })));
  return d;
}
function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

let _deck = shuffle(buildDeck());
function dealCard() {
  if (_deck.length < 10) _deck = shuffle(buildDeck());
  return _deck.pop();
}

// ── Card component ──
function PlayingCard({ card, faceDown = false, className = '' }) {
  if (!card) return <div className={`war-card war-card--empty ${className}`} />;
  if (faceDown) return <div className={`war-card war-card--back ${className}`}>🂠</div>;
  return (
    <div className={`war-card ${className}`} style={{ color: SUIT_COLOR[card.suit] }}>
      <span className="war-card-rank">{card.rank}</span>
      <span className="war-card-suit">{card.suit}</span>
    </div>
  );
}

const PHASE = { IDLE: 'idle', DEALING: 'dealing', RESULT: 'result', WAR: 'war', WAR_RESULT: 'war_result' };

export default function CasinoWar() {
  useBanCheck('casino-war');
  useGameActivity('casino-war');
  const boost = useGameBoost('casino-war');

  const [balance, setBalance]     = useState(getBalance);
  const [bet, setBet]             = useState('');
  const [phase, setPhase]         = useState(PHASE.IDLE);
  const [playerCard, setPlayerCard] = useState(null);
  const [dealerCard, setDealerCard] = useState(null);
  const [warCards, setWarCards]   = useState(null); // { player: [], dealer: [] }
  const [message, setMessage]     = useState('');
  const [msgType, setMsgType]     = useState('');  // win | lose | tie | war
  const [history, setHistory]     = useState([]);

  useEffect(() => {
    initJokerBonuses();
    const sync = () => setBalance(getBalance());
    window.addEventListener('focus', sync);
    window.addEventListener('balanceUpdate', sync);
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('balanceUpdate', sync); };
  }, []);

  const amt = Math.floor(Number(bet)) || 0;

  const dealNow = useCallback(() => {
    if (amt < 100 || amt > getBalance() || phase !== PHASE.IDLE) return;

    subtractBalance(amt);
    setBalance(getBalance());
    setWarCards(null);
    setPhase(PHASE.DEALING);

    setTimeout(() => {
      const pc = isRiggedMode() ? { rank: '2', suit: '♠', value: 2 } : dealCard();
      const dc = dealCard();
      setPlayerCard(pc);
      setDealerCard(dc);

      if (pc.value > dc.value) {
        const payout = Math.floor(amt * 2 * (boost || 1));
        addBalance(payout);
        applyJokerBonus(amt, payout, true);
        setBalance(getBalance());
        setMessage(`🎉 You win! ${pc.rank}${pc.suit} beats ${dc.rank}${dc.suit} — +$${(payout - amt).toLocaleString()}`);
        setMsgType('win');
        setHistory(h => [{ result: 'win', pc, dc }, ...h].slice(0, 12));
        setPhase(PHASE.RESULT);
      } else if (dc.value > pc.value) {
        applyJokerBonus(amt, 0, false);
        setMessage(`😔 Dealer wins. ${dc.rank}${dc.suit} beats ${pc.rank}${pc.suit}`);
        setMsgType('lose');
        setHistory(h => [{ result: 'lose', pc, dc }, ...h].slice(0, 12));
        setPhase(PHASE.RESULT);
      } else {
        // TIE
        setMessage(`⚔️ TIE! ${pc.rank}${pc.suit} = ${dc.rank}${dc.suit} — Go to War or Surrender?`);
        setMsgType('tie');
        setPhase(PHASE.WAR);
      }
    }, 600);
  }, [amt, phase, boost]);

  const handleSurrender = useCallback(() => {
    // Lose half bet
    const surrender = Math.floor(amt / 2);
    addBalance(surrender);
    applyJokerBonus(amt, 0, false);
    setBalance(getBalance());
    setMessage(`🏳️ Surrendered — got back $${surrender.toLocaleString()}`);
    setMsgType('lose');
    setHistory(h => [{ result: 'surrender', pc: playerCard, dc: dealerCard }, ...h].slice(0, 12));
    setPhase(PHASE.RESULT);
  }, [amt, playerCard, dealerCard]);

  const handleGoToWar = useCallback(() => {
    if (amt > getBalance()) return; // can't afford ante
    // War costs another full bet (ante)
    subtractBalance(amt);
    setBalance(getBalance());

    // Burn 3 cards, then deal war cards
    dealCard(); dealCard(); dealCard();
    const warPlayer = dealCard();
    dealCard(); dealCard(); dealCard();
    const warDealer = dealCard();
    setWarCards({ player: warPlayer, dealer: warDealer });

    setTimeout(() => {
      if (warPlayer.value >= warDealer.value) {
        // Win: original bet + ante back + original bet as profit (3× original returned, net +1× original)
        const payout = Math.floor(amt * 3 * (boost || 1));
        addBalance(payout);
        applyJokerBonus(amt * 2, payout, true);
        if (payout >= amt * 5) reportBigWin && reportBigWin(payout);
        setBalance(getBalance());
        setMessage(`⚔️ You win the war! ${warPlayer.rank}${warPlayer.suit} vs ${warDealer.rank}${warDealer.suit} — +$${(payout - amt * 2).toLocaleString()}`);
        setMsgType('win');
        setHistory(h => [{ result: 'war-win', pc: warPlayer, dc: warDealer }, ...h].slice(0, 12));
      } else {
        applyJokerBonus(amt * 2, 0, false);
        setMessage(`⚔️ Dealer wins the war! ${warDealer.rank}${warDealer.suit} beats ${warPlayer.rank}${warPlayer.suit}`);
        setMsgType('lose');
        setHistory(h => [{ result: 'war-lose', pc: warPlayer, dc: warDealer }, ...h].slice(0, 12));
      }
      setPhase(PHASE.WAR_RESULT);
    }, 500);
  }, [amt, boost]);

  const reset = () => {
    setPhase(PHASE.IDLE);
    setPlayerCard(null);
    setDealerCard(null);
    setWarCards(null);
    setMessage('');
    setMsgType('');
  };

  const canDeal = amt >= 100 && amt <= balance && phase === PHASE.IDLE;

  return (
    <div className="war-page">
      <div className="war-wrap">
        <h2 className="war-title">⚔️ Casino War</h2>
        <p className="war-sub">Higher card wins — tie? Go to War for double the stakes!</p>

        <div className="war-balance">Balance: <strong>${balance.toLocaleString()}</strong></div>

        {/* Table */}
        <div className="war-table">
          <div className="war-side">
            <div className="war-side-label">Dealer</div>
            <PlayingCard card={dealerCard} faceDown={phase === PHASE.DEALING} className={warCards ? 'war-card--faded' : ''} />
            {warCards && <PlayingCard card={warCards.dealer} className="war-card--war" />}
          </div>

          <div className="war-vs">VS</div>

          <div className="war-side">
            <div className="war-side-label">You</div>
            <PlayingCard card={playerCard} faceDown={phase === PHASE.DEALING} className={warCards ? 'war-card--faded' : ''} />
            {warCards && <PlayingCard card={warCards.player} className="war-card--war" />}
          </div>
        </div>

        {/* Message banner */}
        {message && (
          <div className={`war-msg war-msg--${msgType}`}>{message}</div>
        )}

        {/* War choice buttons */}
        {phase === PHASE.WAR && (
          <div className="war-choice">
            <button
              className={`war-btn war-btn--war ${amt > balance ? 'war-btn--disabled' : ''}`}
              onClick={handleGoToWar}
              disabled={amt > balance}
            >
              ⚔️ Go to War (+${amt.toLocaleString()})
            </button>
            <button className="war-btn war-btn--surrender" onClick={handleSurrender}>
              🏳️ Surrender (get ${Math.floor(amt / 2).toLocaleString()} back)
            </button>
          </div>
        )}

        {/* Bet input */}
        {(phase === PHASE.IDLE || phase === PHASE.RESULT || phase === PHASE.WAR_RESULT) && (
          <>
            <div className="war-bet-row">
              <span className="war-bet-prefix">$</span>
              <input
                className="war-bet-input"
                type="number"
                min="100"
                value={bet}
                onChange={e => setBet(e.target.value)}
                placeholder="Enter wager"
                disabled={phase !== PHASE.IDLE}
              />
            </div>
            <div className="war-quick-btns">
              {[[0.1,'10%'],[0.25,'25%'],[0.5,'50%'],[1,'MAX']].map(([f,l]) => (
                <button
                  key={f}
                  className="war-quick-btn"
                  onClick={() => phase === PHASE.IDLE && setBet(String(Math.max(100, Math.floor(getBalance() * f))))}
                  disabled={phase !== PHASE.IDLE}
                >{l}</button>
              ))}
            </div>
          </>
        )}

        {/* Main action button */}
        {(phase === PHASE.IDLE || phase === PHASE.RESULT || phase === PHASE.WAR_RESULT) && (
          <button
            className={`war-deal-btn ${!canDeal && phase === PHASE.IDLE ? 'war-deal-btn--disabled' : ''}`}
            onClick={phase === PHASE.IDLE ? dealNow : reset}
            disabled={phase === PHASE.IDLE && !canDeal}
          >
            {phase === PHASE.IDLE ? '🃏 Deal' : '🔄 New Hand'}
          </button>
        )}

        {amt > balance && phase === PHASE.IDLE && <div className="war-err">Insufficient balance</div>}
        {amt > 0 && amt < 100 && phase === PHASE.IDLE && <div className="war-err">Minimum bet is $100</div>}

        {boost > 1 && <div className="war-boost">🔥 Boost: {boost.toFixed(2)}×</div>}

        {/* Rules */}
        <div className="war-rules">
          <div className="war-rules-title">How to play</div>
          <div className="war-rules-row"><span>Win</span><span>Your card beats dealer → 2× bet</span></div>
          <div className="war-rules-row"><span>Lose</span><span>Dealer card beats yours → lose bet</span></div>
          <div className="war-rules-row"><span>Tie</span><span>Go to War (put up equal ante) or Surrender (get ½ back)</span></div>
          <div className="war-rules-row"><span>War Win</span><span>Your war card ≥ dealer → 3× total (net +1× original bet)</span></div>
          <div className="war-rules-row"><span>War Lose</span><span>Dealer war card wins → lose both bets</span></div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="war-history">
            {history.map((h, i) => (
              <span key={i} className={`war-hist ${h.result.includes('win') ? 'war-hist--win' : h.result === 'surrender' ? 'war-hist--tie' : 'war-hist--lose'}`}>
                {h.result === 'war-win' ? '⚔️W' : h.result === 'war-lose' ? '⚔️L' : h.result === 'surrender' ? '🏳' : h.result === 'win' ? 'W' : 'L'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
