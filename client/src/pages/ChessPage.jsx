import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import MultiplayerLobby from '../components/MultiplayerLobby';
import ChessGame from '../games/chess/ChessGame';

export default function ChessPage() {
  const navigate = useNavigate();
  const { emit, on, connected } = useSocket('/chess');
  const [roomState, setRoomState] = useState(null);
  const [myId, setMyId]           = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');

  useEffect(() => {
    const offCreated = on('roomCreated', ({ roomCode, playerId }) => setMyId(playerId));
    const offJoined  = on('roomJoined',  ({ playerId }) => setMyId(playerId));
    const offState   = on('gameState',   (state) => setRoomState(state));
    const offError   = on('error', ({ message }) => {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    });
    return () => { offCreated(); offJoined(); offState(); offError(); };
  }, [on]);

  const handleEmit = useCallback((event, data) => {
    setErrorMsg('');
    emit(event, data);
  }, [emit]);

  const handleLeave = useCallback(() => {
    if (roomState?.roomCode) {
      emit('leaveRoom', { roomCode: roomState.roomCode });
    }
    setRoomState(null);
    setMyId(null);
    navigate('/');
  }, [emit, navigate, roomState]);

  const inGame = roomState?.status === 'playing' || roomState?.status === 'ended';

  return (
    <div>
      {!connected && <div className="conn-banner">Connecting…</div>}
      {errorMsg  && <div className="error-toast">{errorMsg}</div>}
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
        <ChessGame roomState={roomState} myId={myId} emit={handleEmit} onBack={() => navigate('/')} />
      ) : (
        <MultiplayerLobby gameName="Chess" roomState={roomState} myId={myId}
          emit={handleEmit} onBack={() => navigate('/')} />
      )}
    </div>
  );
}
