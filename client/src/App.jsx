import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from './hooks/useSocket';
import Lobby from './components/Lobby';
import Game from './components/Game';
import './App.css';

const SESSION_KEY = 'monopoly_session';

export default function App() {
  const { emit, on, off, connected } = useSocket();
  const [roomState, setRoomState] = useState(null);
  const [myId, setMyId]           = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [toast, setToast]         = useState('');

  // Attempt reconnect from saved session
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved && connected) {
      emit('reconnect', { roomCode: saved.roomCode, sessionId: saved.sessionId });
    }
  }, [connected]);

  // Socket listeners
  useEffect(() => {
    const offRoomCreated = on('roomCreated', ({ roomCode, playerId, sessionId: sid }) => {
      setMyId(playerId);
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, sessionId: sid }));
    });

    const offRoomJoined = on('roomJoined', ({ playerId, sessionId: sid }) => {
      setMyId(playerId);
      setSessionId(sid);
    });

    const offReconnected = on('reconnected', ({ playerId }) => {
      setMyId(playerId);
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (saved) setSessionId(saved.sessionId);
    });

    const offGameState = on('gameState', (state) => {
      setRoomState(state);
      // Update stored roomCode
      if (state.roomCode && sessionId) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: state.roomCode, sessionId }));
      }
    });

    const offError = on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    return () => {
      offRoomCreated();
      offRoomJoined();
      offReconnected();
      offGameState();
      offError();
    };
  }, [on, sessionId]);

  const handleEmit = useCallback((event, data) => {
    setErrorMsg('');
    emit(event, data);
  }, [emit]);

  // Determine view
  const inGame = roomState?.status === 'playing' || roomState?.status === 'ended';

  return (
    <div className="app">
      {/* Connection status */}
      {!connected && (
        <div className="conn-banner">Connecting to server…</div>
      )}

      {/* Error toast */}
      {errorMsg && (
        <div className="error-toast">{errorMsg}</div>
      )}

      {inGame ? (
        <Game
          roomState={roomState}
          myId={myId}
          roomCode={roomState.roomCode}
          emit={handleEmit}
        />
      ) : (
        <Lobby
          roomState={roomState}
          myId={myId}
          emit={handleEmit}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
