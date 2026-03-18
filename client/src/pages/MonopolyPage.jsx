import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import Lobby from '../components/Lobby';
import Game from '../components/Game';

const SESSION_KEY = 'monopoly_session';

export default function MonopolyPage() {
  const navigate = useNavigate();
  const { emit, on, connected } = useSocket('/monopoly');
  const [roomState, setRoomState]     = useState(null);
  const [myId, setMyId]               = useState(null);
  const [sessionId, setSessionId]     = useState(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [savedSession, setSavedSession] = useState(
    () => JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
  );

  // Attempt auto-reconnect from saved session when socket connects
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (saved && connected) {
      emit('reconnect', { roomCode: saved.roomCode, sessionId: saved.sessionId });
    }
  }, [connected]);

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
      if (state.roomCode && sessionId) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: state.roomCode, sessionId }));
      }
    });
    const offError = on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
      // If reconnect failed, clear stale session so the banner goes away
      if (message.toLowerCase().includes('room not found') || message.toLowerCase().includes('session not found')) {
        localStorage.removeItem(SESSION_KEY);
        setSavedSession(null);
      }
    });
    const offChat = on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });
    const offRoomClosed = on('roomClosed', () => {
      localStorage.removeItem(SESSION_KEY);
      setSavedSession(null);
      setRoomState(null);
      setMyId(null);
      setSessionId(null);
    });
    return () => { offRoomCreated(); offRoomJoined(); offReconnected(); offGameState(); offError(); offChat(); offRoomClosed(); };
  }, [on, sessionId]);

  const handleEmit = useCallback((event, data) => {
    setErrorMsg('');
    emit(event, data);
  }, [emit]);

  const handleLeave = useCallback(() => {
    if (roomState?.roomCode) {
      emit('leaveRoom', { roomCode: roomState.roomCode });
    }
    localStorage.removeItem(SESSION_KEY);
    setRoomState(null);
    setMyId(null);
    setSessionId(null);
    setSavedSession(null);
    navigate('/');
  }, [emit, navigate, roomState]);

  const inGame = roomState?.status === 'playing' || roomState?.status === 'ended';

  return (
    <div className="app">
      {!connected && <div className="conn-banner">Connecting to server…</div>}
      {errorMsg && <div className="error-toast">{errorMsg}</div>}
      {roomState !== null && (
        <button
          onClick={handleLeave}
          style={{
            position: 'fixed', top: 16, right: 16, zIndex: 1000,
            background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b',
            borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          🚪 Leave Game
        </button>
      )}
      {inGame ? (
        <Game
          roomState={roomState}
          myId={myId}
          roomCode={roomState.roomCode}
          emit={handleEmit}
          chatMessages={chatMessages}
        />
      ) : (
        <Lobby
          roomState={roomState}
          myId={myId}
          emit={handleEmit}
          sessionId={sessionId}
          savedSession={savedSession}
          onClearSession={() => { localStorage.removeItem(SESSION_KEY); setSavedSession(null); }}
          onBack={() => navigate('/')}
        />
      )}
    </div>
  );
}
