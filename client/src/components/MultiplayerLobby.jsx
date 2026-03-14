import React, { useState } from 'react';
import './MultiplayerLobby.css';

export default function MultiplayerLobby({ gameName, roomState, myId, emit, onBack }) {
  const [view, setView]     = useState('home'); // 'home' | 'create' | 'join'
  const [name, setName]     = useState('');
  const [code, setCode]     = useState('');
  const [joinCode, setJoinCode] = useState('');

  const isHost    = roomState?.hostId === myId;
  const inRoom    = !!roomState;
  const canStart  = isHost && roomState?.players?.length >= 2;

  function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    emit('createRoom', { playerName: name.trim() });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!name.trim() || !joinCode.trim()) return;
    emit('joinRoom', { roomCode: joinCode.trim().toUpperCase(), playerName: name.trim() });
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomState.roomCode).catch(() => {});
  }

  // In a room (waiting for 2nd player or ready to start)
  if (inRoom) {
    return (
      <div className="ml-page">
        <div className="ml-card">
          <button className="ml-back-btn" onClick={onBack}>← Home</button>
          <div className="ml-game-title">{gameName}</div>
          <div className="ml-room-code-label">Room Code</div>
          <div className="ml-room-code" onClick={copyCode} title="Click to copy">
            {roomState.roomCode}
            <span className="ml-copy-hint">📋</span>
          </div>
          <div className="ml-players-label">Players</div>
          <div className="ml-players-list">
            {roomState.players.map(p => (
              <div key={p.id} className={`ml-player-row ${p.id === myId ? 'ml-player-row--me' : ''}`}>
                <span className="ml-player-dot">●</span>
                <span className="ml-player-name">{p.name}</span>
                {p.id === roomState.hostId && <span className="ml-host-badge">HOST</span>}
                {p.id === myId && <span className="ml-you-badge">YOU</span>}
              </div>
            ))}
            {roomState.players.length < 2 && (
              <div className="ml-waiting">Waiting for opponent…</div>
            )}
          </div>
          {isHost && (
            <button
              className={`ml-btn ml-btn--primary ${canStart ? '' : 'ml-btn--disabled'}`}
              disabled={!canStart}
              onClick={() => emit('startGame', { roomCode: roomState.roomCode })}>
              Start Game
            </button>
          )}
          {!isHost && <div className="ml-waiting-msg">Waiting for host to start…</div>}
        </div>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="ml-page">
        <div className="ml-card">
          <button className="ml-back-btn" onClick={onBack}>← Home</button>
          <div className="ml-game-title">{gameName}</div>
          <button className="ml-btn ml-btn--primary" onClick={() => setView('create')}>Create Room</button>
          <button className="ml-btn ml-btn--secondary" onClick={() => setView('join')}>Join Room</button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="ml-page">
        <div className="ml-card">
          <button className="ml-back-btn" onClick={() => setView('home')}>← Back</button>
          <div className="ml-game-title">{gameName}</div>
          <form onSubmit={handleCreate} className="ml-form">
            <label className="ml-label">Your Name</label>
            <input className="ml-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Enter your name" maxLength={20} autoFocus />
            <button className="ml-btn ml-btn--primary" type="submit">Create Room</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'join') {
    return (
      <div className="ml-page">
        <div className="ml-card">
          <button className="ml-back-btn" onClick={() => setView('home')}>← Back</button>
          <div className="ml-game-title">{gameName}</div>
          <form onSubmit={handleJoin} className="ml-form">
            <label className="ml-label">Your Name</label>
            <input className="ml-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="Enter your name" maxLength={20} autoFocus />
            <label className="ml-label">Room Code</label>
            <input className="ml-input ml-input--code" value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6-letter code" maxLength={6} />
            <button className="ml-btn ml-btn--primary" type="submit">Join Room</button>
          </form>
        </div>
      </div>
    );
  }

  return null;
}
