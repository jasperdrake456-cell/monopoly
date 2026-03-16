import React, { useState } from 'react';
import { BOARD, GROUP_COLORS, TOKENS, TOKEN_COLORS } from '../boardData';
import './ActionPanel.css';

const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function ActionPanel({ gameState, myId, roomCode, emit, board: boardProp }) {
  const { players, currentPlayerIndex, turnPhase, lastDice, activeTrade, doublesCount } = gameState;
  const currentPlayer = players[currentPlayerIndex];
  const myPlayer = players.find(p => p.id === myId);
  const isMyTurn = currentPlayer?.id === myId;
  const ACTIVE_BOARD = boardProp || BOARD;
  const [rolling, setRolling] = useState(false);
  const [acting, setActing] = useState(false);

  if (!myPlayer || myPlayer.bankrupt) return (
    <div className="action-panel">
      <div className="ap-inner">
        <div className="ap-status">💀 You are bankrupt. Watching the game…</div>
      </div>
    </div>
  );

  function act(event, data) {
    if (acting) return;
    setActing(true);
    emit(event, data);
    setTimeout(() => setActing(false), 600);
  }

  function handleRoll() {
    if (rolling) return;
    setRolling(true);
    emit('rollDice', { roomCode });
    setTimeout(() => setRolling(false), 700);
  }

  const currentSpace = ACTIVE_BOARD[myPlayer.position];
  const spaceColor = currentSpace?.group ? GROUP_COLORS[currentSpace.group] : null;
  const isDoubles = lastDice && lastDice[0] === lastDice[1];
  const diceTotal = lastDice ? lastDice[0] + lastDice[1] : 0;

  // ── Trade response ──────────────────────────────────────────────────────
  if (activeTrade && activeTrade.toId === myId) {
    const from = players.find(p => p.id === activeTrade.fromId);
    return (
      <div className="action-panel">
        <div className="ap-inner">
          <div className="ap-header">🤝 Trade from {from?.name}</div>
          <TradeOfferDisplay trade={activeTrade} players={players} />
          <div className="ap-row">
            <button className="ap-btn primary" onClick={() => act('respondTrade', { roomCode, accepted: true })} disabled={acting}>
              ✓ Accept
            </button>
            <button className="ap-btn danger" onClick={() => act('respondTrade', { roomCode, accepted: false })} disabled={acting}>
              ✗ Reject
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeTrade && activeTrade.fromId === myId) {
    const to = players.find(p => p.id === activeTrade.toId);
    return (
      <div className="action-panel">
        <div className="ap-inner">
          <div className="ap-header">🤝 Waiting for {to?.name}…</div>
          <button className="ap-btn secondary" onClick={() => act('cancelTrade', { roomCode })} disabled={acting}>
            Cancel Trade
          </button>
        </div>
      </div>
    );
  }

  // ── Not my turn ─────────────────────────────────────────────────────────
  if (!isMyTurn) {
    const curSpace = ACTIVE_BOARD[currentPlayer?.position];
    const curSpaceColor = curSpace?.group ? GROUP_COLORS[curSpace.group] : null;
    return (
      <div className="action-panel">
        <div className="ap-inner">
          <div className="ap-turn-indicator">
            <span className="ap-token" style={{ color: TOKEN_COLORS[currentPlayer?.token] }}>
              {TOKENS[currentPlayer?.token]}
            </span>
            <span>{currentPlayer?.name}'s turn</span>
          </div>
          {/* Opponent info */}
          <div className="ap-opponent-info">
            <div className="ap-opp-row">
              <span className="ap-opp-label">Cash</span>
              <span className="ap-opp-val" style={{ color: '#FFD700' }}>${currentPlayer?.cash?.toLocaleString() ?? '—'}</span>
            </div>
            <div className="ap-opp-row">
              <span className="ap-opp-label">Properties</span>
              <span className="ap-opp-val">{currentPlayer?.properties?.length ?? 0}</span>
            </div>
            <div className="ap-opp-row">
              <span className="ap-opp-label">On</span>
              <span className="ap-opp-val" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {curSpaceColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: curSpaceColor, display: 'inline-block', flexShrink: 0 }} />}
                {curSpace?.name ?? '—'}
              </span>
            </div>
            {currentPlayer?.jailTurns > 0 && (
              <div className="ap-opp-row"><span className="ap-opp-val" style={{ color: '#e74c3c' }}>🔒 In Jail (turn {currentPlayer.jailTurns}/3)</span></div>
            )}
            {currentPlayer?.missedRentCount > 0 && (
              <div className="ap-opp-row"><span className="ap-opp-val" style={{ color: '#e74c3c' }}>⚠️ Missed rent: {currentPlayer.missedRentCount}/3</span></div>
            )}
          </div>
          {lastDice && (
            <>
              <div className="dice-row">
                <div className="die">{DICE_FACE[lastDice[0]]}</div>
                <div className="die">{DICE_FACE[lastDice[1]]}</div>
              </div>
              <div className="dice-label">Total: {diceTotal}{isDoubles ? ' · Doubles!' : ''}</div>
            </>
          )}
          <div className="ap-status">Waiting…</div>
        </div>
      </div>
    );
  }

  // ── My turn ─────────────────────────────────────────────────────────────
  const isRollingAgain = turnPhase === 'roll' && lastDice && doublesCount > 0;

  return (
    <div className="action-panel">
      <div className="ap-inner">
        <div className="ap-header">⚡ Your Turn</div>

        {/* Doubles re-roll banner */}
        {isRollingAgain && (
          <div className="ap-doubles-banner">
            🎯 Doubles! Roll again
            {doublesCount >= 2 && <span className="ap-doubles-warn"> — 3rd doubles = Jail!</span>}
          </div>
        )}

        <div className="ap-position">
          {spaceColor && <span className="ap-pos-dot" style={{ background: spaceColor }} />}
          📍 {currentSpace?.name}
          {myPlayer.jailTurns > 0 && (
            <span className="jail-indicator"> 🔒 Jail (turn {myPlayer.jailTurns}/3)</span>
          )}
        </div>

        {lastDice && (
          <>
            <div className="dice-row">
              <div className={`die ${rolling ? 'rolling' : ''}`}>{DICE_FACE[lastDice[0]]}</div>
              <div className={`die ${rolling ? 'rolling' : ''}`}>{DICE_FACE[lastDice[1]]}</div>
            </div>
            <div className="dice-label">
              Total: {diceTotal}
              {isDoubles && !isRollingAgain && <span style={{ color: '#FFD700', marginLeft: 6 }}>Doubles!</span>}
            </div>
          </>
        )}

        {/* Roll phase */}
        {turnPhase === 'roll' && (
          <div className="ap-actions">
            {myPlayer.jailTurns > 0 && (
              <>
                <button className="ap-btn secondary" disabled={myPlayer.cash < 50 || acting}
                  onClick={() => act('payJailFine', { roomCode })}>
                  💸 Pay $50 Fine
                </button>
                {myPlayer.getOutOfJailCards > 0 && (
                  <button className="ap-btn secondary" disabled={acting}
                    onClick={() => act('useJailCard', { roomCode })}>
                    🃏 Use Jail Card
                  </button>
                )}
              </>
            )}
            <button className="ap-btn primary large" onClick={handleRoll} disabled={rolling || acting}>
              🎲 {rolling ? 'Rolling…' : isRollingAgain ? 'Roll Again' : 'Roll Dice'}
            </button>
          </div>
        )}

        {/* Buy decision */}
        {turnPhase === 'buy_decision' && (
          <BuyDecision gameState={gameState} myId={myId} roomCode={roomCode} emit={act} acting={acting} />
        )}

        {/* Card action — handled by CardReveal overlay in Game.jsx */}
        {turnPhase === 'card_action' && (
          <div className="ap-status" style={{ fontStyle: 'italic', opacity: 0.7 }}>
            {gameState.activeCard?.deck === 'chance' ? '❓ Chance card drawn…' : '🎁 Community Chest card drawn…'}
          </div>
        )}

        {/* End turn */}
        {turnPhase === 'end' && (
          <div className="ap-actions">
            <button className="ap-btn primary large" disabled={acting}
              onClick={() => act('endTurn', { roomCode })}>
              {doublesCount > 0 ? 'Continue → Roll Again 🎲' : 'End Turn ➡️'}
            </button>
            <button className="ap-btn danger-subtle" disabled={acting}
              onClick={() => { if (window.confirm('Declare bankruptcy? This permanently ends your game.')) act('declareBankruptcy', { roomCode }); }}>
              Declare Bankruptcy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BuyDecision({ gameState, myId, roomCode, emit: act, acting }) {
  const player = gameState.players.find(p => p.id === myId);
  const space = ACTIVE_BOARD[player.position];
  const color = space.group ? GROUP_COLORS[space.group] : null;
  const canAfford = player.cash >= space.price;

  // Show rent info
  const rentRows = [];
  if (space.type === 'property' && space.rent) {
    rentRows.push(`No monopoly: $${space.rent[0]}`);
    rentRows.push(`Monopoly: $${space.rent[0] * 2}`);
    if (space.rent[2]) rentRows.push(`1🏠 $${space.rent[2]}  2🏠 $${space.rent[3]}  3🏠 $${space.rent[4]}`);
    if (space.rent[5]) rentRows.push(`Hotel 🏨: $${space.rent[5]}`);
  } else if (space.type === 'railroad') {
    rentRows.push('1 RR: $25 · 2: $50 · 3: $100 · 4: $200');
  } else if (space.type === 'utility') {
    rentRows.push('1 utility: 4× dice · 2 utilities: 10× dice');
  }

  return (
    <div className="buy-decision">
      {color && <div className="buy-color-bar" style={{ background: color }} />}
      <div className="buy-space-name">{space.name}</div>
      <div className="buy-price">Price: <strong>${space.price}</strong></div>
      <div className="buy-cash">
        Cash: <strong style={{ color: canAfford ? '#4caf50' : '#e74c3c' }}>${player.cash.toLocaleString()}</strong>
      </div>
      {rentRows.length > 0 && (
        <div className="buy-rent-table">
          {rentRows.map((r, i) => <div key={i}>{r}</div>)}
        </div>
      )}
      <div className="ap-row">
        <button className="ap-btn primary" disabled={!canAfford || acting}
          onClick={() => act('buyProperty', { roomCode })}>
          Buy ${space.price}
        </button>
        <button className="ap-btn secondary" disabled={acting}
          onClick={() => act('passProperty', { roomCode })}>
          Skip
        </button>
      </div>
    </div>
  );
}

function TradeOfferDisplay({ trade, players }) {
  const from = players.find(p => p.id === trade.fromId);
  const to   = players.find(p => p.id === trade.toId);
  return (
    <div className="trade-display">
      <div className="trade-side">
        <strong>{from?.name} offers:</strong>
        {trade.offer.properties.map(id => <span key={id} className="trade-prop">{ACTIVE_BOARD[id]?.name}</span>)}
        {trade.offer.cash > 0 && <span className="trade-cash">${trade.offer.cash}</span>}
        {trade.offer.properties.length === 0 && trade.offer.cash === 0 && <span style={{ opacity: 0.5 }}>Nothing</span>}
      </div>
      <div className="trade-arrow">⟷</div>
      <div className="trade-side">
        <strong>{to?.name} gives:</strong>
        {trade.request.properties.map(id => <span key={id} className="trade-prop">{ACTIVE_BOARD[id]?.name}</span>)}
        {trade.request.cash > 0 && <span className="trade-cash">${trade.request.cash}</span>}
        {trade.request.properties.length === 0 && trade.request.cash === 0 && <span style={{ opacity: 0.5 }}>Nothing</span>}
      </div>
    </div>
  );
}
