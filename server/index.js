'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const rm = require('./roomManager');
const gl = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Serve built client in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Socket helpers ────────────────────────────────────────────────────────────

function roomChannel(code) { return `room:${code}`; }

function broadcast(roomCode, event, data) {
  io.to(roomChannel(roomCode)).emit(event, data);
}

function broadcastState(room) {
  broadcast(room.code, 'gameState', sanitizeState(room));
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

function handleAction(socket, roomCode, fn) {
  const room = rm.getRoom(roomCode);
  if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
  const result = fn(room);
  if (result && result.error) { socket.emit('error', { message: result.error }); return; }
  broadcastState(room);
}

// ─── Socket events ─────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // ── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('createRoom', ({ playerName, token, freeParkingEnabled }) => {
    const { room, player, sessionId } = rm.createRoom(socket.id, playerName, token, freeParkingEnabled);
    socket.join(roomChannel(room.code));
    socket.emit('roomCreated', { roomCode: room.code, playerId: socket.id, sessionId });
    broadcastState(room);
  });

  socket.on('joinRoom', ({ roomCode, playerName, token }) => {
    const result = rm.joinRoom(roomCode, socket.id, playerName, token);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(roomChannel(roomCode));
    socket.emit('roomJoined', { playerId: socket.id, sessionId: result.player.sessionId });
    broadcastState(result.room);
  });

  socket.on('reconnect', ({ roomCode, sessionId }) => {
    const result = rm.reconnect(roomCode, sessionId, socket.id);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    socket.join(roomChannel(roomCode));
    socket.emit('reconnected', { playerId: socket.id });
    broadcastState(result.room);
  });

  socket.on('selectToken', ({ roomCode, token }) => {
    const result = rm.selectToken(roomCode, socket.id, token);
    if (result.error) { socket.emit('error', { message: result.error }); return; }
    broadcastState(result.room);
  });

  socket.on('startGame', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (room.hostId !== socket.id) return { error: 'Only the host can start the game' };
      if (room.players.length < 2) return { error: 'Need at least 2 players' };
      if (room.status !== 'lobby') return { error: 'Game already started' };

      const gameStatePlayers = room.players.map(p => ({
        id: p.id,
        name: p.name,
        token: p.token,
        sessionId: p.sessionId,
      }));

      room.gameState = gl.initGame(gameStatePlayers, room.freeParkingEnabled);
      room.status = 'playing';
    });
  });

  // ── Game actions ──────────────────────────────────────────────────────────

  socket.on('rollDice', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game in progress' };
      return gl.doRollDice(room.gameState, socket.id);
    });
  });

  socket.on('buyProperty', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doBuyProperty(room.gameState, socket.id);
    });
  });

  socket.on('passProperty', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doPassProperty(room.gameState, socket.id);
    });
  });

  socket.on('auctionBid', ({ roomCode, amount }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doAuctionBid(room.gameState, socket.id, amount);
    });
  });

  socket.on('auctionPass', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doAuctionPass(room.gameState, socket.id);
    });
  });

  socket.on('resolveCard', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doResolveCard(room.gameState, socket.id);
    });
  });

  socket.on('endTurn', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doEndTurn(room.gameState, socket.id);
    });
  });

  socket.on('payJailFine', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doPayJailFine(room.gameState, socket.id);
    });
  });

  socket.on('useJailCard', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doUseJailCard(room.gameState, socket.id);
    });
  });

  socket.on('buyBuilding', ({ roomCode, propertyId, count }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doBuyBuilding(room.gameState, socket.id, propertyId, count);
    });
  });

  socket.on('sellBuilding', ({ roomCode, propertyId, count }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doSellBuilding(room.gameState, socket.id, propertyId, count);
    });
  });

  socket.on('mortgage', ({ roomCode, propertyId }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doMortgage(room.gameState, socket.id, propertyId);
    });
  });

  socket.on('unmortgage', ({ roomCode, propertyId }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doUnmortgage(room.gameState, socket.id, propertyId);
    });
  });

  socket.on('proposeTrade', ({ roomCode, toId, offer, request }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doProposeTrade(room.gameState, socket.id, toId, offer, request);
    });
  });

  socket.on('respondTrade', ({ roomCode, accepted }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doRespondTrade(room.gameState, socket.id, accepted);
    });
  });

  socket.on('cancelTrade', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doCancelTrade(room.gameState, socket.id);
    });
  });

  socket.on('declareBankruptcy', ({ roomCode }) => {
    handleAction(socket, roomCode, (room) => {
      if (!room.gameState) return { error: 'No game' };
      return gl.doDeclareBankruptcy(room.gameState, socket.id);
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const room = rm.getRoomBySocketId(socket.id);
    if (room) {
      rm.leaveRoom(room.code, socket.id);
      broadcastState(room);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Monopoly server running on port ${PORT}`));
