import React, { useState, useEffect } from 'react';
import { getBalance, addBalance, subtractBalance, msUntilNextDaily, reportBigWin, isRiggedMode } from '../utils/casinoBalance';
import { initJokerBonuses, applyJokerBonus } from '../utils/jokerBonus';
import './DragonTiger.css';
import useBanCheck from '../hooks/useBanCheck';
import useGameActivity from '../hooks/useGameActivity';
import { useGameBoost } from '../hooks/useGameBoost';

// ── Dragon Tiger ─────────────────────────────────────────────────────────────
// One card each for Dragon and Tiger. Bet Dragon, Tiger, or Tie.
// Tie pays 9:1. Dragon/Tiger pays 1:1 but LOSES on tie (no push — house keeps).
// This gives ~25% house edge on Tie, and ~3.7% on Dragon/Tiger.

const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VAL = { 2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14 };
const RED_SUITS = new Set(['♥','♦']);

function createShoe(numDecks = 8) {
  const cards = [];
  for (let d = 0; d < numDecks; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ suit, rank, v: RANK_VAL[rank] });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function CardDisplay({ card, faceDown }) {
  if (faceDown || !card) {
    return (
      <div className="dt-card dt-card--back">
        <div className="dt-card-back-pattern" />
      </div>
    );
  }
  const red = RED_SUITS.has(card.suit);
  return (
    <div className={`dt-card ${red ? 'dt-card--red' : 'dt-card--black'}`}>
      <div className="dt-corner dt-tl"><div>{card.rank}</div><div>{card.suit}</div></div>
      <div className="dt-center">{card.suit}</div>
      <div className="dt-corner dt-br"><div>{card.suit}</div><div>{card.rank}</div></div>
    </div>
  );
}

const QUICK_BETS = [5, 10, 25, 50, 100, 250];
const BETS = [
  { id: 'dragon', label: '🐉 Dragon', color: '#ef4444', payout: 2, desc: '1:1' },
  { id: 'tie',    label: '⚖️ Tie',    color: '#FFD700', payout: 10, desc: '9:1' },
  { id: 'tiger',  label: '🐯 Tiger',  color: '#3b82f6', payout: 2, desc: '1:1' },
];

export default function DragonTiger() {
  const { banned, reason, expiresAt, loading } = useBanCheck('dragon-tiger');
  useGameActivity('dragon-tiger');
  const boost = useGameBoost('dragon-tiger');
  const shoeRef = React.useRef(createShoe());

  const [balance, setBalance] = useState(getBalance);
  const [bet, setBet]         = useState(10);
  const [betSide, setBetSide] = useState(null);   // 'dragon' | 'tie' | 'tiger'
  const [phase, setPhase]     = useState('betting'); // betting | revealing | result
  const [dragonCard, setDragonCard] = useState(null);
  const [tigerCard, setTigerCard]   = useState(null);
  const [showDragon, setShowDragon] = useState(false);
  const [showTiger, setShowTiger]   = useState(false);
  const [result, setResult]   = useState(null);
  const [history, setHistory] = useState([]);
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

  function getCard() {
    if (shoeRef.current.length < 20) shoeRef.current = createShoe();
    return shoeRef.current.pop();
  }

  function deal() {
    if (!betSide || bet < 1 || bet > getBalance()) return;
    subtractBalance(bet);
    syncBalance();

    const d = getCard();
    const t = getCard();
    setDragonCard(d);
    setTigerCard(t);
    setShowDragon(false);
    setShowTiger(false);
    setResult(null);
    setPhase('revealing');

    // Reveal Dragon first, then Tiger
    setTimeout(() => {
      setShowDragon(true);
      setTimeout(() => {
        setShowTiger(true);

        // Evaluate
        let winner;
        if (d.v > t.v)      winner = 'dragon';
        else if (t.v > d.v) winner = 'tiger';
        else                 winner = 'tie';
        // Rigged: force the opponent side to win
        if (isRiggedMode()) {
          if (betSide === 'dragon') winner = 'tiger';
          else if (betSide === 'tiger') winner = 'dragon';
          else winner = 'dragon'; // bet on tie → dragon wins, tie loses
        }

        let net = -bet;
        let payout = 0;
        let msg = '';

        if (winner === 'tie' && betSide === 'tie') {
          payout = Math.floor(bet * 10 * boost); // 9:1 pays total 10× stake
          addBalance(payout);
          applyJokerBonus(bet, payout, true);
          net = payout - bet;
          msg = `⚖️ Tie! Won $${net.toLocaleString()} (9:1)`;
          reportBigWin('dragon-tiger', bet, payout, 9, `Tie · Dragon ${d.rank}${d.suit} = Tiger ${t.rank}${t.suit}`);
        } else if (winner === betSide && betSide !== 'tie') {
          payout = Math.floor(bet * 2 * boost); // 1:1
          addBalance(payout);
          applyJokerBonus(bet, payout, true);
          net = payout - bet;
          msg = `✅ ${winner === 'dragon' ? '🐉 Dragon' : '🐯 Tiger'} wins! +$${net.toLocaleString()}`;
        } else if (winner === 'tie' && betSide !== 'tie') {
          // Tie kills Dragon/Tiger bets (no push)
          applyJokerBonus(bet, 0, false);
          net = -bet;
          msg = `⚖️ Tie — house wins your ${betSide} bet`;
        } else {
          applyJokerBonus(bet, 0, false);
          net = -bet;
          msg = `❌ ${winner === 'dragon' ? '🐉 Dragon' : '🐯 Tiger'} wins — you lose`;
        }

        syncBalance();
        setResult({ winner, net, msg, dragonCard: d, tigerCard: t });
        setHistory(prev => [{ winner, betSide, net }, ...prev].slice(0, 10));
        setPhase('result');
      }, 800);
    }, 600);
  }

  function reset() {
    setPhase('betting');
    setDragonCard(null);
    setTigerCard(null);
    setShowDragon(false);
    setShowTiger(false);
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
    <div className="dt-table">
      <div className="dt-title">🐉 Dragon Tiger 🐯</div>
      <div className="dt-balance">💰 Balance: <strong>${balance_.toLocaleString()}</strong></div>

      {/* History row */}
      <div className="dt-history">
        {history.map((h, i) => (
          <span
            key={i}
            className={`dt-hist-pill dt-hist-pill--${h.winner}`}
            title={`Bet: ${h.betSide} · ${h.net > 0 ? '+' : ''}$${h.net}`}
          >
            {h.winner === 'dragon' ? '🐉' : h.winner === 'tiger' ? '🐯' : '⚖️'}
          </span>
        ))}
      </div>

      {/* Arena */}
      <div className="dt-arena">
        <div className="dt-side dt-side--dragon">
          <div className="dt-side-label">🐉 Dragon</div>
          <CardDisplay card={dragonCard} faceDown={!showDragon} />
          {result && <div className="dt-side-val">{dragonCard?.rank}{dragonCard?.suit} = {dragonCard?.v}</div>}
        </div>

        <div className="dt-vs">VS</div>

        <div className="dt-side dt-side--tiger">
          <div className="dt-side-label">🐯 Tiger</div>
          <CardDisplay card={tigerCard} faceDown={!showTiger} />
          {result && <div className="dt-side-val">{tigerCard?.rank}{tigerCard?.suit} = {tigerCard?.v}</div>}
        </div>
      </div>

      {/* Result */}
      {result && phase === 'result' && (
        <div className={`dt-result ${result.net > 0 ? 'win' : 'lose'}`}>
          {result.msg}
        </div>
      )}

      {/* Controls */}
      {balance_ < 1 ? (
        <div className="dt-broke">
          <div className="dt-broke-title">You're broke! 😬</div>
          <div className="dt-broke-sub">Hourly $1,000 arrives in</div>
          <div className="dt-broke-countdown">{countdown}</div>
        </div>
      ) : (
        <div className="dt-controls">
          {/* Bet side buttons */}
          <div className="dt-bet-sides">
            {BETS.map(b => (
              <button
                key={b.id}
                className={`dt-side-btn ${betSide === b.id ? 'active' : ''}`}
                style={{ '--dt-color': b.color }}
                onClick={() => setBetSide(b.id)}
                disabled={phase === 'revealing'}
              >
                <span className="dt-side-btn-label">{b.label}</span>
                <span className="dt-side-btn-pays">Pays {b.desc}</span>
              </button>
            ))}
          </div>

          {(phase === 'betting' || phase === 'result') && (
            <>
              <div className="dt-bet-row">
                <span>Bet:</span>
                <input
                  className="dt-bet-input"
                  type="number" min={1} max={balance_}
                  value={bet}
                  onChange={e => setBet(Math.max(1, Math.min(balance_, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="dt-quick-bets">
                {quickBets.map(v => (
                  <button key={v} className={`dt-qb ${bet === v ? 'active' : ''}`} onClick={() => setBet(v)}>${v}</button>
                ))}
                <button className={`dt-qb ${bet === balance_ ? 'active' : ''}`} onClick={() => setBet(balance_)}>All In</button>
              </div>

              {betSide && (
                <div className="dt-selection">
                  Betting <strong>${bet.toLocaleString()}</strong> on <strong>{BETS.find(b => b.id === betSide)?.label}</strong>
                  {' · '}Get back: <strong className="dt-win-preview">${(bet * BETS.find(b => b.id === betSide)?.payout).toLocaleString()}</strong>
                </div>
              )}

              <button
                className="dt-deal-btn"
                onClick={phase === 'result' ? () => { reset(); } : deal}
                disabled={!betSide || phase === 'revealing'}
              >
                {phase === 'result' ? '🔄 Deal Again' : '🃏 Deal'}
              </button>
            </>
          )}
          {phase === 'revealing' && (
            <div className="dt-dealing-msg">🃏 Dealing…</div>
          )}
        </div>
      )}

      <div className="dt-hint">Dragon vs Tiger · Highest card wins · A=1 K=13 · Tie kills Dragon/Tiger bets</div>
    </div>
  );
}
