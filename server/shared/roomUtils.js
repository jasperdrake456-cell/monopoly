'use strict';
const { v4: uuidv4 } = require('uuid');

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Creates an isolated room manager for a single game namespace.
 * Each game gets its own Map so rooms never collide across games.
 */
function createRoomManager() {
  const rooms = new Map();

  function createRoom(hostSocketId, hostName) {
    let code;
    do { code = genCode(); } while (rooms.has(code));
    const room = {
      code,
      hostId: hostSocketId,
      players: [{ id: hostSocketId, name: hostName }],
      status: 'lobby',
      gameState: null,
    };
    rooms.set(code, room);
    return room;
  }

  function joinRoom(roomCode, socketId, playerName) {
    const room = rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'lobby') return { error: 'Game already in progress' };
    if (room.players.length >= 2) return { error: 'Room is full' };
    const taken = room.players.map(p => p.name.toLowerCase());
    if (taken.includes(playerName.toLowerCase())) return { error: 'Name already taken' };
    room.players.push({ id: socketId, name: playerName });
    return { room };
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

  function leaveRoom(roomCode, socketId) {
    const room = rooms.get(roomCode);
    if (!room) return null;
    room.players = room.players.filter(p => p.id !== socketId);
    if (room.players.length === 0) {
      rooms.delete(roomCode);
      return null;
    }
    if (room.hostId === socketId) room.hostId = room.players[0].id;
    return room;
  }

  function deleteRoom(roomCode) {
    rooms.delete(roomCode);
  }

  return { createRoom, joinRoom, getRoom, getRoomBySocketId, leaveRoom, deleteRoom };
}

module.exports = { createRoomManager };
