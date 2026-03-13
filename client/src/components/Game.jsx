import React, { useState } from 'react';
import Board from './Board';
import ActionPanel from './ActionPanel';
import Dashboard from './Dashboard';
import EventLog from './EventLog';
import TradeModal from './TradeModal';
import { TOKENS, TOKEN_COLORS } from '../boardData';
import './Game.css';

export default function Game({ roomState, myId, roomCode, emit }) {
  const { gameState, players: lobbyPlayers } = roomState;
  const [showTradeModal, setShowTradeModal] = useState(false);

  if (!gameState) return <div className="game-loading">Loading game…</div>;

  const myPlayer = gameState.players.find(p => p.id === myId);
  const winner = gameState.winner;
  const winnerPlayer = winner ? gameState.players.find(p => p.id === winner) : null;

  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const canTrade = myPlayer && !myPlayer.bankrupt &&
    gameState.turnPhase !== 'auction' && !gameState.activeTrade &&
    gameState.players.filter(p => !p.bankrupt && p.id !== myId).length > 0;

  return (
    <div className="game-layout">
      {/* Win screen */}
      {winner && (
        <div className="win-overlay">
          <div className="win-card">
            <div className="win-trophy">🏆</div>
            <h1>{winnerPlayer?.name} Wins!</h1>
            <p>Congratulations!</p>
          </div>
        </div>
      )}

      {/* Trade modal */}
      {showTradeModal && (
        <TradeModal
          gameState={gameState}
          myId={myId}
          roomCode={roomCode}
          emit={emit}
          onClose={() => setShowTradeModal(false)}
        />
      )}

      {/* Left sidebar — Dashboard */}
      <aside className="game-sidebar left">
        <Dashboard
          gameState={gameState}
          myId={myId}
          roomCode={roomCode}
          emit={emit}
        />
      </aside>

      {/* Center — Board */}
      <main className="game-main">
        <div className="game-topbar">
          <span className="game-room-code">Room: <strong>{roomCode}</strong></span>
          {canTrade && (
            <button className="trade-btn" onClick={() => setShowTradeModal(true)}>
              🤝 Trade
            </button>
          )}
          <span className={`turn-badge ${isMyTurn ? 'my-turn' : ''}`}>
            {isMyTurn ? '⚡ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
          </span>
        </div>
        <Board gameState={gameState} myId={myId} />
      </main>

      {/* Right sidebar — Action Panel + Log */}
      <aside className="game-sidebar right">
        <ActionPanel
          gameState={gameState}
          myId={myId}
          roomCode={roomCode}
          emit={emit}
        />
        <div className="log-wrap">
          <EventLog log={gameState.log} />
        </div>
      </aside>
    </div>
  );
}
