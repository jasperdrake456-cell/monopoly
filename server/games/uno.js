'use strict';

// ── Uno game server ──────────────────────────────────────────────────────────
// Custom room manager (supports 2-8 players; roomUtils is capped at 2)

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createUnoRoomManager() {
  const rooms = new Map();

  function createRoom(hostSocketId, hostName) {
    let code;
    do { code = genCode(); } while (rooms.has(code));
    const room = {
      code,
      hostId: hostSocketId,
      players: [{ id: hostSocketId, name: hostName }],
      status: 'waiting',
      gameState: null,
    };
    rooms.set(code, room);
    return room;
  }

  function joinRoom(roomCode, socketId, playerName) {
    const room = rooms.get(roomCode);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'waiting') return { error: 'Game already in progress' };
    if (room.players.length >= 8) return { error: 'Room is full (max 8 players)' };
    const taken = room.players.map(p => p.name.toLowerCase());
    if (taken.includes(playerName.toLowerCase())) return { error: 'Name already taken in this room' };
    room.players.push({ id: socketId, name: playerName });
    return { room };
  }

  function getRoom(roomCode) { return rooms.get(roomCode) || null; }

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
    if (room.players.length === 0) { rooms.delete(roomCode); return null; }
    if (room.hostId === socketId) room.hostId = room.players[0].id;
    return room;
  }

  function deleteRoom(roomCode) { rooms.delete(roomCode); }

  return { createRoom, joinRoom, getRoom, getRoomBySocketId, leaveRoom, deleteRoom };
}

// ── Deck helpers ─────────────────────────────────────────────────────────────

const COLORS = ['red', 'green', 'blue', 'yellow'];
const NUMBER_VALUES = ['0','1','2','3','4','5','6','7','8','9'];
const ACTION_VALUES = ['skip','reverse','draw2'];

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const color of COLORS) {
    // One 0 per color
    deck.push({ id: id++, color, value: '0', type: 'number' });
    // Two of each 1-9
    for (let i = 0; i < 2; i++) {
      for (const v of ['1','2','3','4','5','6','7','8','9']) {
        deck.push({ id: id++, color, value: v, type: 'number' });
      }
    }
    // Two of each action
    for (let i = 0; i < 2; i++) {
      for (const v of ACTION_VALUES) {
        deck.push({ id: id++, color, value: v, type: 'action' });
      }
    }
  }
  // 4 Wilds + 4 Wild Draw Four
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ id: id++, color: 'wild', value: 'draw4', type: 'wild' });
  }
  return deck; // 108 cards
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards(deck, discard, count) {
  // If deck too small, reshuffle discard (keep top of discard)
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discard.length <= 1) break; // no cards at all
      const top = discard[discard.length - 1];
      const reshuffled = shuffle(discard.slice(0, discard.length - 1));
      deck.push(...reshuffled);
      discard.length = 0;
      discard.push(top);
    }
    if (deck.length > 0) drawn.push(deck.pop());
  }
  return drawn;
}

// ── Game logic ────────────────────────────────────────────────────────────────

function canPlay(card, currentColor, topValue, drawStack) {
  if (drawStack > 0) {
    // Can only stack same draw type
    if (drawStack > 0 && topValue === 'draw2' && card.value === 'draw2') return true;
    if (drawStack > 0 && topValue === 'draw4' && card.value === 'draw4') return true;
    // Cannot play anything else if drawStack active
    return false;
  }
  if (card.type === 'wild') return true; // wild/draw4 always playable when no stack
  if (card.color === currentColor) return true;
  if (card.value === topValue) return true;
  return false;
}

function addLog(gs, msg) {
  gs.log.push({ msg, t: Date.now() });
  if (gs.log.length > 40) gs.log.shift();
}

function nextIndex(gs) {
  const n = gs.playerOrder.length;
  return ((gs.currentIndex + gs.direction) % n + n) % n;
}

function skipToIndex(gs, skipCount) {
  const n = gs.playerOrder.length;
  let idx = gs.currentIndex;
  for (let i = 0; i < skipCount; i++) {
    idx = ((idx + gs.direction) % n + n) % n;
  }
  return idx;
}

function currentPlayerId(gs) {
  return gs.playerOrder[gs.currentIndex];
}

function applyFirstCardEffect(gs) {
  const top = gs.discard[gs.discard.length - 1];
  if (!top) return;
  if (top.value === 'skip') {
    addLog(gs, 'First card is Skip — first player is skipped!');
    gs.currentIndex = nextIndex(gs);
  } else if (top.value === 'reverse') {
    if (gs.playerOrder.length === 2) {
      addLog(gs, 'First card is Reverse — acts as Skip for 2 players');
      gs.currentIndex = nextIndex(gs);
    } else {
      gs.direction = -1;
      addLog(gs, 'First card is Reverse — play goes counter-clockwise');
      gs.currentIndex = nextIndex(gs);
    }
  } else if (top.value === 'draw2') {
    gs.drawStack = 2;
    addLog(gs, 'First card is Draw Two — first player must draw 2!');
    // The first player will deal with the draw stack on their turn
    gs.currentIndex = nextIndex(gs);
  }
  // Wild/draw4 should never be first (we re-deal in that case)
}

function initGame(playerIds, playerNames) {
  let deck = shuffle(buildDeck());
  const hands = {};
  for (const id of playerIds) hands[id] = [];

  // Deal 7 cards to each player
  for (let i = 0; i < 7; i++) {
    for (const id of playerIds) {
      hands[id].push(deck.pop());
    }
  }

  // Flip first card — re-flip if wild
  let firstCard;
  do {
    firstCard = deck.pop();
    if (firstCard.type === 'wild') {
      deck.unshift(firstCard); // put back at bottom
      deck = shuffle(deck);    // reshuffle
    }
  } while (firstCard.type === 'wild');

  const discard = [firstCard];
  const currentColor = firstCard.color;

  const gs = {
    status: 'playing',
    deck,
    discard,
    hands,
    playerOrder: [...playerIds],
    playerNames: { ...playerNames },
    currentIndex: 0,
    direction: 1,
    currentColor,
    drawStack: 0,
    winner: null,
    log: [],
    unoSafe: {},       // id -> bool
    pendingUno: null,  // id of player who just played to 1 card (can be called out)
  };

  // Initialise unoSafe
  for (const id of playerIds) {
    gs.unoSafe[id] = true; // start safe (have 7 cards)
  }

  addLog(gs, `Game started! First card: ${firstCard.color} ${firstCard.value}`);
  applyFirstCardEffect(gs);

  return gs;
}

// Build the state to send to a specific player
function buildPlayerView(gs, room, myId) {
  const handSizes = {};
  for (const id of gs.playerOrder) {
    handSizes[id] = gs.hands[id] ? gs.hands[id].length : 0;
  }

  const topCard = gs.discard[gs.discard.length - 1] || null;

  return {
    roomCode: room.code,
    hostId: room.hostId,
    status: gs.status,
    players: room.players,
    playerOrder: gs.playerOrder,
    playerNames: gs.playerNames,
    currentIndex: gs.currentIndex,
    direction: gs.direction,
    currentColor: gs.currentColor,
    drawStack: gs.drawStack,
    winner: gs.winner,
    log: gs.log,
    unoSafe: gs.unoSafe,
    pendingUno: gs.pendingUno,
    topCard,
    deckCount: gs.deck.length,
    handSizes,
    myHand: gs.hands[myId] || [],
    currentPlayer: gs.playerOrder[gs.currentIndex] || null,
  };
}

function broadcastGameState(ns, room) {
  const gs = room.gameState;
  if (!gs) {
    // Lobby state
    ns.to(`room:${room.code}`).emit('gameState', {
      roomCode: room.code,
      hostId: room.hostId,
      status: room.status,
      players: room.players,
      playerOrder: [],
      gameState: null,
    });
    return;
  }
  // Send personalised view to each player
  for (const player of room.players) {
    const view = buildPlayerView(gs, room, player.id);
    ns.to(player.id).emit('gameState', view);
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

function register(ns) {
  const rm = createUnoRoomManager();

  ns.on('connection', (socket) => {

    // ── createRoom ──────────────────────────────────────────────────────────
    socket.on('createRoom', ({ playerName }) => {
      try {
        if (!playerName || !playerName.trim()) {
          socket.emit('error', { message: 'Player name required' }); return;
        }
        const room = rm.createRoom(socket.id, playerName.trim().slice(0, 20));
        socket.join(`room:${room.code}`);
        socket.join(socket.id); // personal room for targeted emits
        socket.emit('roomCreated', { roomCode: room.code, playerId: socket.id });
        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] createRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── joinRoom ────────────────────────────────────────────────────────────
    socket.on('joinRoom', ({ roomCode, playerName }) => {
      try {
        if (!playerName || !playerName.trim()) {
          socket.emit('error', { message: 'Player name required' }); return;
        }
        const result = rm.joinRoom(roomCode, socket.id, playerName.trim().slice(0, 20));
        if (result.error) { socket.emit('error', { message: result.error }); return; }
        socket.join(`room:${roomCode}`);
        socket.join(socket.id);
        socket.emit('roomJoined', { playerId: socket.id });
        broadcastGameState(ns, result.room);
      } catch (err) {
        console.error('[Uno] joinRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── startGame ───────────────────────────────────────────────────────────
    socket.on('startGame', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
        if (room.hostId !== socket.id) { socket.emit('error', { message: 'Only the host can start the game' }); return; }
        if (room.players.length < 2) { socket.emit('error', { message: 'Need at least 2 players to start' }); return; }

        const playerIds = room.players.map(p => p.id);
        const playerNames = {};
        for (const p of room.players) playerNames[p.id] = p.name;

        room.status = 'playing';
        room.gameState = initGame(playerIds, playerNames);
        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] startGame error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── playCard ────────────────────────────────────────────────────────────
    socket.on('playCard', ({ roomCode, cardIndex, chosenColor }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs || gs.winner) return;

        if (currentPlayerId(gs) !== socket.id) {
          socket.emit('error', { message: 'Not your turn' }); return;
        }

        const hand = gs.hands[socket.id];
        if (!hand || cardIndex < 0 || cardIndex >= hand.length) {
          socket.emit('error', { message: 'Invalid card index' }); return;
        }

        const card = hand[cardIndex];
        const topCard = gs.discard[gs.discard.length - 1];

        if (!canPlay(card, gs.currentColor, topCard ? topCard.value : null, gs.drawStack)) {
          socket.emit('error', { message: 'Cannot play that card' }); return;
        }

        // Wild color must be chosen
        if (card.type === 'wild' && !['red','green','blue','yellow'].includes(chosenColor)) {
          socket.emit('error', { message: 'Must choose a valid color for wild card' }); return;
        }

        // Remove card from hand
        hand.splice(cardIndex, 1);
        gs.discard.push(card);

        // Determine new color
        if (card.type === 'wild') {
          gs.currentColor = chosenColor;
        } else {
          gs.currentColor = card.color;
        }

        const playerName = gs.playerNames[socket.id] || socket.id;
        addLog(gs, `${playerName} played ${card.color} ${card.value}${card.type === 'wild' ? ` → chose ${chosenColor}` : ''}`);

        // Check for UNO pending — clear previous pendingUno if a new card is played
        gs.pendingUno = null;

        // Update UNO safety
        if (hand.length === 1) {
          gs.unoSafe[socket.id] = false;  // has 1 card, not yet called uno
          gs.pendingUno = socket.id;       // window for callout
        } else if (hand.length === 0) {
          // Win!
          gs.winner = socket.id;
          gs.status = 'ended';
          room.status = 'ended';
          addLog(gs, `${playerName} wins! 🎉`);
          broadcastGameState(ns, room);
          ns.to(`room:${room.code}`).emit('gameOver', {
            winnerId: socket.id,
            winnerName: playerName,
          });
          return;
        } else {
          gs.unoSafe[socket.id] = true; // has 2+ cards = safe
        }

        // Apply card effects and advance turn
        if (card.value === 'skip') {
          const skippedIdx = nextIndex(gs);
          const skippedId = gs.playerOrder[skippedIdx];
          addLog(gs, `${gs.playerNames[skippedId] || skippedId} is skipped!`);
          gs.currentIndex = skipToIndex(gs, 2);
        } else if (card.value === 'reverse') {
          if (gs.playerOrder.length === 2) {
            // Acts as skip
            addLog(gs, 'Reverse acts as Skip (2 players)');
            gs.currentIndex = skipToIndex(gs, 2);
          } else {
            gs.direction *= -1;
            addLog(gs, 'Direction reversed!');
            gs.currentIndex = nextIndex(gs);
          }
        } else if (card.value === 'draw2') {
          gs.drawStack += 2;
          addLog(gs, `Draw stack is now ${gs.drawStack}!`);
          gs.currentIndex = nextIndex(gs);
        } else if (card.value === 'draw4') {
          gs.drawStack += 4;
          addLog(gs, `Wild Draw Four! Stack is now ${gs.drawStack}!`);
          gs.currentIndex = nextIndex(gs);
        } else {
          // Normal number or wild (no draw) — just advance
          gs.currentIndex = nextIndex(gs);
        }

        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] playCard error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── drawCard ────────────────────────────────────────────────────────────
    socket.on('drawCard', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs || gs.winner) return;

        if (currentPlayerId(gs) !== socket.id) {
          socket.emit('error', { message: 'Not your turn' }); return;
        }

        const hand = gs.hands[socket.id];
        const playerName = gs.playerNames[socket.id] || socket.id;

        // Clear pendingUno when a new action happens
        gs.pendingUno = null;

        if (gs.drawStack > 0) {
          // Forced draw
          const count = gs.drawStack;
          const drawn = drawCards(gs.deck, gs.discard, count);
          for (const c of drawn) hand.push(c);
          gs.drawStack = 0;
          addLog(gs, `${playerName} draws ${count} cards!`);
          gs.unoSafe[socket.id] = hand.length !== 1;
          // Skip turn
          gs.currentIndex = nextIndex(gs);
          broadcastGameState(ns, room);
        } else {
          // Draw 1 — player may play it if it's playable
          const drawn = drawCards(gs.deck, gs.discard, 1);
          if (drawn.length === 0) {
            socket.emit('error', { message: 'No cards left in deck' }); return;
          }
          const card = drawn[0];
          hand.push(card);
          gs.unoSafe[socket.id] = hand.length !== 1;
          addLog(gs, `${playerName} draws a card`);

          const topCard = gs.discard[gs.discard.length - 1];
          const playable = canPlay(card, gs.currentColor, topCard ? topCard.value : null, 0);

          // Send the drawn card privately; client decides to play or pass
          socket.emit('drew', {
            card,
            playable,
          });

          // We don't advance turn here — we wait for either 'playDrawn' or 'passTurn'
          broadcastGameState(ns, room);
        }
      } catch (err) {
        console.error('[Uno] drawCard error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── playDrawn — play the card just drawn ────────────────────────────────
    socket.on('playDrawn', ({ roomCode, chosenColor }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs || gs.winner) return;

        if (currentPlayerId(gs) !== socket.id) {
          socket.emit('error', { message: 'Not your turn' }); return;
        }

        const hand = gs.hands[socket.id];
        // The drawn card is always the last card in hand
        const cardIndex = hand.length - 1;
        const card = hand[cardIndex];
        const topCard = gs.discard[gs.discard.length - 1];

        if (!canPlay(card, gs.currentColor, topCard ? topCard.value : null, 0)) {
          socket.emit('error', { message: 'Cannot play that card' }); return;
        }

        if (card.type === 'wild' && !['red','green','blue','yellow'].includes(chosenColor)) {
          socket.emit('error', { message: 'Must choose a valid color' }); return;
        }

        hand.splice(cardIndex, 1);
        gs.discard.push(card);

        if (card.type === 'wild') {
          gs.currentColor = chosenColor;
        } else {
          gs.currentColor = card.color;
        }

        const playerName = gs.playerNames[socket.id] || socket.id;
        addLog(gs, `${playerName} played drawn card: ${card.color} ${card.value}`);

        gs.pendingUno = null;
        if (hand.length === 1) {
          gs.unoSafe[socket.id] = false;
          gs.pendingUno = socket.id;
        } else if (hand.length === 0) {
          gs.winner = socket.id;
          gs.status = 'ended';
          room.status = 'ended';
          addLog(gs, `${playerName} wins! 🎉`);
          broadcastGameState(ns, room);
          ns.to(`room:${room.code}`).emit('gameOver', { winnerId: socket.id, winnerName: playerName });
          return;
        } else {
          gs.unoSafe[socket.id] = true;
        }

        if (card.value === 'skip') {
          const skippedId = gs.playerOrder[nextIndex(gs)];
          addLog(gs, `${gs.playerNames[skippedId] || skippedId} is skipped!`);
          gs.currentIndex = skipToIndex(gs, 2);
        } else if (card.value === 'reverse') {
          if (gs.playerOrder.length === 2) {
            gs.currentIndex = skipToIndex(gs, 2);
          } else {
            gs.direction *= -1;
            gs.currentIndex = nextIndex(gs);
          }
        } else if (card.value === 'draw2') {
          gs.drawStack += 2;
          gs.currentIndex = nextIndex(gs);
        } else if (card.value === 'draw4') {
          gs.drawStack += 4;
          gs.currentIndex = nextIndex(gs);
        } else {
          gs.currentIndex = nextIndex(gs);
        }

        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] playDrawn error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── passTurn — pass after drawing (card not playable) ──────────────────
    socket.on('passTurn', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs || gs.winner) return;
        if (currentPlayerId(gs) !== socket.id) return;

        const playerName = gs.playerNames[socket.id] || socket.id;
        addLog(gs, `${playerName} passes`);
        gs.pendingUno = null;
        gs.currentIndex = nextIndex(gs);
        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] passTurn error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── callUno — player declares UNO (has 1 card) ──────────────────────────
    socket.on('callUno', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs) return;

        const hand = gs.hands[socket.id];
        const playerName = gs.playerNames[socket.id] || socket.id;

        if (hand && hand.length === 1) {
          gs.unoSafe[socket.id] = true;
          if (gs.pendingUno === socket.id) gs.pendingUno = null;
          addLog(gs, `${playerName} calls UNO!`);
          ns.to(`room:${room.code}`).emit('unoCalled', { playerId: socket.id, playerName });
          broadcastGameState(ns, room);
        }
      } catch (err) {
        console.error('[Uno] callUno error:', err);
      }
    });

    // ── callout — challenge a player who forgot UNO ─────────────────────────
    socket.on('callout', ({ roomCode, targetId }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.status !== 'playing') return;
        const gs = room.gameState;
        if (!gs) return;

        if (socket.id === targetId) return; // can't call yourself out

        const targetHand = gs.hands[targetId];
        const targetName = gs.playerNames[targetId] || targetId;
        const callerName = gs.playerNames[socket.id] || socket.id;

        // Valid callout: target has exactly 1 card and hasn't called uno
        if (targetHand && targetHand.length === 1 && !gs.unoSafe[targetId]) {
          // Penalise — draw 2
          const drawn = drawCards(gs.deck, gs.discard, 2);
          for (const c of drawn) targetHand.push(c);
          gs.unoSafe[targetId] = true;
          gs.pendingUno = null;
          addLog(gs, `${callerName} called out ${targetName}! ${targetName} draws 2.`);
          ns.to(`room:${room.code}`).emit('calledOut', {
            callerId: socket.id, callerName,
            targetId, targetName,
          });
          broadcastGameState(ns, room);
        } else {
          socket.emit('error', { message: 'Invalid callout — they already called UNO or have more than 1 card' });
        }
      } catch (err) {
        console.error('[Uno] callout error:', err);
      }
    });

    // ── chatMessage ─────────────────────────────────────────────────────────
    socket.on('chatMessage', ({ roomCode, text }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        const msg = {
          from: player.name,
          text: String(text).trim().slice(0, 200),
          t: Date.now(),
        };
        if (!msg.text) return;
        ns.to(`room:${room.code}`).emit('chatMessage', msg);
      } catch (err) {
        console.error('[Uno] chatMessage error:', err);
      }
    });

    // ── rematchGame ─────────────────────────────────────────────────────────
    socket.on('rematchGame', ({ roomCode }) => {
      try {
        const room = rm.getRoom(roomCode);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 2) return;

        const playerIds = room.players.map(p => p.id);
        const playerNames = {};
        for (const p of room.players) playerNames[p.id] = p.name;

        room.status = 'playing';
        room.gameState = initGame(playerIds, playerNames);
        broadcastGameState(ns, room);
      } catch (err) {
        console.error('[Uno] rematchGame error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      try {
        const room = rm.getRoomBySocketId(socket.id);
        if (!room) return;
        const code = room.code;
        const playerName = room.players.find(p => p.id === socket.id)?.name || 'A player';
        rm.leaveRoom(code, socket.id);
        const remaining = rm.getRoom(code);
        if (remaining) {
          if (remaining.gameState) {
            // Remove from playerOrder
            const gs = remaining.gameState;
            const idx = gs.playerOrder.indexOf(socket.id);
            if (idx !== -1) {
              gs.playerOrder.splice(idx, 1);
              delete gs.hands[socket.id];
              delete gs.unoSafe[socket.id];
              // Adjust currentIndex
              if (gs.playerOrder.length === 0) {
                remaining.status = 'ended';
                gs.status = 'ended';
              } else {
                if (gs.currentIndex >= gs.playerOrder.length) {
                  gs.currentIndex = 0;
                }
                addLog(gs, `${playerName} disconnected`);
                if (gs.playerOrder.length === 1) {
                  const lastId = gs.playerOrder[0];
                  gs.winner = lastId;
                  gs.status = 'ended';
                  remaining.status = 'ended';
                  const winnerName = gs.playerNames[lastId] || lastId;
                  addLog(gs, `${winnerName} wins — all others disconnected!`);
                  ns.to(`room:${code}`).emit('gameOver', { winnerId: lastId, winnerName });
                }
              }
            }
          }
          broadcastGameState(ns, remaining);
        }
      } catch (err) {
        console.error('[Uno] disconnect error:', err);
      }
    });
  });
}

module.exports = { register };
