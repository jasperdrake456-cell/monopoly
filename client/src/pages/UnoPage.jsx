import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import UnoGame from '../games/UnoGame';

const SESSION_KEY = 'uno_session';

// ── Lobby ─────────────────────────────────────────────────────────────────────

function UnoLobby({ roomState, myId, emit, onBack, savedSession, onClearSession }) {
  const [nameInput, setNameInput]   = useState('');
  const [codeInput, setCodeInput]   = useState('');
  const [view, setView]             = useState('home'); // 'home' | 'create' | 'join'

  const isInRoom = !!roomState;
  const isHost   = roomState?.hostId === myId;
  const canStart = isHost && (roomState?.players?.length || 0) >= 2;

  function handleCreate(e) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    emit('createRoom', { playerName: nameInput.trim() });
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!nameInput.trim() || !codeInput.trim()) return;
    emit('joinRoom', { roomCode: codeInput.trim().toUpperCase(), playerName: nameInput.trim() });
  }

  if (isInRoom) {
    return (
      <div className="uno-lobby">
        <div className="uno-lobby-card">
          <div className="uno-lobby-logo">🃏 UNO</div>
          <div className="uno-lobby-room-code">
            Room Code: <span className="uno-lobby-code">{roomState.roomCode}</span>
          </div>
          <p className="uno-lobby-hint">Share this code with friends to join!</p>

          <div className="uno-lobby-players-title">Players ({roomState.players?.length || 0}/8)</div>
          <ul className="uno-lobby-player-list">
            {(roomState.players || []).map(p => (
              <li key={p.id} className="uno-lobby-player-item">
                {p.id === roomState.hostId && <span className="uno-lobby-host-badge">HOST</span>}
                <span>{p.name}</span>
                {p.id === myId && <span className="uno-lobby-you-badge">you</span>}
              </li>
            ))}
          </ul>

          {isHost ? (
            <button
              className={`uno-lobby-btn uno-lobby-btn--start ${canStart ? '' : 'uno-lobby-btn--disabled'}`}
              onClick={() => emit('startGame', { roomCode: roomState.roomCode })}
              disabled={!canStart}
            >
              {canStart ? 'Start Game' : 'Waiting for players… (need 2+)'}
            </button>
          ) : (
            <div className="uno-lobby-waiting">Waiting for host to start the game…</div>
          )}

          <button className="uno-lobby-back" onClick={onBack}>← Leave</button>
        </div>
      </div>
    );
  }

  return (
    <div className="uno-lobby">
      <div className="uno-lobby-card">
        <div className="uno-lobby-logo">🃏 UNO</div>
        <p className="uno-lobby-tagline">Be the first to empty your hand — call UNO or get caught!</p>

        {savedSession && (
          <div className="uno-lobby-saved">
            <span>Previous session detected</span>
            <button className="uno-lobby-saved-clear" onClick={onClearSession}>Clear</button>
          </div>
        )}

        {view === 'home' && (
          <div className="uno-lobby-actions">
            <button className="uno-lobby-btn uno-lobby-btn--create" onClick={() => setView('create')}>
              Create Room
            </button>
            <button className="uno-lobby-btn uno-lobby-btn--join" onClick={() => setView('join')}>
              Join Room
            </button>
            <button className="uno-lobby-back" onClick={onBack}>← Back to Game Vault</button>
          </div>
        )}

        {view === 'create' && (
          <form className="uno-lobby-form" onSubmit={handleCreate}>
            <label className="uno-lobby-label">Your Name</label>
            <input
              className="uno-lobby-input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
            />
            <button type="submit" className="uno-lobby-btn uno-lobby-btn--create">
              Create Room
            </button>
            <button type="button" className="uno-lobby-back" onClick={() => setView('home')}>← Back</button>
          </form>
        )}

        {view === 'join' && (
          <form className="uno-lobby-form" onSubmit={handleJoin}>
            <label className="uno-lobby-label">Your Name</label>
            <input
              className="uno-lobby-input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
            />
            <label className="uno-lobby-label" style={{ marginTop: '0.75rem' }}>Room Code</label>
            <input
              className="uno-lobby-input uno-lobby-input--code"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. ABCD12"
              maxLength={6}
            />
            <button type="submit" className="uno-lobby-btn uno-lobby-btn--join">
              Join Room
            </button>
            <button type="button" className="uno-lobby-back" onClick={() => setView('home')}>← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnoPage() {
  const navigate  = useNavigate();
  const { emit, on, connected } = useSocket('/uno');

  const [roomState,    setRoomState]    = useState(null);
  const [myId,         setMyId]         = useState(null);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [savedSession, setSavedSession] = useState(
    () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  );

  const myIdRef = useRef(myId);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

  useEffect(() => {
    const offRoomCreated = on('roomCreated', ({ roomCode, playerId }) => {
      setMyId(playerId);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode }));
    });

    const offRoomJoined = on('roomJoined', ({ playerId }) => {
      setMyId(playerId);
    });

    const offGameState = on('gameState', (state) => {
      setRoomState(state);
    });

    const offError = on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    const offChat = on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg].slice(-100));
    });

    const offDrew = on('drew', (data) => {
      // Forward to UnoGame via custom window event
      window.dispatchEvent(new CustomEvent('uno:drew', { detail: data }));
    });

    const offGameOver = on('gameOver', ({ winnerName }) => {
      // Informational — state update comes via gameState broadcast
    });

    return () => {
      offRoomCreated();
      offRoomJoined();
      offGameState();
      offError();
      offChat();
      offDrew();
      offGameOver();
    };
  }, [on]);

  const handleEmit = useCallback((event, data) => {
    setErrorMsg('');
    emit(event, data);
  }, [emit]);

  const handleLeave = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setRoomState(null);
    setMyId(null);
    setSavedSession(null);
    navigate('/');
  }, [navigate]);

  const inGame = roomState?.status === 'playing' || roomState?.status === 'ended';

  return (
    <div style={{ minHeight: '100vh' }}>
      {!connected && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#7f1d1d', color: '#fca5a5', textAlign: 'center',
          padding: '8px', fontSize: '0.85rem', fontWeight: 600,
        }}>
          Connecting to server…
        </div>
      )}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: connected ? 0 : 36, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: '#7f1d1d', color: '#fca5a5',
          padding: '10px 24px', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {errorMsg}
        </div>
      )}

      {roomState !== null && (
        <button
          onClick={handleLeave}
          style={{
            position: 'fixed', top: 14, right: 16, zIndex: 1000,
            background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b',
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
            fontWeight: 600, fontSize: '0.82rem',
          }}
        >
          🚪 Leave
        </button>
      )}

      {inGame ? (
        <UnoGame
          roomState={roomState}
          myId={myId}
          emit={handleEmit}
          chatMessages={chatMessages}
        />
      ) : (
        <UnoLobby
          roomState={roomState}
          myId={myId}
          emit={handleEmit}
          onBack={handleLeave}
          savedSession={savedSession}
          onClearSession={() => { localStorage.removeItem(SESSION_KEY); setSavedSession(null); }}
        />
      )}
    </div>
  );
}
