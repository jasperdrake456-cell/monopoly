'use strict';
const { createRoomManager } = require('../shared/roomUtils');

function register(ns) {
  const rm = createRoomManager();

  function broadcast(roomCode, event, data) {
    ns.to(`room:${roomCode}`).emit(event, data);
  }

  function makeEmptyBoard() {
    return Array.from({ length: 6 }, () => Array(7).fill(null));
  }

  function checkWin(board, row, col, color) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (const [dr, dc] of dirs) {
      let count = 1;
      for (let d = 1; d < 4; d++) {
        const r = row + dr*d, c = col + dc*d;
        if (r < 0 || r >= 6 || c < 0 || c >= 7 || board[r][c] !== color) break;
        count++;
      }
      for (let d = 1; d < 4; d++) {
        const r = row - dr*d, c = col - dc*d;
        if (r < 0 || r >= 6 || c < 0 || c >= 7 || board[r][c] !== color) break;
        count++;
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function broadcastState(room) {
    broadcast(room.code, 'gameState', {
      roomCode: room.code,
      status: room.status,
      hostId: room.hostId,
      players: room.players,
      ...room.gameState,
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
      room.gameState = {
        board: makeEmptyBoard(),
        currentTurn: 'R', // R = red (host), Y = yellow (joiner)
        winner: null,
        draw: false,
      };
      broadcastState(room);
    });

    socket.on('makeMove', ({ roomCode, col }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.status !== 'playing') return;
      const gs = room.gameState;
      if (gs.winner || gs.draw) return;

      // Determine my color
      const isHost = room.players[0].id === socket.id;
      const myColor = isHost ? 'R' : 'Y';
      if (gs.currentTurn !== myColor) { socket.emit('error', { message: "Not your turn" }); return; }

      // Find lowest empty row in column
      let row = -1;
      for (let r = 5; r >= 0; r--) {
        if (!gs.board[r][col]) { row = r; break; }
      }
      if (row === -1) { socket.emit('error', { message: 'Column full' }); return; }

      gs.board[row][col] = myColor;

      if (checkWin(gs.board, row, col, myColor)) {
        gs.winner = myColor;
        room.status = 'ended';
      } else if (gs.board[0].every(cell => cell !== null)) {
        gs.draw = true;
        room.status = 'ended';
      } else {
        gs.currentTurn = myColor === 'R' ? 'Y' : 'R';
      }

      broadcastState(room);
    });

    socket.on('restartGame', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.hostId !== socket.id) return;
      room.status = 'playing';
      room.gameState = {
        board: makeEmptyBoard(),
        currentTurn: 'R',
        winner: null,
        draw: false,
      };
      broadcastState(room);
    });

    socket.on('disconnect', () => {
      const room = rm.getRoomBySocketId(socket.id);
      if (!room) return;
      rm.leaveRoom(room.code, socket.id);
      if (rm.getRoom(room.code)) broadcastState(room);
    });
  });
}

module.exports = { register };
