import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import MultiplayerLobby from '../components/MultiplayerLobby';
import CheckersGame from '../games/CheckersGame';

export default function CheckersPage() {
  const navigate = useNavigate();
  const { emit, on, connected } = useSocket('/checkers');
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

  const inGame = roomState?.status === 'playing' || roomState?.status === 'ended';

  return (
    <div>
      {!connected && <div className="conn-banner">Connecting…</div>}
      {errorMsg  && <div className="error-toast">{errorMsg}</div>}
      {inGame ? (
        <CheckersGame roomState={roomState} myId={myId} emit={handleEmit} onBack={() => navigate('/')} />
      ) : (
        <MultiplayerLobby gameName="Checkers" roomState={roomState} myId={myId}
          emit={handleEmit} onBack={() => navigate('/')} />
      )}
    </div>
  );
}
