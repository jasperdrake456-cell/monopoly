import React, { useState } from 'react';
import { TOKENS, TOKEN_COLORS } from '../boardData';
import { useAuth } from '../contexts/AuthContext';
import './Lobby.css';

const ALL_TOKENS = Object.keys(TOKENS);

export default function Lobby({ roomState, myId, emit, sessionId, savedSession, onClearSession }) {
  const { token: authToken } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [token, setToken] = useState(ALL_TOKENS[0]);
  const [roomCode, setRoomCode] = useState('');
  const [freeParkingEnabled, setFreeParkingEnabled] = useState(false);
  const [boardType, setBoardType] = useState('classic');
  const [mode, setMode] = useState('home'); // 'home' | 'create' | 'join'
  const [error, setError] = useState('');
  const [rejoining, setRejoining] = useState(false);

  function handleRejoin() {
    if (!savedSession) return;
    setRejoining(true);
    emit('reconnect', { roomCode: savedSession.roomCode, sessionId: savedSession.sessionId });
    // If no response in 4s, give up
    setTimeout(() => setRejoining(false), 4000);
  }

  const takenTokens = roomState?.players?.map(p => p.token) || [];
  const availableToken = ALL_TOKENS.find(t => !takenTokens.includes(t));
  const [selectedToken, setSelectedToken] = useState(availableToken || ALL_TOKENS[0]);

  function handleCreate(e) {
    e.preventDefault();
    if (!playerName.trim()) { setError('Enter your name'); return; }
    emit('createRoom', { playerName: playerName.trim(), token: selectedToken, freeParkingEnabled, boardType, authToken });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!playerName.trim()) { setError('Enter your name'); return; }
    if (!roomCode.trim()) { setError('Enter room code'); return; }
    emit('joinRoom', { roomCode: roomCode.trim().toUpperCase(), playerName: playerName.trim(), token: selectedToken, authToken });
  }

  function handleTokenSelect(t) {
    const taken = roomState?.players?.filter(p => p.id !== myId).map(p => p.token) || [];
    if (taken.includes(t)) return;
    setSelectedToken(t);
    if (roomState) {
      emit('selectToken', { roomCode: roomState.roomCode, token: t });
    }
  }

  function handleStart() {
    emit('startGame', { roomCode: roomState.roomCode });
  }

  const isHost = roomState?.hostId === myId;

  // In a room — show waiting room
  if (roomState) {
    return (
      <div className="lobby-room">
        <div className="lobby-room-header">
          <h1 className="lobby-title">MONOPOLY</h1>
          <div className="room-code-display">
            <span className="room-code-label">Room Code</span>
            <span className="room-code-value">{roomState.roomCode}</span>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(roomState.roomCode)}>Copy</button>
          </div>
        </div>

        <div className="lobby-players">
          <h2>Players ({roomState.players.length}/6)</h2>
          <div className="player-list">
            {roomState.players.map(p => (
              <div key={p.id} className={`player-entry ${!p.connected ? 'disconnected' : ''}`}>
                <span className="player-token-large" style={{ color: TOKEN_COLORS[p.token] }}>
                  {TOKENS[p.token]}
                </span>
                <span className="player-name">{p.name}</span>
                {p.id === roomState.hostId && <span className="host-badge">HOST</span>}
                {!p.connected && <span className="offline-badge">Offline</span>}
                {isHost && p.id !== myId && (
                  <button
                    className="kick-btn"
                    title={`Kick ${p.name}`}
                    onClick={() => { if (window.confirm(`Kick ${p.name} from the room?`)) emit('kickPlayer', { roomCode: roomState.roomCode, targetId: p.id }); }}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-token-picker">
          <h3>Your Token</h3>
          <div className="token-grid">
            {ALL_TOKENS.map(t => {
              const takenByOther = roomState.players.filter(p => p.id !== myId).some(p => p.token === t);
              const mine = roomState.players.find(p => p.id === myId)?.token === t;
              return (
                <button
                  key={t}
                  className={`token-btn ${mine ? 'selected' : ''} ${takenByOther ? 'taken' : ''}`}
                  onClick={() => handleTokenSelect(t)}
                  disabled={takenByOther}
                  title={t}
                  style={{ color: TOKEN_COLORS[t] }}
                >
                  <span className="token-emoji">{TOKENS[t]}</span>
                  <span className="token-name">{t}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lobby-settings">
          <div className="board-type-display">
            {roomState.boardType === 'world' ? '🌍 World Map — Real World Cities' : '🏙️ Classic — Atlantic City'}
          </div>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={roomState.freeParkingEnabled}
              disabled={!isHost}
              onChange={() => {}}
            />
            Free Parking jackpot (house rule)
          </label>
        </div>

        {isHost && (
          <div className="host-actions">
            <button
              className="start-btn"
              onClick={handleStart}
              disabled={roomState.players.length < 2}
            >
              {roomState.players.length < 2 ? 'Waiting for players...' : 'Start Game!'}
            </button>
            <button
              className="close-room-btn"
              onClick={() => {
                if (window.confirm('Close the room and kick all players?')) {
                  emit('closeRoom', { roomCode: roomState.roomCode });
                }
              }}
            >
              ✕ Close Room
            </button>
          </div>
        )}
        {!isHost && (
          <p className="waiting-msg">Waiting for the host to start the game...</p>
        )}
      </div>
    );
  }

  // Home screen
  if (mode === 'home') {
    return (
      <div className="lobby-home">
        <h1 className="lobby-title">MONOPOLY</h1>
        <p className="lobby-subtitle">Real-time multiplayer</p>

        {/* Rejoin banner — shown when there's a saved game session */}
        {savedSession && (
          <div className="rejoin-banner">
            <span className="rejoin-icon">🔄</span>
            <div className="rejoin-info">
              <span className="rejoin-label">Active game found</span>
              <span className="rejoin-code">Room: <strong>{savedSession.roomCode}</strong></span>
            </div>
            <div className="rejoin-actions">
              <button
                className="rejoin-btn"
                onClick={handleRejoin}
                disabled={rejoining}
              >
                {rejoining ? 'Rejoining…' : 'Rejoin Game'}
              </button>
              <button className="rejoin-dismiss" onClick={onClearSession} title="Dismiss">✕</button>
            </div>
          </div>
        )}

        <div className="home-buttons">
          <button className="home-btn create-btn" onClick={() => setMode('create')}>
            Create Room
          </button>
          <button className="home-btn join-btn" onClick={() => setMode('join')}>
            Join Room
          </button>
        </div>
      </div>
    );
  }

  // Create / Join form
  return (
    <div className="lobby-form-wrap">
      <h1 className="lobby-title">MONOPOLY</h1>
      <div className="lobby-form-card">
        <h2>{mode === 'create' ? 'Create a Room' : 'Join a Room'}</h2>

        <form onSubmit={mode === 'create' ? handleCreate : handleJoin}>
          <label>Your Name
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              maxLength={20}
              placeholder="Enter your name"
              required
            />
          </label>

          {mode === 'join' && (
            <label>Room Code
              <input
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="6-character code"
                required
              />
            </label>
          )}

          <div className="token-picker-form">
            <label>Choose Your Token</label>
            <div className="token-grid">
              {ALL_TOKENS.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`token-btn ${selectedToken === t ? 'selected' : ''}`}
                  onClick={() => setSelectedToken(t)}
                  title={t}
                  style={{ color: TOKEN_COLORS[t] }}
                >
                  <span className="token-emoji">{TOKENS[t]}</span>
                  <span className="token-name">{t}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === 'create' && (
            <>
              <div className="board-type-picker">
                <label className="board-type-label">Board Variant</label>
                <div className="board-type-options">
                  <button
                    type="button"
                    className={`board-type-btn ${boardType === 'classic' ? 'selected' : ''}`}
                    onClick={() => setBoardType('classic')}
                  >
                    🏙️ Classic
                    <span className="board-type-sub">Atlantic City</span>
                  </button>
                  <button
                    type="button"
                    className={`board-type-btn ${boardType === 'world' ? 'selected' : ''}`}
                    onClick={() => setBoardType('world')}
                  >
                    🌍 World Map
                    <span className="board-type-sub">Real World Cities</span>
                  </button>
                </div>
              </div>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={freeParkingEnabled}
                  onChange={e => setFreeParkingEnabled(e.target.checked)}
                />
                Free Parking jackpot (house rule)
              </label>
            </>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-actions">
            <button type="button" className="back-btn" onClick={() => setMode('home')}>Back</button>
            <button type="submit" className="submit-btn">
              {mode === 'create' ? 'Create Room' : 'Join Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
