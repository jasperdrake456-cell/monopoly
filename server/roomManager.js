'use strict';
const { v4: uuidv4 } = require('uuid');

const rooms = new Map(); // roomCode -> room

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostSocketId, playerName, token, freeParkingEnabled, boardType) {
  let code;
  do { code = genCode(); } while (rooms.has(code));

  const sessionId = uuidv4();
  const player = {
    id: hostSocketId,
    sessionId,
    name: playerName,
    token,
    connected: true,
    isHost: true,
  };

  const room = {
    code,
    hostId: hostSocketId,
    players: [player],
    gameState: null,
    status: 'lobby',
    freeParkingEnabled: !!freeParkingEnabled,
    boardType: boardType === 'world' ? 'world' : 'classic',
  };

  rooms.set(code, room);
  return { room, player, sessionId };
}

function joinRoom(roomCode, socketId, playerName, token) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'lobby') return { error: 'Game already in progress' };
  if (room.players.length >= 6) return { error: 'Room is full' };

  const takenTokens = room.players.map(p => p.token);
  if (takenTokens.includes(token)) return { error: 'Token already taken' };

  const takenNames = room.players.map(p => p.name.toLowerCase());
  if (takenNames.includes(playerName.toLowerCase())) return { error: 'Name already taken' };

  const sessionId = uuidv4();
  const player = {
    id: socketId,
    sessionId,
    name: playerName,
    token,
    connected: true,
    isHost: false,
  };

  room.players.push(player);
  return { room, player, sessionId };
}

function reconnect(roomCode, sessionId, newSocketId) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };

  const player = room.players.find(p => p.sessionId === sessionId);
  if (!player) return { error: 'Session not found' };

  const oldId = player.id;
  player.id = newSocketId;
  player.connected = true;

  // Update gameState player id if game is running
  if (room.gameState) {
    const gp = room.gameState.players.find(p => p.id === oldId);
    if (gp) gp.id = newSocketId;
    if (room.gameState.players[room.gameState.currentPlayerIndex]?.id === oldId) {
      // no-op, already updated
    }
  }

  if (room.hostId === oldId) room.hostId = newSocketId;

  return { room, player };
}

function leaveRoom(roomCode, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const player = room.players.find(p => p.id === socketId);
  if (player) player.connected = false;

  // If host leaves in lobby, assign new host
  if (room.status === 'lobby' && room.hostId === socketId) {
    const others = room.players.filter(p => p.connected);
    if (others.length > 0) {
      room.hostId = others[0].id;
      others[0].isHost = true;
    }
  }

  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function getRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) return room;
  }
  return null;
}

function selectToken(roomCode, socketId, token) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'lobby') return { error: 'Game already started' };

  const taken = room.players.filter(p => p.id !== socketId).map(p => p.token);
  if (taken.includes(token)) return { error: 'Token already taken' };

  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'Player not found' };
  player.token = token;
  return { room };
}

function deleteRoom(roomCode) {
  rooms.delete(roomCode);
}

module.exports = { createRoom, joinRoom, reconnect, leaveRoom, getRoom, getRoomBySocketId, selectToken, deleteRoom };
