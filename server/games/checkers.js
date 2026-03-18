'use strict';
const { createRoomManager } = require('../shared/roomUtils');

function register(ns) {
  const rm = createRoomManager();

  function makeInitialBoard() {
    // 8x8 board. Red pieces on rows 0-2 (dark squares), Black on rows 5-7
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) board[r][c] = { color: 'R', king: false };
      }
    }
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) board[r][c] = { color: 'B', king: false };
      }
    }
    return board;
  }

  function getJumps(board, r, c, color, king) {
    const dirs = king
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : color === 'R' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
    const jumps = [];
    for (const [dr, dc] of dirs) {
      const mr = r + dr, mc = c + dc;
      const lr = r + dr*2, lc = c + dc*2;
      if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) continue;
      const mid = board[mr]?.[mc];
      if (mid && mid.color !== color && !board[lr][lc]) {
        jumps.push({ to: [lr, lc], captured: [mr, mc] });
      }
    }
    return jumps;
  }

  function getMoves(board, r, c, color, king) {
    const dirs = king
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : color === 'R' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
    const moves = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      if (!board[nr][nc]) moves.push([nr, nc]);
    }
    return moves;
  }

  function hasAnyJumps(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color === color && getJumps(board, r, c, p.color, p.king).length > 0) return true;
      }
    }
    return false;
  }

  function hasAnyMoves(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || p.color !== color) continue;
        if (getJumps(board, r, c, p.color, p.king).length > 0) return true;
        if (getMoves(board, r, c, p.color, p.king).length > 0) return true;
      }
    }
    return false;
  }

  function broadcastState(room) {
    ns.to(`room:${room.code}`).emit('gameState', {
      roomCode: room.code,
      status: room.status,
      hostId: room.hostId,
      players: room.players,
      ...(room.gameState || {}),
    });
  }

  ns.on('connection', (socket) => {
    socket.on('createRoom', ({ playerName }) => {
      try {
        const room = rm.createRoom(socket.id, playerName);
        socket.join(`room:${room.code}`);
        socket.emit('roomCreated', { roomCode: room.code, playerId: socket.id });
        broadcastState(room);
      } catch (err) {
        console.error('[Checkers] createRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
      try {
        const result = rm.joinRoom(roomCode, socket.id, playerName);
        if (result.error) { socket.emit('error', { message: result.error }); return; }
        socket.join(`room:${roomCode}`);
        socket.emit('roomJoined', { playerId: socket.id });
        broadcastState(result.room);
      } catch (err) {
        console.error('[Checkers] joinRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('startGame', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
        if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only host can start' }); return; }
        if (room.players.length < 2) { socket.emit('error', { message: 'Need 2 players' }); return; }
        room.status = 'playing';
        room.gameState = {
          board: makeInitialBoard(),
          currentTurn: 'R', // host = Red, joiner = Black
          winner: null,
          mustJumpFrom: null, // [r, c] if mid-multi-jump
        };
        broadcastState(room);
      } catch (err) {
        console.error('[Checkers] startGame error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('makeMove', ({ roomCode, from, to }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (gs.winner) return;

        const isHost = room.players[0].id === socket.id;
        const myColor = isHost ? 'R' : 'B';
        if (gs.currentTurn !== myColor) { socket.emit('error', { message: "Not your turn" }); return; }

        const [fr, fc] = from;
        const [tr, tc] = to;
        const piece = gs.board[fr]?.[fc];
        if (!piece || piece.color !== myColor) { socket.emit('error', { message: 'Invalid piece' }); return; }

        // If mid-multi-jump, must continue from that square
        if (gs.mustJumpFrom && (gs.mustJumpFrom[0] !== fr || gs.mustJumpFrom[1] !== fc)) {
          socket.emit('error', { message: 'Must continue multi-jump' }); return;
        }

        const mustJump = hasAnyJumps(gs.board, myColor);
        const jumps = getJumps(gs.board, fr, fc, piece.color, piece.king);
        const jump = jumps.find(j => j.to[0] === tr && j.to[1] === tc);

        if (!jump && mustJump) { socket.emit('error', { message: 'Must jump' }); return; }

        if (jump) {
          // Execute jump
          gs.board[tr][tc] = piece;
          gs.board[fr][fc] = null;
          gs.board[jump.captured[0]][jump.captured[1]] = null;

          // King promotion
          if ((myColor === 'R' && tr === 7) || (myColor === 'B' && tr === 0)) piece.king = true;

          // Check for multi-jump
          const furtherJumps = getJumps(gs.board, tr, tc, piece.color, piece.king);
          if (furtherJumps.length > 0) {
            gs.mustJumpFrom = [tr, tc];
            broadcastState(room);
            return;
          }
          gs.mustJumpFrom = null;
        } else {
          // Regular move
          const moves = getMoves(gs.board, fr, fc, piece.color, piece.king);
          if (!moves.some(([r, c]) => r === tr && c === tc)) {
            socket.emit('error', { message: 'Invalid move' }); return;
          }
          gs.board[tr][tc] = piece;
          gs.board[fr][fc] = null;
          if ((myColor === 'R' && tr === 7) || (myColor === 'B' && tr === 0)) piece.king = true;
          gs.mustJumpFrom = null;
        }

        const opponent = myColor === 'R' ? 'B' : 'R';

        // Check win: opponent has no pieces or no moves
        const opponentPieces = gs.board.flat().filter(p => p && p.color === opponent);
        if (opponentPieces.length === 0 || !hasAnyMoves(gs.board, opponent)) {
          gs.winner = myColor;
          room.status = 'ended';
        } else {
          gs.currentTurn = opponent;
        }

        broadcastState(room);
      } catch (err) {
        console.error('[Checkers] makeMove error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('restartGame', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.hostId !== socket.id) return;
        room.status = 'playing';
        room.gameState = {
          board: makeInitialBoard(),
          currentTurn: 'R',
          winner: null,
          mustJumpFrom: null,
        };
        broadcastState(room);
      } catch (err) {
        console.error('[Checkers] restartGame error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('disconnect', () => {
      try {
        const room = rm.getRoomBySocketId(socket.id);
        if (!room) return;
        rm.leaveRoom(room.code, socket.id);
        if (rm.getRoom(room.code)) broadcastState(room);
      } catch (err) {
        console.error('[Checkers] disconnect error:', err);
      }
    });
  });
}

module.exports = { register };
