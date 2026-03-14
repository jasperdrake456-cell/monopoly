'use strict';
const { Chess } = require('chess.js');
const { createRoomManager } = require('../shared/roomUtils');

function register(ns) {
  const rm = createRoomManager();
  // Store Chess instances separately (can't put class instances in plain state)
  const chessInstances = new Map(); // roomCode -> Chess instance

  function broadcastState(room) {
    const chess = chessInstances.get(room.code);
    const gs = room.gameState || {};
    ns.to(`room:${room.code}`).emit('gameState', {
      roomCode: room.code,
      status: room.status,
      hostId: room.hostId,
      players: room.players,
      fen: chess ? chess.fen() : null,
      turn: chess ? chess.turn() : null, // 'w' or 'b'
      inCheck: chess ? chess.inCheck() : false,
      isCheckmate: chess ? chess.isCheckmate() : false,
      isStalemate: chess ? chess.isStalemate() : false,
      isDraw: chess ? (chess.isDraw()) : false,
      isGameOver: chess ? chess.isGameOver() : false,
      winner: gs.winner || null,
      lastMove: gs.lastMove || null,
    });
  }

  ns.on('connection', (socket) => {
    socket.on('createRoom', ({ playerName }) => {
      const room = rm.createRoom(socket.id, playerName);
      socket.join(`room:${room.code}`);
      socket.emit('roomCreated', { roomCode: room.code, playerId: socket.id });
      broadcastState(room);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
      const result = rm.joinRoom(roomCode, socket.id, playerName);
      if (result.error) { socket.emit('error', { message: result.error }); return; }
      socket.join(`room:${roomCode}`);
      socket.emit('roomJoined', { playerId: socket.id });
      broadcastState(result.room);
    });

    socket.on('startGame', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
      if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only host can start' }); return; }
      if (room.players.length < 2) { socket.emit('error', { message: 'Need 2 players' }); return; }
      room.status = 'playing';
      room.gameState = { winner: null, lastMove: null };
      const chess = new Chess();
      chessInstances.set(roomCode, chess);
      broadcastState(room);
    });

    socket.on('makeMove', ({ roomCode, from, to, promotion }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.status !== 'playing') return;
      const chess = chessInstances.get(roomCode);
      if (!chess) return;

      // Validate it's this player's turn
      // host = white (w), joiner = black (b)
      const isHost = room.players[0].id === socket.id;
      const myColor = isHost ? 'w' : 'b';
      if (chess.turn() !== myColor) { socket.emit('error', { message: "Not your turn" }); return; }

      let moveResult;
      try {
        moveResult = chess.move({ from, to, promotion: promotion || 'q' });
      } catch {
        moveResult = null;
      }
      if (!moveResult) { socket.emit('error', { message: 'Illegal move' }); return; }

      room.gameState.lastMove = { from, to };

      if (chess.isCheckmate()) {
        room.gameState.winner = myColor;
        room.status = 'ended';
      } else if (chess.isGameOver()) {
        room.gameState.winner = 'draw';
        room.status = 'ended';
      }

      broadcastState(room);
    });

    socket.on('restartGame', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.hostId !== socket.id) return;
      room.status = 'playing';
      room.gameState = { winner: null, lastMove: null };
      const chess = new Chess();
      chessInstances.set(roomCode, chess);
      broadcastState(room);
    });

    socket.on('disconnect', () => {
      const room = rm.getRoomBySocketId(socket.id);
      if (!room) return;
      const code = room.code;
      rm.leaveRoom(code, socket.id);
      if (!rm.getRoom(code)) {
        chessInstances.delete(code);
      } else {
        broadcastState(room);
      }
    });
  });
}

module.exports = { register };
