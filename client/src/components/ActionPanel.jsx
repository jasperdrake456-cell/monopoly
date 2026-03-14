import React, { useState } from 'react';
import { BOARD, GROUP_COLORS, TOKENS, TOKEN_COLORS } from '../boardData';
import './ActionPanel.css';

// Dice faces as text
const DICE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function ActionPanel({ gameState, myId, roomCode, emit }) {
  const { players, currentPlayerIndex, turnPhase, lastDice, activeTrade } = gameState;
  const currentPlayer = players[currentPlayerIndex];
  const myPlayer = players.find(p => p.id === myId);
  const isMyTurn = currentPlayer?.id === myId;
  const [rolling, setRolling] = useState(false);

  if (!myPlayer || myPlayer.bankrupt) return (
    <div className="action-panel">
      <div className="ap-inner">
        <div className="ap-status">💀 You are bankrupt.</div>
      </div>
    </div>
  );

  function handleRoll() {
    setRolling(true);
    emit('rollDice', { roomCode });
    setTimeout(() => setRolling(false), 700);
  }

  const currentSpaceName = BOARD[myPlayer.position]?.name || '';
  const currentSpace = BOARD[myPlayer.position];
  const spaceColor = currentSpace?.group ? GROUP_COLORS[currentSpace.group] : null;

  // ── Trade response ──────────────────────────────────────────────────────
  if (activeTrade && activeTrade.toId === myId) {
    const from = players.find(p => p.id === activeTrade.fromId);
    return (
      <div className="action-panel">
        <div className="ap-inner">
          <div className="ap-header">🤝 Trade Offer from {from?.name}</div>
          <TradeOfferDisplay trade={activeTrade} players={players} />
          <div className="ap-row">
            <button className="ap-btn primary" onClick={() => emit('respondTrade', { roomCode, accepted: true })}>
              ✓ Accept
            </button>
            <button className="ap-btn danger" onClick={() => emit('respondTrade', { roomCode, accepted: false })}>
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
          <button className="ap-btn secondary" onClick={() => emit('cancelTrade', { roomCode })}>
            Cancel Trade
          </button>
        </div>
      </div>
    );
  }

  // ── Not my turn ─────────────────────────────────────────────────────────
  if (!isMyTurn) {
    const isDoubles = lastDice && lastDice[0] === lastDice[1];
    return (
      <div className="action-panel">
        <div className="ap-inner">
          <div className="ap-turn-indicator">
            <span className="ap-token" style={{ color: TOKEN_COLORS[currentPlayer?.token] }}>
              {TOKENS[currentPlayer?.token]}
            </span>
            <span>{currentPlayer?.name}'s turn</span>
          </div>
          {lastDice && (
            <>
              <div className="dice-row">
                <div className="die">{DICE_FACE[lastDice[0]]}</div>
                <div className="die">{DICE_FACE[lastDice[1]]}</div>
              </div>
              <div className="dice-label">Total: {lastDice[0] + lastDice[1]}</div>
              {isDoubles && <div className="dice-doubles">🎯 Doubles!</div>}
            </>
          )}
          <div className="ap-status">Waiting…</div>
        </div>
      </div>
    );
  }

  // ── My turn ─────────────────────────────────────────────────────────────
  const isDoubles = lastDice && lastDice[0] === lastDice[1];
  return (
    <div className="action-panel">
      <div className="ap-inner">
        <div className="ap-header">⚡ Your Turn</div>

        <div className="ap-position">
          {spaceColor && <span className="ap-pos-dot" style={{ background: spaceColor }} />}
          📍 {currentSpaceName}
          {myPlayer.jailTurns > 0 && (
            <span className="jail-indicator">🔒 Jail ({myPlayer.jailTurns}/3)</span>
          )}
        </div>

        {lastDice && (
          <>
            <div className="dice-row">
              <div className={`die ${rolling ? 'rolling' : ''}`}>{DICE_FACE[lastDice[0]]}</div>
              <div className={`die ${rolling ? 'rolling' : ''}`}>{DICE_FACE[lastDice[1]]}</div>
            </div>
            <div className="dice-label">Total: {lastDice[0] + lastDice[1]}</div>
            {isDoubles && <div className="dice-doubles">🎯 Doubles — roll again!</div>}
          </>
        )}

        {/* Roll phase */}
        {turnPhase === 'roll' && (
          <div className="ap-actions">
            {myPlayer.jailTurns > 0 && (
              <>
                <button className="ap-btn secondary"
                  onClick={() => emit('payJailFine', { roomCode })}
                  disabled={myPlayer.cash < 50}>
                  💸 Pay $50 Fine
                </button>
                {myPlayer.getOutOfJailCards > 0 && (
                  <button className="ap-btn secondary" onClick={() => emit('useJailCard', { roomCode })}>
                    🃏 Use Jail Card
                  </button>
                )}
              </>
            )}
            <button className="ap-btn primary large" onClick={handleRoll} disabled={rolling}>
              🎲 {rolling ? 'Rolling…' : 'Roll Dice'}
            </button>
          </div>
        )}

        {/* Buy decision */}
        {turnPhase === 'buy_decision' && (
          <BuyDecision gameState={gameState} myId={myId} roomCode={roomCode} emit={emit} />
        )}

        {/* Card action */}
        {turnPhase === 'card_action' && gameState.activeCard && (
          <div className="ap-card">
            <div className={`card-deck-label ${gameState.activeCard.deck}`}>
              {gameState.activeCard.deck === 'chance' ? '❓ Chance' : '🎁 Community Chest'}
            </div>
            <div className="card-text">{gameState.activeCard.cardData?.text}</div>
            <button className="ap-btn primary" onClick={() => emit('resolveCard', { roomCode })}>
              OK
            </button>
          </div>
        )}

        {/* End turn */}
        {turnPhase === 'end' && (
          <div className="ap-actions">
            <button className="ap-btn primary large" onClick={() => emit('endTurn', { roomCode })}>
              End Turn ➡️
            </button>
            <button className="ap-btn danger"
              onClick={() => { if (window.confirm('Declare bankruptcy? This cannot be undone.')) emit('declareBankruptcy', { roomCode }); }}>
              Declare Bankruptcy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BuyDecision({ gameState, myId, roomCode, emit }) {
  const player = gameState.players.find(p => p.id === myId);
  const space = BOARD[player.position];
  const color = space.group ? GROUP_COLORS[space.group] : null;
  const canAfford = player.cash >= space.price;

  return (
    <div className="buy-decision">
      {color && <div className="buy-color-bar" style={{ background: color }} />}
      <div className="buy-space-name">{space.name}</div>
      <div className="buy-price">Price: <strong>${space.price}</strong></div>
      <div className="buy-cash">Your cash: <strong style={{ color: canAfford ? '#FFD700' : '#e74c3c' }}>${player.cash.toLocaleString()}</strong></div>
      {space.rent && (
        <div className="buy-rent-table">
          <div>Rent: <strong>${space.rent[0]}</strong></div>
          {space.rent[1] && <div>With monopoly: <strong>${space.rent[1]}</strong></div>}
          {space.rent[2] && <div>1 house: <strong>${space.rent[2]}</strong> · 2: <strong>${space.rent[3]}</strong></div>}
        </div>
      )}
      <div className="ap-row">
        <button className="ap-btn primary" onClick={() => emit('buyProperty', { roomCode })} disabled={!canAfford}>
          Buy ${space.price}
        </button>
        <button className="ap-btn secondary" onClick={() => emit('passProperty', { roomCode })}>
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
        {trade.offer.properties.map(id => <span key={id} className="trade-prop">{BOARD[id]?.name}</span>)}
        {trade.offer.cash > 0 && <span className="trade-cash">${trade.offer.cash}</span>}
      </div>
      <div className="trade-arrow">⟷</div>
      <div className="trade-side">
        <strong>{to?.name} gives:</strong>
        {trade.request.properties.map(id => <span key={id} className="trade-prop">{BOARD[id]?.name}</span>)}
        {trade.request.cash > 0 && <span className="trade-cash">${trade.request.cash}</span>}
      </div>
    </div>
  );
}
