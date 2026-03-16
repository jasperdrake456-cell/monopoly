'use strict';
const { BOARD, COLOR_GROUPS, RAILROAD_IDS, UTILITY_IDS } = require('./data/board');
const { WORLD_BOARD } = require('./data/worldBoard');
const { COMMUNITY_CHEST, CHANCE, freshDecks } = require('./data/cards');

// Returns the correct board array for the current game
function getBoard(state) {
  return state.boardType === 'world' ? WORLD_BOARD : BOARD;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function roll() {
  return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
}

function addLog(state, msg) {
  state.log = [...state.log.slice(-49), msg];
}

function getPlayer(state, id) {
  return state.players.find(p => p.id === id);
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

function activePlayers(state) {
  return state.players.filter(p => !p.bankrupt);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Does this player own the entire color group?
function hasMonopoly(state, playerId, group) {
  const ids = COLOR_GROUPS[group];
  return ids.every(id => {
    const ps = state.propertyStates[id];
    return ps && ps.owner === playerId && !ps.mortgaged;
  });
}

// How many railroads does this player own?
function ownedRailroads(state, playerId) {
  return RAILROAD_IDS.filter(id => state.propertyStates[id]?.owner === playerId).length;
}

// How many utilities does this player own?
function ownedUtilities(state, playerId) {
  return UTILITY_IDS.filter(id => state.propertyStates[id]?.owner === playerId).length;
}

// Calculate rent for landing on a property/railroad/utility
function calcRent(state, space, landingPlayerId, diceTotal) {
  const ps = state.propertyStates[space.id];
  if (!ps || !ps.owner || ps.mortgaged) return 0;

  if (space.type === 'property') {
    if (ps.houses > 0) {
      return space.rent[ps.houses]; // rent[1..5]
    }
    // no houses — check monopoly
    return hasMonopoly(state, ps.owner, space.group) ? space.rent[0] * 2 : space.rent[0];
  }

  if (space.type === 'railroad') {
    const count = ownedRailroads(state, ps.owner);
    const base = [25, 50, 100, 200];
    return (state.chanceDoubleRent && state.chanceDoubleRent[space.id]) ? base[count - 1] * 2 : base[count - 1];
  }

  if (space.type === 'utility') {
    const count = ownedUtilities(state, ps.owner);
    if (state.chanceUtilityDice) {
      // Chance card: pay 10x the dice roll
      return diceTotal * 10;
    }
    return diceTotal * (count === 1 ? 4 : 10);
  }

  return 0;
}

// Move player forward, handle pass Go
function movePlayer(state, playerId, spaces) {
  const p = getPlayer(state, playerId);
  const from = p.position;
  p.position = (p.position + spaces) % 40;
  if (p.position < from || (from === 0 && spaces > 0)) {
    // Passed or landed on Go
    if (p.position !== 0) {
      p.cash += 200;
      addLog(state, `${p.name} passed Go and collected $200`);
    }
  }
  return p.position;
}

function sendToJail(state, playerId) {
  const p = getPlayer(state, playerId);
  p.position = 10;
  p.jailTurns = 1;
  addLog(state, `${p.name} was sent to Jail!`);
}

// ─── Card execution ───────────────────────────────────────────────────────────

function executeCard(state, playerId, card) {
  const p = getPlayer(state, playerId);
  const ap = activePlayers(state);

  switch (card.action) {
    case 'advance_to': {
      const from = p.position;
      p.position = card.position;
      if (card.position < from && card.position !== 0) {
        p.cash += 200;
        addLog(state, `${p.name} passed Go and collected $200`);
      }
      if (card.position === 0) {
        p.cash += 200;
        addLog(state, `${p.name} advanced to Go and collected $200`);
        // Go just gives $200 — no further land action needed
      } else {
        state.pendingLand = true;
      }
      addLog(state, `${p.name} advanced to ${getBoard(state)[card.position].name}`);
      break;
    }

    case 'advance_nearest_railroad': {
      const railroads = [5, 15, 25, 35];
      let nearest = railroads.reduce((best, rr) => {
        const dist = (rr - p.position + 40) % 40;
        const bDist = (best - p.position + 40) % 40;
        return dist < bDist ? rr : best;
      });
      const from2 = p.position;
      p.position = nearest;
      if (nearest <= from2) {
        p.cash += 200;
        addLog(state, `${p.name} passed Go and collected $200`);
      }
      state.chanceDoubleRent = state.chanceDoubleRent || {};
      state.chanceDoubleRent[nearest] = true;
      addLog(state, `${p.name} advanced to nearest Railroad: ${getBoard(state)[nearest].name}`);
      state.pendingLand = true;
      break;
    }

    case 'advance_nearest_utility': {
      const utils = [12, 28];
      let nearU = utils.reduce((best, u) => {
        const dist = (u - p.position + 40) % 40;
        const bDist = (best - p.position + 40) % 40;
        return dist < bDist ? u : best;
      });
      const from3 = p.position;
      p.position = nearU;
      if (nearU <= from3) {
        p.cash += 200;
        addLog(state, `${p.name} passed Go and collected $200`);
      }
      state.chanceUtilityDice = true;
      addLog(state, `${p.name} advanced to nearest Utility: ${getBoard(state)[nearU].name}`);
      state.pendingLand = true;
      break;
    }

    case 'collect':
      p.cash += card.amount;
      addLog(state, `${p.name} collected $${card.amount}`);
      break;

    case 'pay': {
      const amt = card.amount;
      const paid = Math.min(p.cash, amt);
      p.cash -= paid;
      if (state.freeParkingEnabled) state.freeParking += paid;
      addLog(state, `${p.name} paid $${paid}${paid < amt ? ` (couldn't cover full $${amt})` : ''}`);
      break;
    }

    case 'collect_from_each': {
      const each = card.amount;
      ap.forEach(other => {
        if (other.id !== playerId) {
          const transfer = Math.min(other.cash, each);
          other.cash -= transfer;
          p.cash += transfer;
        }
      });
      addLog(state, `${p.name} collected $${each} from each player`);
      break;
    }

    case 'pay_each': {
      const each2 = card.amount;
      ap.forEach(other => {
        if (other.id !== playerId) {
          const transfer = Math.min(p.cash, each2);
          p.cash -= transfer;
          other.cash += transfer;
        }
      });
      addLog(state, `${p.name} paid $${each2} to each player`);
      break;
    }

    case 'go_to_jail':
      sendToJail(state, playerId);
      break;

    case 'get_out_of_jail':
      p.getOutOfJailCards += 1;
      addLog(state, `${p.name} received a Get Out of Jail Free card`);
      break;

    case 'repairs': {
      let total = 0;
      p.properties.forEach(propId => {
        const ps = state.propertyStates[propId];
        if (ps) {
          if (ps.houses === 5) total += card.hotelCost;
          else total += ps.houses * card.houseCost;
        }
      });
      const repairPaid = Math.min(p.cash, total);
      p.cash -= repairPaid;
      if (state.freeParkingEnabled) state.freeParking += repairPaid;
      addLog(state, `${p.name} paid $${repairPaid} for repairs`);
      break;
    }

    case 'go_back': {
      p.position = (p.position - card.spaces + 40) % 40;
      addLog(state, `${p.name} went back ${card.spaces} spaces to ${getBoard(state)[p.position].name}`);
      state.pendingLand = true;
      break;
    }
  }
}

// ─── Land on space ────────────────────────────────────────────────────────────

function landOnSpace(state, playerId) {
  const p = getPlayer(state, playerId);
  const space = getBoard(state)[p.position];
  state.chanceDoubleRent = {};
  state.chanceUtilityDice = false;

  switch (space.type) {
    case 'go':
      p.cash += 200;
      addLog(state, `${p.name} landed on Go and collected $200`);
      state.turnPhase = 'end';
      break;

    case 'property':
    case 'railroad':
    case 'utility': {
      const ps = state.propertyStates[space.id];
      if (!ps.owner) {
        // Unowned — offer to buy
        state.turnPhase = 'buy_decision';
        addLog(state, `${p.name} landed on ${space.name} (unowned, price: $${space.price})`);
      } else if (ps.owner === playerId) {
        addLog(state, `${p.name} landed on their own ${space.name}`);
        state.turnPhase = 'end';
      } else if (ps.mortgaged) {
        addLog(state, `${p.name} landed on ${space.name} (mortgaged — no rent)`);
        state.turnPhase = 'end';
      } else {
        // Pay rent
        const owner = getPlayer(state, ps.owner);
        const diceTotal = (state.lastDice || [0, 0]).reduce((a, b) => a + b, 0);
        const rent = calcRent(state, space, playerId, diceTotal);
        if (p.cash >= rent) {
          // Full payment
          p.cash -= rent;
          owner.cash += rent;
          addLog(state, `${p.name} paid $${rent} rent to ${owner.name} for ${space.name}`);
        } else {
          // Can't afford — partial payment, track missed rent
          const partial = p.cash;
          p.cash = 0;
          owner.cash += partial;
          p.missedRentCount = (p.missedRentCount || 0) + 1;
          addLog(state, `${p.name} couldn't afford $${rent} rent — paid $${partial} (missed rent ${p.missedRentCount}/3)`);
          if (p.missedRentCount >= 3) {
            addLog(state, `${p.name} has missed rent 3 times and is bankrupt!`);
            declareBankruptcy(state, playerId, ps.owner);
          }
        }
        state.turnPhase = 'end';
      }
      break;
    }

    case 'tax': {
      const tax = space.amount;
      const taxPaid = Math.min(p.cash, tax);
      p.cash -= taxPaid;
      if (state.freeParkingEnabled) state.freeParking += taxPaid;
      addLog(state, `${p.name} paid $${taxPaid} in taxes`);
      state.turnPhase = 'end';
      break;
    }

    case 'go_to_jail':
      sendToJail(state, playerId);
      state.turnPhase = 'end';
      break;

    case 'jail':
      addLog(state, `${p.name} is Just Visiting Jail`);
      state.turnPhase = 'end';
      break;

    case 'free_parking':
      if (state.freeParkingEnabled && state.freeParking > 0) {
        p.cash += state.freeParking;
        addLog(state, `${p.name} collected $${state.freeParking} from Free Parking!`);
        state.freeParking = 500;
      } else {
        addLog(state, `${p.name} landed on Free Parking`);
      }
      state.turnPhase = 'end';
      break;

    case 'community_chest': {
      const idx = state.communityDeck[state.communityIdx % state.communityDeck.length];
      state.communityIdx++;
      const card = COMMUNITY_CHEST[idx];
      state.activeCard = { deck: 'community', cardData: card };
      addLog(state, `${p.name} drew Community Chest: ${card.text}`);
      state.turnPhase = 'card_action';
      break;
    }

    case 'chance': {
      const idx = state.chanceDeck[state.chanceIdx % state.chanceDeck.length];
      state.chanceIdx++;
      const card = CHANCE[idx];
      state.activeCard = { deck: 'chance', cardData: card };
      addLog(state, `${p.name} drew Chance: ${card.text}`);
      state.turnPhase = 'card_action';
      break;
    }

    default:
      state.turnPhase = 'end';
  }
}

// ─── Bankruptcy ───────────────────────────────────────────────────────────────

function checkBankruptcy(state, playerId, creditorId) {
  const p = getPlayer(state, playerId);
  if (p.cash < 0) {
    // Auto-bankrupt if truly unable to pay even mortgaging everything
    const mortgageable = p.properties.filter(id => !state.propertyStates[id].mortgaged && state.propertyStates[id].houses === 0);
    if (mortgageable.length === 0 && p.getOutOfJailCards === 0) {
      declareBankruptcy(state, playerId, creditorId);
    }
    // Otherwise player must manage their assets manually
  }
}

function declareBankruptcy(state, playerId, creditorId) {
  const p = getPlayer(state, playerId);
  p.bankrupt = true;

  const creditor = creditorId ? getPlayer(state, creditorId) : null;

  // Transfer assets
  p.properties.forEach(propId => {
    const ps = state.propertyStates[propId];
    if (creditor) {
      ps.owner = creditorId;
      creditor.properties.push(propId);
    } else {
      // Return to bank
      ps.owner = null;
      ps.houses = 0;
      ps.mortgaged = false;
    }
  });
  p.properties = [];

  if (creditor) {
    creditor.cash += p.cash;
  }
  p.cash = 0;

  addLog(state, `${p.name} has gone bankrupt!`);

  // Check win condition
  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    state.winner = remaining[0].id;
    state.status = 'ended';
    addLog(state, `${remaining[0].name} wins the game!`);
  }
}

// ─── Public actions ───────────────────────────────────────────────────────────

function initGame(players, freeParkingEnabled, boardType) {
  const decks = freshDecks();
  const bt = boardType === 'world' ? 'world' : 'classic';
  const boardData = bt === 'world' ? WORLD_BOARD : BOARD;

  // Build property states
  const propertyStates = {};
  boardData.forEach(space => {
    if (['property', 'railroad', 'utility'].includes(space.type)) {
      propertyStates[space.id] = { owner: null, houses: 0, mortgaged: false };
    }
  });

  return {
    status: 'playing',
    boardType: bt,
    freeParkingEnabled: !!freeParkingEnabled,
    players: players.map(p => ({
      ...p,
      position: 0,
      cash: 1500,
      properties: [],
      jailTurns: 0,
      getOutOfJailCards: 0,
      bankrupt: false,
      missedRentCount: 0,
    })),
    propertyStates,
    currentPlayerIndex: 0,
    turnPhase: 'roll',
    lastDice: null,
    doublesCount: 0,
    chanceDeck: decks.chance,
    chanceIdx: 0,
    communityDeck: decks.community,
    communityIdx: 0,
    activeCard: null,
    freeParking: 500,
    auction: null,
    activeTrade: null,
    pendingLand: false,
    chanceDoubleRent: {},
    chanceUtilityDice: false,
    log: ['Game started! Good luck!'],
    winner: null,
  };
}

function doRollDice(state, playerId) {
  if (state.turnPhase !== 'roll') return { error: 'Not time to roll' };
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };

  const dice = roll();
  const doubles = dice[0] === dice[1];
  state.lastDice = dice;
  const total = dice[0] + dice[1];

  addLog(state, `${cp.name} rolled ${dice[0]} + ${dice[1]} = ${total}${doubles ? ' (doubles!)' : ''}`);

  if (cp.jailTurns > 0) {
    // In jail
    if (doubles) {
      cp.jailTurns = 0;
      addLog(state, `${cp.name} rolled doubles and is free from Jail!`);
      movePlayer(state, playerId, total);
      landOnSpace(state, playerId);
    } else {
      cp.jailTurns++;
      if (cp.jailTurns > 3) {
        // Must pay fine
        cp.cash -= 50;
        cp.jailTurns = 0;
        addLog(state, `${cp.name} paid $50 fine to leave Jail`);
        movePlayer(state, playerId, total);
        landOnSpace(state, playerId);
      } else {
        addLog(state, `${cp.name} stays in Jail (turn ${cp.jailTurns - 1}/3)`);
        state.turnPhase = 'end';
      }
    }
    return { dice, doubles };
  }

  if (doubles) {
    state.doublesCount++;
    if (state.doublesCount >= 3) {
      sendToJail(state, playerId);
      state.turnPhase = 'end';
      state.doublesCount = 0;
      return { dice, doubles };
    }
  } else {
    state.doublesCount = 0;
  }

  movePlayer(state, playerId, total);
  landOnSpace(state, playerId);
  return { dice, doubles };
}

function doBuyProperty(state, playerId) {
  if (state.turnPhase !== 'buy_decision') return { error: 'Not time to buy' };
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };

  const space = getBoard(state)[cp.position];
  if (cp.cash < space.price) return { error: 'Not enough money' };

  cp.cash -= space.price;
  cp.properties.push(space.id);
  state.propertyStates[space.id].owner = playerId;
  addLog(state, `${cp.name} bought ${space.name} for $${space.price}`);
  state.turnPhase = 'end';
  return {};
}

function doPassProperty(state, playerId) {
  if (state.turnPhase !== 'buy_decision') return { error: 'Not time to decide' };
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };

  // No auction — just skip buying and end the turn
  const space = getBoard(state)[cp.position];
  addLog(state, `${cp.name} declined to buy ${space.name}`);
  state.turnPhase = 'end';
  return {};
}

function doResolveCard(state, playerId) {
  if (state.turnPhase !== 'card_action') return { error: 'No card to resolve' };
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };

  const card = state.activeCard.cardData;
  executeCard(state, playerId, card);
  state.activeCard = null;

  if (state.pendingLand) {
    state.pendingLand = false;
    landOnSpace(state, playerId);
  } else {
    if (state.turnPhase === 'card_action') {
      state.turnPhase = 'end';
    }
  }
  return {};
}

function doEndTurn(state, playerId) {
  if (state.turnPhase !== 'end') return { error: 'Not ready to end turn' };
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };

  // If doubles and not in jail, roll again
  if (state.doublesCount > 0 && cp.jailTurns === 0) {
    state.turnPhase = 'roll';
    addLog(state, `${cp.name} rolled doubles — roll again!`);
    return { rollAgain: true };
  }

  state.doublesCount = 0;
  advanceTurn(state);
  return {};
}

function advanceTurn(state) {
  const ap = activePlayers(state);
  let idx = state.currentPlayerIndex;
  do {
    idx = (idx + 1) % state.players.length;
  } while (state.players[idx].bankrupt);
  state.currentPlayerIndex = idx;
  state.turnPhase = 'roll';
  state.lastDice = null;
  addLog(state, `It's now ${state.players[idx].name}'s turn`);
}

function doPayJailFine(state, playerId) {
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };
  if (cp.jailTurns === 0) return { error: 'Not in jail' };
  if (state.turnPhase !== 'roll') return { error: 'Wrong phase' };
  if (cp.cash < 50) return { error: 'Not enough money' };

  cp.cash -= 50;
  cp.jailTurns = 0;
  addLog(state, `${cp.name} paid $50 to get out of Jail`);
  return {};
}

function doUseJailCard(state, playerId) {
  const cp = currentPlayer(state);
  if (cp.id !== playerId) return { error: 'Not your turn' };
  if (cp.jailTurns === 0) return { error: 'Not in jail' };
  if (cp.getOutOfJailCards === 0) return { error: 'No Get Out of Jail Free card' };
  if (state.turnPhase !== 'roll') return { error: 'Wrong phase' };

  cp.getOutOfJailCards--;
  cp.jailTurns = 0;
  addLog(state, `${cp.name} used a Get Out of Jail Free card`);
  return {};
}

function doBuyBuilding(state, playerId, propertyId, count) {
  const p = getPlayer(state, playerId);
  if (!p.properties.includes(propertyId)) return { error: 'You do not own this property' };
  const space = getBoard(state)[propertyId];
  if (!space || space.type !== 'property') return { error: 'Not a buildable property' };
  if (!hasMonopoly(state, playerId, space.group)) return { error: 'You need the full color group' };

  const ps = state.propertyStates[propertyId];
  if (ps.mortgaged) return { error: 'Property is mortgaged' };
  if (ps.houses + count > 5) return { error: 'Cannot exceed 5 (hotel)' };

  // Even building rule
  const groupIds = COLOR_GROUPS[space.group];
  const minHouses = Math.min(...groupIds.map(id => state.propertyStates[id].houses));
  if (ps.houses > minHouses) return { error: 'Must build evenly across color group' };

  const cost = space.houseCost * count;
  if (p.cash < cost) return { error: 'Not enough money' };

  p.cash -= cost;
  ps.houses += count;
  const label = ps.houses === 5 ? 'hotel' : `${ps.houses} house(s)`;
  addLog(state, `${p.name} built on ${space.name} (now ${label})`);
  return {};
}

function doSellBuilding(state, playerId, propertyId, count) {
  const p = getPlayer(state, playerId);
  if (!p.properties.includes(propertyId)) return { error: 'You do not own this property' };
  const space = getBoard(state)[propertyId];
  if (!space || space.type !== 'property') return { error: 'Not a buildable property' };

  const ps = state.propertyStates[propertyId];
  if (ps.houses < count) return { error: 'Not enough buildings to sell' };

  // Even selling rule
  const groupIds = COLOR_GROUPS[space.group];
  const maxHouses = Math.max(...groupIds.map(id => state.propertyStates[id].houses));
  if (ps.houses < maxHouses) return { error: 'Must sell evenly across color group' };

  const sellPrice = Math.floor(space.houseCost / 2) * count;
  p.cash += sellPrice;
  ps.houses -= count;
  addLog(state, `${p.name} sold building(s) on ${space.name} for $${sellPrice}`);
  return {};
}

function doMortgage(state, playerId, propertyId) {
  const p = getPlayer(state, playerId);
  if (!p.properties.includes(propertyId)) return { error: 'You do not own this property' };
  const ps = state.propertyStates[propertyId];
  if (ps.mortgaged) return { error: 'Already mortgaged' };
  if (ps.houses > 0) return { error: 'Sell buildings first' };

  const space = getBoard(state)[propertyId];
  p.cash += space.mortgageValue;
  ps.mortgaged = true;
  addLog(state, `${p.name} mortgaged ${space.name} for $${space.mortgageValue}`);
  return {};
}

function doUnmortgage(state, playerId, propertyId) {
  const p = getPlayer(state, playerId);
  if (!p.properties.includes(propertyId)) return { error: 'You do not own this property' };
  const ps = state.propertyStates[propertyId];
  if (!ps.mortgaged) return { error: 'Not mortgaged' };

  const space = getBoard(state)[propertyId];
  const cost = Math.floor(space.mortgageValue * 1.1);
  if (p.cash < cost) return { error: 'Not enough money' };

  p.cash -= cost;
  ps.mortgaged = false;
  addLog(state, `${p.name} unmortgaged ${space.name} for $${cost}`);
  return {};
}

function doProposeTrade(state, fromId, toId, offer, request) {
  if (state.activeTrade) return { error: 'A trade is already in progress' };
  const from = getPlayer(state, fromId);
  const to = getPlayer(state, toId);
  if (!from || !to) return { error: 'Invalid players' };

  // Validate offer
  for (const propId of offer.properties) {
    if (!from.properties.includes(propId)) return { error: 'You do not own offered property ' + propId };
  }
  if (offer.cash > from.cash) return { error: 'Not enough cash to offer' };
  const offerCards = Math.max(0, parseInt(offer.jailCards) || 0);
  if (offerCards > from.getOutOfJailCards) return { error: 'Not enough Get Out of Jail Free cards to offer' };

  // Validate request
  for (const propId of request.properties) {
    if (!to.properties.includes(propId)) return { error: 'Target does not own requested property ' + propId };
  }
  const requestCards = Math.max(0, parseInt(request.jailCards) || 0);
  if (requestCards > to.getOutOfJailCards) return { error: 'Target does not have enough Get Out of Jail Free cards' };

  state.activeTrade = { fromId, toId, offer: { ...offer, jailCards: offerCards }, request: { ...request, jailCards: requestCards } };
  addLog(state, `${from.name} proposed a trade to ${to.name}`);
  return {};
}

function doRespondTrade(state, playerId, accepted) {
  if (!state.activeTrade) return { error: 'No active trade' };
  const trade = state.activeTrade;
  if (trade.toId !== playerId) return { error: 'Not the trade recipient' };

  const from = getPlayer(state, trade.fromId);
  const to = getPlayer(state, trade.toId);

  if (!accepted) {
    addLog(state, `${to.name} rejected the trade from ${from.name}`);
    state.activeTrade = null;
    return {};
  }

  // Re-validate
  for (const propId of trade.offer.properties) {
    if (!from.properties.includes(propId)) { state.activeTrade = null; return { error: 'Trade invalid' }; }
  }
  for (const propId of trade.request.properties) {
    if (!to.properties.includes(propId)) { state.activeTrade = null; return { error: 'Trade invalid' }; }
  }
  if (trade.offer.cash > from.cash) { state.activeTrade = null; return { error: 'Trade invalid' }; }
  if (trade.request.cash > to.cash) { state.activeTrade = null; return { error: 'Trade invalid' }; }
  const offerCards = trade.offer.jailCards || 0;
  const requestCards = trade.request.jailCards || 0;
  if (offerCards > from.getOutOfJailCards) { state.activeTrade = null; return { error: 'Trade invalid' }; }
  if (requestCards > to.getOutOfJailCards) { state.activeTrade = null; return { error: 'Trade invalid' }; }

  // Execute trade
  trade.offer.properties.forEach(propId => {
    from.properties = from.properties.filter(id => id !== propId);
    to.properties.push(propId);
    state.propertyStates[propId].owner = to.id;
  });
  trade.request.properties.forEach(propId => {
    to.properties = to.properties.filter(id => id !== propId);
    from.properties.push(propId);
    state.propertyStates[propId].owner = from.id;
  });
  from.cash -= trade.offer.cash;
  from.cash += trade.request.cash;
  to.cash -= trade.request.cash;
  to.cash += trade.offer.cash;
  // Transfer jail-free cards
  from.getOutOfJailCards -= offerCards;
  to.getOutOfJailCards   += offerCards;
  to.getOutOfJailCards   -= requestCards;
  from.getOutOfJailCards += requestCards;

  addLog(state, `${from.name} and ${to.name} completed a trade`);
  state.activeTrade = null;
  return {};
}

function doCancelTrade(state, playerId) {
  if (!state.activeTrade) return { error: 'No active trade' };
  if (state.activeTrade.fromId !== playerId) return { error: 'Only proposer can cancel' };
  state.activeTrade = null;
  return {};
}

function doDeclareBankruptcy(state, playerId) {
  const p = getPlayer(state, playerId);
  if (!p) return { error: 'Player not found' };
  declareBankruptcy(state, playerId, null);
  if (state.status !== 'ended') advanceTurn(state);
  return {};
}

function doRestartGame(state, players, freeParkingEnabled) {
  return initGame(players, freeParkingEnabled);
}

module.exports = {
  initGame,
  doRollDice,
  doBuyProperty,
  doPassProperty,
  doResolveCard,
  doEndTurn,
  doPayJailFine,
  doUseJailCard,
  doBuyBuilding,
  doSellBuilding,
  doMortgage,
  doUnmortgage,
  doProposeTrade,
  doRespondTrade,
  doCancelTrade,
  doDeclareBankruptcy,
  doRestartGame,
};
