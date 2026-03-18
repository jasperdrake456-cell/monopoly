'use strict';

// ── Cards ─────────────────────────────────────────────────────────────────────
const SUITS  = ['♠','♥','♦','♣'];
const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV     = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
const SB = 10, BB = 20, DEFAULT_BUYIN = 1000, MAX_PLAYERS = 6;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
  shuffle(d);
  return d;
}

// ── Hand evaluation ───────────────────────────────────────────────────────────
function combos5(arr) {
  const res = [];
  function go(i, cur) {
    if (cur.length === 5) { res.push([...cur]); return; }
    if (i >= arr.length) return;
    cur.push(arr[i]); go(i + 1, cur); cur.pop();
    go(i + 1, cur);
  }
  go(0, []);
  return res;
}

function evalFive(cards) {
  const vals  = cards.map(c => RV[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const flush = suits.every(s => s === suits[0]);
  const uniq  = [...new Set(vals)].sort((a, b) => b - a);

  let str = false, strHi = vals[0];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { str = true; strHi = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5) { str = true; strHi = 5; } // wheel
  }

  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  const grps = Object.entries(freq)
    .map(([v, c]) => [+v, c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const cnt = grps.map(([, c]) => c);

  if (flush && str)              return [8, strHi];
  if (cnt[0] === 4)              return [7, grps[0][0], grps[1][0]];
  if (cnt[0] === 3 && cnt[1]===2)return [6, grps[0][0], grps[1][0]];
  if (flush)                     return [5, ...vals];
  if (str)                       return [4, strHi];
  if (cnt[0] === 3)              return [3, grps[0][0], grps[1][0], grps[2][0]];
  if (cnt[0] === 2 && cnt[1]===2)return [2, grps[0][0], grps[1][0], grps[2][0]];
  if (cnt[0] === 2)              return [1, grps[0][0], grps[1][0], grps[2][0], grps[3][0]];
  return [0, ...vals];
}

function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

function bestHand(hole, community) {
  const all = [...hole, ...community];
  const cs  = all.length >= 5 ? combos5(all) : [all];
  let best  = null;
  for (const c of cs) {
    const sc = evalFive(c);
    if (!best || cmpScore(sc, best.score) > 0) best = { score: sc, cards: c };
  }
  return best;
}

const HAND_NAMES = [
  'High Card','One Pair','Two Pair','Three of a Kind',
  'Straight','Flush','Full House','Four of a Kind','Straight Flush',
];
function handName(score) { return HAND_NAMES[score[0]] || 'High Card'; }

// ── Game logic ────────────────────────────────────────────────────────────────
function findNextActive(players, fromIdx) {
  const n = players.length;
  let idx = (fromIdx + 1) % n;
  for (let i = 0; i < n; i++) {
    if (!players[idx].folded && !players[idx].allIn) return idx;
    idx = (idx + 1) % n;
  }
  return -1;
}

function initHand(room) {
  const deck = createDeck();
  const n    = room.players.length;

  // Carry chips from previous hand (or assign starting chips)
  const prevGs   = room.gameState;
  const chipMap  = {};
  if (prevGs) prevGs.players.forEach(p => { chipMap[p.id] = p.chips; });

  const gPlayers = room.players.map(p => ({
    id:        p.id,
    name:      p.name,
    chips:     chipMap[p.id] ?? p.buyIn ?? DEFAULT_BUYIN,
    holeCards: [deck.pop(), deck.pop()],
    bet:       0,
    totalBet:  0,
    folded:    false,
    allIn:     false,
  }));

  // Advance dealer button
  const prevDealer = typeof room.dealerIdx === 'number' ? room.dealerIdx : -1;
  const dealerIdx  = (prevDealer + 1) % n;
  room.dealerIdx   = dealerIdx;

  const isHU  = n === 2;
  const sbIdx = isHU ? dealerIdx : (dealerIdx + 1) % n;
  const bbIdx = isHU ? (dealerIdx + 1) % n : (dealerIdx + 2) % n;

  let pot = 0;
  function postBlind(idx, amount) {
    const p      = gPlayers[idx];
    const actual = Math.min(amount, p.chips);
    p.chips     -= actual;
    p.bet        = actual;
    p.totalBet   = actual;
    if (p.chips === 0) p.allIn = true;
    pot         += actual;
  }
  postBlind(sbIdx, SB);
  postBlind(bbIdx, BB);

  const preflopFirst = (bbIdx + 1) % n;
  const toAct        = gPlayers.filter(p => !p.allIn).length;

  room.gameState = {
    deck,
    communityCards: [],
    pot,
    currentBet:   gPlayers[bbIdx].bet,
    minRaise:     BB,
    round:        'preflop',
    dealerIdx,
    sbIdx,
    bbIdx,
    currentIdx:   preflopFirst,
    toAct,
    players:      gPlayers,
    handInProgress: true,
    winners:      null,
  };
}

function calcPots(gs) {
  // Build side pots based on each player's total contribution
  const all    = gs.players;
  const levels = [...new Set(all.filter(p => p.totalBet > 0).map(p => p.totalBet))].sort((a,b)=>a-b);
  if (levels.length === 0) return [{ amount: 0, eligible: [] }];

  const pots = [];
  let prev = 0;
  for (const level of levels) {
    const amount   = all.reduce((s, p) => s + Math.min(p.totalBet, level) - Math.min(p.totalBet, prev), 0);
    const eligible = all.filter(p => !p.folded && p.totalBet >= level).map(p => p.id);
    if (amount > 0) pots.push({ amount, eligible });
    prev = level;
  }
  return pots.length > 0 ? pots : [{ amount: gs.pot, eligible: all.filter(p => !p.folded).map(p => p.id) }];
}

function doShowdown(gs) {
  gs.round          = 'showdown';
  gs.handInProgress = false;

  const remaining = gs.players.filter(p => !p.folded);
  if (remaining.length === 1) {
    remaining[0].chips += gs.pot;
    gs.winners = [{
      playerId: remaining[0].id, name: remaining[0].name,
      amount: gs.pot, handName: 'Uncontested', holeCards: remaining[0].holeCards,
    }];
    return;
  }

  const evaluated = remaining.map(p => ({
    player: p,
    best:   bestHand(p.holeCards, gs.communityCards),
  }));

  const pots    = calcPots(gs);
  const winners = [];

  for (const pot of pots) {
    const elig = evaluated.filter(e => pot.eligible.includes(e.player.id));
    if (!elig.length) continue;

    let topScore = elig[0].best.score;
    for (const e of elig) if (cmpScore(e.best.score, topScore) > 0) topScore = e.best.score;

    const potWinners = elig.filter(e => cmpScore(e.best.score, topScore) === 0);
    // 5% rake (house takes 5% of every pot)
    const raked      = Math.floor(pot.amount * 0.95);
    const share      = Math.floor(raked / potWinners.length);
    const rem        = raked - share * potWinners.length;

    potWinners.forEach((e, i) => {
      const amt = share + (i === 0 ? rem : 0);
      e.player.chips += amt;
      winners.push({
        playerId: e.player.id, name: e.player.name,
        amount: amt, handName: handName(e.best.score), holeCards: e.player.holeCards,
      });
    });
  }

  gs.winners = winners;
}

function advanceRound(gs) {
  const n = gs.players.length;
  // Reset bets
  for (const p of gs.players) p.bet = 0;
  gs.currentBet = 0;
  gs.minRaise   = BB;

  // Find first active player left of dealer
  let first = (gs.dealerIdx + 1) % n;
  for (let i = 0; i < n; i++) {
    if (!gs.players[first].folded && !gs.players[first].allIn) break;
    first = (first + 1) % n;
  }
  gs.currentIdx = first;
  gs.toAct      = gs.players.filter(p => !p.folded && !p.allIn).length;

  if (gs.round === 'preflop') {
    gs.round = 'flop';
    gs.communityCards.push(gs.deck.pop(), gs.deck.pop(), gs.deck.pop());
  } else if (gs.round === 'flop') {
    gs.round = 'turn';
    gs.communityCards.push(gs.deck.pop());
  } else if (gs.round === 'turn') {
    gs.round = 'river';
    gs.communityCards.push(gs.deck.pop());
  } else if (gs.round === 'river') {
    doShowdown(gs);
    return;
  }

  // If ≤1 active player can act, run out the board
  if (gs.toAct <= 1) {
    while (gs.communityCards.length < 5) gs.communityCards.push(gs.deck.pop());
    doShowdown(gs);
  }
}

function processAction(gs, socketId, action) {
  const pidx = gs.players.findIndex(p => p.id === socketId);
  if (pidx !== gs.currentIdx) return { error: 'Not your turn' };

  const player = gs.players[pidx];
  if (player.folded || player.allIn) return { error: 'Cannot act' };

  const toCall = Math.max(0, gs.currentBet - player.bet);

  switch (action.type) {
    case 'fold':
      player.folded = true;
      gs.toAct = Math.max(0, gs.toAct - 1);
      break;

    case 'check':
      if (toCall > 0) return { error: 'Must call or fold' };
      gs.toAct = Math.max(0, gs.toAct - 1);
      break;

    case 'call': {
      const amount = Math.min(toCall, player.chips);
      player.chips   -= amount;
      player.bet     += amount;
      player.totalBet += amount;
      gs.pot         += amount;
      if (player.chips === 0) player.allIn = true;
      gs.toAct = Math.max(0, gs.toAct - 1);
      break;
    }

    case 'raise': {
      // action.totalBet = the total amount this player wants to have bet this round
      const desired   = Math.max(gs.currentBet + gs.minRaise, action.totalBet || 0);
      const extraIn   = Math.min(desired - player.bet, player.chips);
      const newBet    = player.bet + extraIn;
      const raiseSize = newBet - gs.currentBet;

      player.chips    -= extraIn;
      player.bet       = newBet;
      player.totalBet += extraIn;
      gs.pot          += extraIn;
      if (player.chips === 0) player.allIn = true;

      if (raiseSize > 0) {
        gs.currentBet = newBet;
        gs.minRaise   = Math.max(gs.minRaise, raiseSize);
        // Everyone else needs to act again
        gs.toAct = gs.players.filter(p => !p.folded && !p.allIn && p.id !== socketId).length;
      } else {
        // All-in for less than call — treat as call
        gs.toAct = Math.max(0, gs.toAct - 1);
      }
      break;
    }

    default:
      return { error: 'Unknown action' };
  }

  // Check: only 1 player left (everyone else folded)
  const remaining = gs.players.filter(p => !p.folded);
  if (remaining.length === 1) {
    remaining[0].chips += gs.pot;
    gs.winners = [{
      playerId: remaining[0].id, name: remaining[0].name,
      amount: gs.pot, handName: 'Uncontested', holeCards: remaining[0].holeCards,
    }];
    gs.round          = 'showdown';
    gs.handInProgress = false;
    return { ok: true };
  }

  // Check: all active players all-in → run the board
  const activeNonAllIn = gs.players.filter(p => !p.folded && !p.allIn);
  if (activeNonAllIn.length === 0) {
    while (gs.communityCards.length < 5) gs.communityCards.push(gs.deck.pop());
    doShowdown(gs);
    return { ok: true };
  }

  // Move to next active player
  const nextIdx   = findNextActive(gs.players, pidx);
  gs.currentIdx   = nextIdx >= 0 ? nextIdx : pidx;

  // End betting round?
  if (gs.toAct <= 0) advanceRound(gs);

  return { ok: true };
}

// ── Room code generator ───────────────────────────────────────────────────────
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── Register namespace ────────────────────────────────────────────────────────
function register(ns) {
  const rooms = new Map(); // code -> room

  function getRoomList() {
    return [...rooms.values()]
      .filter(r => r.status === 'lobby')
      .map(r => ({
        code:        r.code,
        hostName:    r.players[0]?.name ?? '?',
        playerCount: r.players.length,
        maxPlayers:  MAX_PLAYERS,
        buyIn:       r.buyIn ?? DEFAULT_BUYIN,
      }));
  }

  function pushRoomList() { ns.emit('roomList', getRoomList()); }

  function emitCashOut(socketId, chips) {
    ns.to(socketId).emit('cashOut', { chips });
  }

  function buildState(room, forSocketId) {
    const gs = room.gameState;
    const isShowdown = gs?.round === 'showdown';

    const players = room.players.map(p => {
      const gp = gs?.players.find(gp => gp.id === p.id);
      const showCards = gp && (p.id === forSocketId || (isShowdown && !gp.folded));
      // Compute hand name for showdown display
      let handNameStr = null;
      if (isShowdown && gp && !gp.folded && gs.communityCards?.length >= 3) {
        const best = bestHand(gp.holeCards, gs.communityCards);
        if (best) handNameStr = handName(best.score);
      }
      return {
        id:       p.id,
        name:     p.name,
        chips:    gp?.chips  ?? p.buyIn ?? DEFAULT_BUYIN,
        bet:      gp?.bet    ?? 0,
        totalBet: gp?.totalBet ?? 0,
        folded:   gp?.folded ?? false,
        allIn:    gp?.allIn  ?? false,
        holeCards: showCards ? gp.holeCards : (gp ? [null, null] : null),
        handName: handNameStr,
      };
    });

    return {
      roomCode:       room.code,
      status:         room.status,
      hostId:         room.hostId,
      players,
      communityCards: gs?.communityCards  ?? [],
      pot:            gs?.pot             ?? 0,
      currentBet:     gs?.currentBet      ?? 0,
      minRaise:       gs?.minRaise        ?? BB,
      round:          gs?.round           ?? null,
      currentIdx:     gs?.currentIdx      ?? null,
      dealerIdx:      gs?.dealerIdx       ?? null,
      sbIdx:          gs?.sbIdx           ?? null,
      bbIdx:          gs?.bbIdx           ?? null,
      winners:        isShowdown ? gs?.winners : null,
      handInProgress: gs?.handInProgress  ?? false,
    };
  }

  function broadcastState(room) {
    for (const p of room.players) {
      ns.to(p.id).emit('gameState', buildState(room, p.id));
    }
  }

  // ── Auto-fold disconnected player helper ────────────────────────────────────
  function handleLeave(socketId, roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Cash out the leaving player's current chips (or buy-in refund if still in lobby)
    if (room.gameState) {
      const gp = room.gameState.players.find(p => p.id === socketId);
      if (gp) emitCashOut(socketId, gp.chips);
    } else {
      const rp = room.players.find(p => p.id === socketId);
      if (rp) emitCashOut(socketId, rp.buyIn ?? 0);
    }

    room.players = room.players.filter(p => p.id !== socketId);
    if (room.players.length === 0) { rooms.delete(roomCode); pushRoomList(); return; }
    if (room.hostId === socketId) room.hostId = room.players[0].id;

    // If hand in progress, auto-fold the leaver
    if (room.status === 'playing' && room.gameState) {
      const gs  = room.gameState;
      const gp  = gs.players.find(p => p.id === socketId);
      const idx = gs.players.findIndex(p => p.id === socketId);
      if (gp && !gp.folded) {
        gp.folded = true;
        const remaining = gs.players.filter(p => !p.folded);
        if (remaining.length === 1) {
          remaining[0].chips += gs.pot;
          gs.winners = [{ playerId: remaining[0].id, name: remaining[0].name, amount: gs.pot, handName: 'Opponent Left', holeCards: remaining[0].holeCards }];
          gs.round = 'showdown'; gs.handInProgress = false;
        } else {
          gs.toAct = Math.max(0, gs.toAct - 1);
          if (gs.currentIdx === idx) {
            const next = findNextActive(gs.players, idx);
            gs.currentIdx = next >= 0 ? next : gs.currentIdx;
            if (gs.toAct <= 0) advanceRound(gs);
          }
        }
      }
    }

    broadcastState(room);
    pushRoomList();
  }

  // ── Socket events ─────────────────────────────────────────────────────────
  ns.on('connection', socket => {
    socket.emit('roomList', getRoomList());

    socket.on('createRoom', ({ playerName, buyIn }) => {
      try {
        const name   = (playerName || '').trim().slice(0, 16);
        const buyin  = Math.max(100, Math.min(10000, parseInt(buyIn) || DEFAULT_BUYIN));
        if (!name) { socket.emit('error', { message: 'Name required' }); return; }

        let code;
        do { code = genCode(); } while (rooms.has(code));

        const room = {
          code, hostId: socket.id,
          players: [{ id: socket.id, name, buyIn: buyin }],
          buyIn: buyin,
          status: 'lobby', gameState: null, dealerIdx: -1,
        };
        rooms.set(code, room);
        socket.join(`room:${code}`);
        socket.emit('roomCreated', { roomCode: code, playerId: socket.id, buyIn: buyin });
        broadcastState(room);
        pushRoomList();
      } catch (err) {
        console.error('[TexasHoldem] createRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
      try {
        const room = rooms.get(roomCode);
        if (!room)                           { socket.emit('error', { message: 'Room not found' });          return; }
        if (room.status !== 'lobby')         { socket.emit('error', { message: 'Game already started' });    return; }
        if (room.players.length >= MAX_PLAYERS) { socket.emit('error', { message: 'Room full (max 6)' });   return; }

        const name = (playerName || '').trim().slice(0, 16);
        if (!name) { socket.emit('error', { message: 'Name required' }); return; }

        if (room.players.map(p => p.name.toLowerCase()).includes(name.toLowerCase())) {
          socket.emit('error', { message: 'Name taken in this room' }); return;
        }

        room.players.push({ id: socket.id, name, buyIn: room.buyIn });
        socket.join(`room:${roomCode}`);
        socket.emit('roomJoined', { playerId: socket.id, buyIn: room.buyIn });
        broadcastState(room);
        pushRoomList();
      } catch (err) {
        console.error('[TexasHoldem] joinRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('startGame', ({ roomCode }) => {
      try {
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 2) { socket.emit('error', { message: 'Need at least 2 players' }); return; }

        room.status = 'playing';
        initHand(room);
        broadcastState(room);
        pushRoomList();
      } catch (err) {
        console.error('[TexasHoldem] startGame error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('playerAction', ({ roomCode, action }) => {
      try {
        const room = rooms.get(roomCode);
        if (!room || !room.gameState || !room.gameState.handInProgress) return;
        const result = processAction(room.gameState, socket.id, action);
        if (result.error) { socket.emit('error', { message: result.error }); return; }
        broadcastState(room);
      } catch (err) {
        console.error('[TexasHoldem] playerAction error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('nextHand', ({ roomCode }) => {
      try {
        const room = rooms.get(roomCode);
        if (!room || room.status !== 'playing') return;
        if (room.gameState?.handInProgress) return;
        // Any remaining player can trigger next hand (not just host)

        // Remove busted players and cash them out (they get 0 back — lost their buy-in)
        if (room.gameState) {
          const busted = room.gameState.players.filter(p => p.chips <= 0);
          for (const p of busted) {
            emitCashOut(p.id, 0);
            ns.to(p.id).emit('bustedOut');
          }
          const active = room.gameState.players.filter(p => p.chips > 0);
          room.players = room.players.filter(p => active.some(a => a.id === p.id));
        }

        if (room.players.length < 2) {
          room.status = 'ended';
          // Cash out all remaining players (the winner gets all their chips)
          if (room.gameState) {
            for (const p of room.gameState.players) {
              if (p.chips > 0) emitCashOut(p.id, p.chips);
            }
          }
          broadcastState(room);
          return;
        }

        initHand(room);
        broadcastState(room);
      } catch (err) {
        console.error('[TexasHoldem] nextHand error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('leaveRoom', ({ roomCode }) => {
      try {
        socket.leave(`room:${roomCode}`);
        handleLeave(socket.id, roomCode);
      } catch (err) {
        console.error('[TexasHoldem] leaveRoom error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('reloadChips', ({ roomCode, amount }) => {
      try {
        const room = rooms.get(roomCode);
        if (!room || !room.gameState) return;
        const amt = Math.max(100, Math.min(100000, Math.floor(Number(amount) || 0)));
        if (amt <= 0) return;
        const gp = room.gameState.players.find(p => p.id === socket.id);
        if (!gp) return;
        gp.chips += amt;
        // Tell the reloading player how much was deducted from casino balance
        socket.emit('chipsReloaded', { amount: amt });
        // Broadcast updated game state to all in room
        broadcastState(room);
      } catch (err) {
        console.error('[TexasHoldem] reloadChips error:', err);
        socket.emit('error', { message: 'Server error — please try again.' });
      }
    });

    socket.on('disconnect', () => {
      try {
        for (const [code, room] of rooms.entries()) {
          if (room.players.some(p => p.id === socket.id)) {
            handleLeave(socket.id, code);
            break;
          }
        }
      } catch (err) {
        console.error('[TexasHoldem] disconnect error:', err);
      }
    });
  });
}

module.exports = { register };
