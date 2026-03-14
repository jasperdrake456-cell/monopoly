'use strict';
const { createRoomManager } = require('../shared/roomUtils');

const SHIPS = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

function register(ns) {
  const rm = createRoomManager();

  function emptyGrid() {
    return Array.from({ length: 10 }, () => Array(10).fill(null));
  }

  function validateShips(ships) {
    if (!Array.isArray(ships) || ships.length !== SHIPS.length) return false;
    const grid = emptyGrid();
    for (let i = 0; i < ships.length; i++) {
      const { r, c, horizontal, length } = ships[i];
      if (ships[i].length !== SHIPS[i].length) return false;
      for (let j = 0; j < length; j++) {
        const rr = horizontal ? r : r + j;
        const cc = horizontal ? c + j : c;
        if (rr < 0 || rr >= 10 || cc < 0 || cc >= 10) return false;
        if (grid[rr][cc]) return false;
        grid[rr][cc] = 1;
      }
    }
    return true;
  }

  function buildShipGrid(ships) {
    // returns 10x10 grid where each cell is null or shipIndex
    const grid = emptyGrid();
    for (let i = 0; i < ships.length; i++) {
      const { r, c, horizontal, length } = ships[i];
      for (let j = 0; j < length; j++) {
        const rr = horizontal ? r : r + j;
        const cc = horizontal ? c + j : c;
        grid[rr][cc] = i;
      }
    }
    return grid;
  }

  function broadcastState(room) {
    const gs = room.gameState;
    if (!gs) {
      ns.to(`room:${room.code}`).emit('gameState', {
        roomCode: room.code, status: room.status, hostId: room.hostId, players: room.players,
      });
      return;
    }

    // Send tailored state to each player
    for (const player of room.players) {
      const isHost = player.id === room.hostId;
      const myIdx = isHost ? 0 : 1;
      const oppIdx = isHost ? 1 : 0;

      const myFleet = gs.fleets[myIdx];
      const oppFleet = gs.fleets[oppIdx];

      // Own grid: show ship positions + hits/misses
      // Opponent grid: hide ships, only show hits/misses
      const myGrid = myFleet ? myFleet.shipGrid.map((row, r) =>
        row.map((cell, c) => ({
          ship: cell,
          hit: myFleet.hits[r][c],
        }))
      ) : null;

      const oppGrid = oppFleet ? oppFleet.shipGrid.map((row, r) =>
        row.map((cell, c) => ({
          ship: myFleet && oppFleet.hits[r][c] && cell !== null ? cell : null,
          hit: oppFleet.hits[r][c],
        }))
      ) : null;

      // Which of my ships are sunk
      const myShipsSunk = myFleet ? SHIPS.map((_, si) => {
        if (!myFleet.ships) return false;
        const { r, c, horizontal, length } = myFleet.ships[si];
        for (let j = 0; j < length; j++) {
          const rr = horizontal ? r : r + j;
          const cc = horizontal ? c + j : c;
          if (!myFleet.hits[rr][cc]) return false;
        }
        return true;
      }) : [];

      const oppShipsSunk = oppFleet ? SHIPS.map((_, si) => {
        if (!oppFleet.ships) return false;
        const { r, c, horizontal, length } = oppFleet.ships[si];
        for (let j = 0; j < length; j++) {
          const rr = horizontal ? r : r + j;
          const cc = horizontal ? c + j : c;
          if (!oppFleet.hits[rr][cc]) return false;
        }
        return true;
      }) : [];

      ns.to(player.id).emit('gameState', {
        roomCode: room.code,
        status: room.status,
        hostId: room.hostId,
        players: room.players,
        phase: gs.phase,
        currentTurn: gs.currentTurn,
        winner: gs.winner,
        myReady: myFleet?.placed || false,
        oppReady: oppFleet?.placed || false,
        myGrid,
        oppGrid,
        myShipsSunk,
        oppShipsSunk,
        shipDefs: SHIPS,
      });
    }
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
        phase: 'placement',
        currentTurn: null,
        winner: null,
        fleets: [
          { placed: false, ships: null, shipGrid: emptyGrid(), hits: emptyGrid() },
          { placed: false, ships: null, shipGrid: emptyGrid(), hits: emptyGrid() },
        ],
      };
      broadcastState(room);
    });

    socket.on('placeShips', ({ roomCode, ships }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.status !== 'playing') return;
      const gs = room.gameState;
      if (gs.phase !== 'placement') { socket.emit('error', { message: 'Not placement phase' }); return; }

      if (!validateShips(ships)) { socket.emit('error', { message: 'Invalid ship placement' }); return; }

      const isHost = room.players[0].id === socket.id;
      const idx = isHost ? 0 : 1;
      gs.fleets[idx].ships = ships;
      gs.fleets[idx].shipGrid = buildShipGrid(ships);
      gs.fleets[idx].placed = true;

      // Both placed → start battle
      if (gs.fleets[0].placed && gs.fleets[1].placed) {
        gs.phase = 'battle';
        gs.currentTurn = room.players[0].id; // host goes first
      }

      broadcastState(room);
    });

    socket.on('attack', ({ roomCode, r, c }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.status !== 'playing') return;
      const gs = room.gameState;
      if (gs.phase !== 'battle') { socket.emit('error', { message: 'Not battle phase' }); return; }
      if (gs.currentTurn !== socket.id) { socket.emit('error', { message: 'Not your turn' }); return; }

      const isHost = room.players[0].id === socket.id;
      const oppIdx = isHost ? 1 : 0;
      const oppFleet = gs.fleets[oppIdx];

      if (r < 0 || r >= 10 || c < 0 || c >= 10) { socket.emit('error', { message: 'Invalid coordinates' }); return; }
      if (oppFleet.hits[r][c] !== null) { socket.emit('error', { message: 'Already attacked there' }); return; }

      const hit = oppFleet.shipGrid[r][c] !== null;
      oppFleet.hits[r][c] = hit ? 'hit' : 'miss';

      // Check if all opponent ships sunk
      let allSunk = true;
      for (const ship of oppFleet.ships) {
        const { r: sr, c: sc, horizontal, length } = ship;
        for (let j = 0; j < length; j++) {
          const rr = horizontal ? sr : sr + j;
          const cc = horizontal ? sc + j : sc;
          if (oppFleet.hits[rr][cc] !== 'hit') { allSunk = false; break; }
        }
        if (!allSunk) break;
      }

      if (allSunk) {
        gs.winner = socket.id;
        gs.phase = 'ended';
        room.status = 'ended';
      } else if (!hit) {
        // Miss: switch turn
        gs.currentTurn = room.players[isHost ? 1 : 0].id;
      }
      // Hit: same player attacks again

      broadcastState(room);
    });

    socket.on('restartGame', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room || room.hostId !== socket.id) return;
      room.status = 'playing';
      room.gameState = {
        phase: 'placement',
        currentTurn: null,
        winner: null,
        fleets: [
          { placed: false, ships: null, shipGrid: emptyGrid(), hits: emptyGrid() },
          { placed: false, ships: null, shipGrid: emptyGrid(), hits: emptyGrid() },
        ],
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
