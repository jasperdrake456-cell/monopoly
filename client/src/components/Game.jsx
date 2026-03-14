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
  const [showLog, setShowLog] = useState(false);

  if (!gameState) return <div className="game-loading">Loading game…</div>;

  const myPlayer = gameState.players.find(p => p.id === myId);
  const winner = gameState.winner;
  const winnerPlayer = winner ? gameState.players.find(p => p.id === winner) : null;

  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === myId;
  const isHost = roomState.hostId === myId;
  const canTrade = myPlayer && !myPlayer.bankrupt &&
    !gameState.activeTrade &&
    gameState.players.filter(p => !p.bankrupt && p.id !== myId).length > 0;

  return (
    <div className="game-layout">
      {/* Win screen */}
      {winner && (
        <div className="win-overlay">
          <div className="win-card">
            <div className="win-trophy">🏆</div>
            <h1>{winnerPlayer?.name} Wins!</h1>
            <div className="win-stats">
              {gameState.players.map(p => (
                <div key={p.id} className="win-stat-row" style={{ borderLeftColor: TOKEN_COLORS[p.token] }}>
                  <span>{TOKENS[p.token]} {p.name}</span>
                  <span style={{ color: '#FFD700' }}>${p.cash.toLocaleString()}</span>
                  <span style={{ opacity: 0.6 }}>{p.properties.length} props</span>
                  {p.bankrupt && <span>💀</span>}
                </div>
              ))}
            </div>
            {isHost && (
              <button className="win-restart-btn" onClick={() => emit('restartGame', { roomCode })}>
                🔄 Play Again
              </button>
            )}
            {!isHost && <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>Waiting for host to restart…</p>}
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

      {/* Log overlay */}
      {showLog && (
        <div className="log-overlay" onClick={() => setShowLog(false)}>
          <div className="log-overlay-panel" onClick={e => e.stopPropagation()}>
            <div className="log-overlay-header">
              <span>📜 Game Log</span>
              <button className="log-close-btn" onClick={() => setShowLog(false)}>✕</button>
            </div>
            <EventLog log={gameState.log} hideHeader />
          </div>
        </div>
      )}

      {/* Left sidebar — Action Panel + Dashboard */}
      <aside className="game-sidebar left">
        <ActionPanel
          gameState={gameState}
          myId={myId}
          roomCode={roomCode}
          emit={emit}
        />
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
          <button className="log-btn" onClick={() => setShowLog(true)}>📜 Log</button>
          <span className={`turn-badge ${isMyTurn ? 'my-turn' : ''}`}>
            {isMyTurn ? '⚡ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
          </span>
        </div>
        <Board gameState={gameState} myId={myId} />
      </main>
    </div>
  );
}
