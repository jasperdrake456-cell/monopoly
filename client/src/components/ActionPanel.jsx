import React, { useState } from 'react';
import Dice from './Dice';
import { BOARD, TOKENS, TOKEN_COLORS } from '../boardData';
import './ActionPanel.css';

export default function ActionPanel({ gameState, myId, roomCode, emit }) {
  const { players, currentPlayerIndex, turnPhase, lastDice, activeTrade } = gameState;
  const currentPlayer = players[currentPlayerIndex];
  const myPlayer = players.find(p => p.id === myId);
  const isMyTurn = currentPlayer?.id === myId;
  const [rolling, setRolling] = useState(false);

  if (!myPlayer || myPlayer.bankrupt) return (
    <div className="action-panel">
      <div className="ap-status">You are bankrupt.</div>
    </div>
  );

  function handleRoll() {
    setRolling(true);
    emit('rollDice', { roomCode });
    setTimeout(() => setRolling(false), 800);
  }

  const currentSpaceName = BOARD[myPlayer.position]?.name || '';

  // ── Trade response ────────────────────────────────────────────────────────
  if (activeTrade && activeTrade.toId === myId) {
    const from = players.find(p => p.id === activeTrade.fromId);
    return (
      <div className="action-panel">
        <div className="ap-header">🤝 Trade Offer from {from?.name}</div>
        <TradeOfferDisplay trade={activeTrade} players={players} />
        <div className="ap-row">
          <button className="ap-btn primary" onClick={() => emit('respondTrade', { roomCode, accepted: true })}>
            Accept
          </button>
          <button className="ap-btn danger" onClick={() => emit('respondTrade', { roomCode, accepted: false })}>
            Reject
          </button>
        </div>
      </div>
    );
  }

  if (activeTrade && activeTrade.fromId === myId) {
    const to = players.find(p => p.id === activeTrade.toId);
    return (
      <div className="action-panel">
        <div className="ap-header">🤝 Waiting for {to?.name} to respond...</div>
        <button className="ap-btn secondary" onClick={() => emit('cancelTrade', { roomCode })}>
          Cancel Trade
        </button>
      </div>
    );
  }

  // ── Not my turn ───────────────────────────────────────────────────────────
  if (!isMyTurn) {
    return (
      <div className="action-panel">
        <div className="ap-turn-indicator">
          <span className="ap-token" style={{ color: TOKEN_COLORS[currentPlayer?.token] }}>
            {TOKENS[currentPlayer?.token]}
          </span>
          <span>{currentPlayer?.name}'s turn</span>
        </div>
        {lastDice && (
          <Dice dice={lastDice} rolling={false} />
        )}
        <div className="ap-status">Waiting...</div>
      </div>
    );
  }

  // ── My turn ───────────────────────────────────────────────────────────────
  return (
    <div className="action-panel">
      <div className="ap-header">Your Turn</div>
      <div className="ap-position">
        📍 {currentSpaceName}
        {myPlayer.jailTurns > 0 && <span className="jail-indicator"> 🔒 In Jail (turn {myPlayer.jailTurns}/3)</span>}
      </div>

      {lastDice && <Dice dice={lastDice} rolling={rolling} />}

      {/* Roll phase */}
      {turnPhase === 'roll' && (
        <div className="ap-actions">
          {myPlayer.jailTurns > 0 && (
            <>
              <button className="ap-btn secondary" onClick={() => emit('payJailFine', { roomCode })} disabled={myPlayer.cash < 50}>
                Pay $50 Fine
              </button>
              {myPlayer.getOutOfJailCards > 0 && (
                <button className="ap-btn secondary" onClick={() => emit('useJailCard', { roomCode })}>
                  Use Jail Card 🃏
                </button>
              )}
            </>
          )}
          <button className="ap-btn primary large" onClick={handleRoll}>
            🎲 Roll Dice
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
          <button className="ap-btn primary" onClick={() => emit('endTurn', { roomCode })}>
            End Turn ➡️
          </button>
          <button className="ap-btn danger" onClick={() => emit('declareBankruptcy', { roomCode })}>
            Declare Bankruptcy
          </button>
        </div>
      )}
    </div>
  );
}

function BuyDecision({ gameState, myId, roomCode, emit }) {
  const player = gameState.players.find(p => p.id === myId);
  const space = BOARD[player.position];

  return (
    <div className="buy-decision">
      <div className="buy-space-name">{space.name}</div>
      <div className="buy-price">Price: <strong>${space.price}</strong></div>
      <div className="buy-cash">You have: <strong>${player.cash}</strong></div>
      <div className="ap-row">
        <button
          className="ap-btn primary"
          onClick={() => emit('buyProperty', { roomCode })}
          disabled={player.cash < space.price}
        >
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
  const to = players.find(p => p.id === trade.toId);

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
