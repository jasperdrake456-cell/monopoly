'use strict';
const rm = require('../roomManager');
const gl = require('../gameLogic');

function roomChannel(code) { return `room:${code}`; }

function broadcast(ns, roomCode, event, data) {
  ns.to(roomChannel(roomCode)).emit(event, data);
}

function sanitizeState(room) {
  return {
    roomCode: room.code,
    status: room.status,
    hostId: room.hostId,
    freeParkingEnabled: room.freeParkingEnabled,
    players: room.players,
    gameState: room.gameState,
  };
}

function broadcastState(ns, room) {
  broadcast(ns, room.code, 'gameState', sanitizeState(room));
}

function handleAction(ns, socket, roomCode, fn) {
  const room = rm.getRoom(roomCode);
  if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
  const result = fn(room);
  if (result && result.error) { socket.emit('error', { message: result.error }); return; }
  broadcastState(ns, room);
}

function register(ns) {
  ns.on('connection', (socket) => {

    socket.on('createRoom', ({ playerName, token, freeParkingEnabled }) => {
      const { room, player, sessionId } = rm.createRoom(socket.id, playerName, token, freeParkingEnabled);
      socket.join(roomChannel(room.code));
      socket.emit('roomCreated', { roomCode: room.code, playerId: socket.id, sessionId });
      broadcastState(ns, room);
    });

    socket.on('joinRoom', ({ roomCode, playerName, token }) => {
      const result = rm.joinRoom(roomCode, socket.id, playerName, token);
      if (result.error) { socket.emit('error', { message: result.error }); return; }
      socket.join(roomChannel(roomCode));
      socket.emit('roomJoined', { playerId: socket.id, sessionId: result.player.sessionId });
      broadcastState(ns, result.room);
    });

    socket.on('reconnect', ({ roomCode, sessionId }) => {
      const result = rm.reconnect(roomCode, sessionId, socket.id);
      if (result.error) { socket.emit('error', { message: result.error }); return; }
      socket.join(roomChannel(roomCode));
      socket.emit('reconnected', { playerId: socket.id });
      broadcastState(ns, result.room);
    });

    socket.on('selectToken', ({ roomCode, token }) => {
      const result = rm.selectToken(roomCode, socket.id, token);
      if (result.error) { socket.emit('error', { message: result.error }); return; }
      broadcastState(ns, result.room);
    });

    socket.on('closeRoom', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room) return;
      if (room.hostId !== socket.id) return;
      broadcast(ns, roomCode, 'roomClosed', {});
      rm.deleteRoom(roomCode);
    });

    socket.on('startGame', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (room.hostId !== socket.id) return { error: 'Only the host can start the game' };
        if (room.players.length < 2) return { error: 'Need at least 2 players' };
        if (room.status !== 'lobby') return { error: 'Game already started' };
        const gameStatePlayers = room.players.map(p => ({ id: p.id, name: p.name, token: p.token, sessionId: p.sessionId }));
        room.gameState = gl.initGame(gameStatePlayers, room.freeParkingEnabled);
        room.status = 'playing';
      });
    });

    socket.on('rollDice', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game in progress' };
        return gl.doRollDice(room.gameState, socket.id);
      });
    });

    socket.on('buyProperty', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doBuyProperty(room.gameState, socket.id);
      });
    });

    socket.on('passProperty', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doPassProperty(room.gameState, socket.id);
      });
    });

    socket.on('resolveCard', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doResolveCard(room.gameState, socket.id);
      });
    });

    socket.on('endTurn', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doEndTurn(room.gameState, socket.id);
      });
    });

    socket.on('payJailFine', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doPayJailFine(room.gameState, socket.id);
      });
    });

    socket.on('useJailCard', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doUseJailCard(room.gameState, socket.id);
      });
    });

    socket.on('buyBuilding', ({ roomCode, propertyId, count }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doBuyBuilding(room.gameState, socket.id, propertyId, count);
      });
    });

    socket.on('sellBuilding', ({ roomCode, propertyId, count }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doSellBuilding(room.gameState, socket.id, propertyId, count);
      });
    });

    socket.on('mortgage', ({ roomCode, propertyId }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doMortgage(room.gameState, socket.id, propertyId);
      });
    });

    socket.on('unmortgage', ({ roomCode, propertyId }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doUnmortgage(room.gameState, socket.id, propertyId);
      });
    });

    socket.on('proposeTrade', ({ roomCode, toId, offer, request }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doProposeTrade(room.gameState, socket.id, toId, offer, request);
      });
    });

    socket.on('respondTrade', ({ roomCode, accepted }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doRespondTrade(room.gameState, socket.id, accepted);
      });
    });

    socket.on('cancelTrade', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doCancelTrade(room.gameState, socket.id);
      });
    });

    socket.on('restartGame', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only the host can restart' }); return; }
      const playerList = room.players.map(p => ({ id: p.id, name: p.name, token: p.token }));
      room.gameState = gl.initGame(playerList, room.freeParkingEnabled);
      room.status = 'playing';
      broadcastState(ns, room);
    });

    socket.on('declareBankruptcy', ({ roomCode }) => {
      handleAction(ns, socket, roomCode, (room) => {
        if (!room.gameState) return { error: 'No game' };
        return gl.doDeclareBankruptcy(room.gameState, socket.id);
      });
    });

    socket.on('chatMessage', ({ roomCode, text }) => {
      const room = rm.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      const trimmed = String(text || '').trim().slice(0, 200);
      if (!trimmed) return;
      broadcast(ns, roomCode, 'chatMessage', {
        name: player.name,
        text: trimmed,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    });

    socket.on('disconnect', () => {
      const room = rm.getRoomBySocketId(socket.id);
      if (room) {
        rm.leaveRoom(room.code, socket.id);
        broadcastState(ns, room);
      }
    });
  });
}

module.exports = { register };
