import React from 'react';
import './Connect4Game.css';

const ROWS = 6, COLS = 7;

export default function Connect4Game({ roomState, myId, emit, onBack }) {
  const { roomCode, players, board, currentTurn, winner, draw, hostId, status } = roomState;
  const isHost   = players?.[0]?.id === myId;
  const myColor  = isHost ? 'R' : 'Y';
  const isMyTurn = currentTurn === myColor;

  const me    = players?.find(p => p.id === myId);
  const opp   = players?.find(p => p.id !== myId);

  function getWinnerName() {
    if (!winner) return null;
    if (winner === 'R') return players?.[0]?.name;
    if (winner === 'Y') return players?.[1]?.name;
    return null;
  }

  const winnerName = getWinnerName();
  const iWon = (winner === 'R' && isHost) || (winner === 'Y' && !isHost);

  return (
    <div className="c4-page">
      <div className="c4-topbar">
        <button className="c4-back" onClick={onBack}>← Home</button>
        <div className="c4-title">Connect 4</div>
        <div className="c4-players">
          <span className="c4-player" style={{ color: '#e74c3c' }}>
            🔴 {players?.[0]?.name}{players?.[0]?.id === myId ? ' (you)' : ''}
          </span>
          <span className="c4-vs">vs</span>
          <span className="c4-player" style={{ color: '#f1c40f' }}>
            🟡 {players?.[1]?.name || '…'}{players?.[1]?.id === myId ? ' (you)' : ''}
          </span>
        </div>
      </div>

      {status === 'ended' && (
        <div className={`c4-result ${iWon ? 'c4-result--win' : draw ? 'c4-result--draw' : 'c4-result--lose'}`}>
          {draw ? "It's a Draw!" : iWon ? '🎉 You Win!' : `${winnerName} Wins!`}
          {isHost && (
            <button className="c4-replay-btn" onClick={() => emit('restartGame', { roomCode })}>
              Play Again
            </button>
          )}
        </div>
      )}

      {status === 'playing' && (
        <div className="c4-turn-indicator">
          {isMyTurn
            ? <span style={{ color: myColor === 'R' ? '#e74c3c' : '#f1c40f' }}>Your turn ▼</span>
            : <span>{opp?.name}'s turn…</span>}
        </div>
      )}

      <div className="c4-board">
        {/* Drop buttons */}
        <div className="c4-drop-row">
          {Array.from({ length: COLS }, (_, c) => (
            <button key={c} className="c4-drop-btn"
              disabled={!isMyTurn || status !== 'playing'}
              onClick={() => emit('makeMove', { roomCode, col: c })}>
              ▼
            </button>
          ))}
        </div>
        {/* Grid */}
        <div className="c4-grid">
          {board.map((row, r) => row.map((cell, c) => (
            <div key={`${r}-${c}`} className="c4-cell">
              <div className={`c4-disc ${cell === 'R' ? 'c4-disc--red' : cell === 'Y' ? 'c4-disc--yellow' : ''}`} />
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}
