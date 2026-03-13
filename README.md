# Monopoly — Real-time Multiplayer

A fully playable, real-time multiplayer Monopoly game built with React + Vite (frontend) and Node.js + Express + Socket.io (backend).

## Quick Start

### Prerequisites

- **Node.js 18+** — https://nodejs.org (or install via `nvm`)

### 1. Install dependencies

```bash
# From the project root
cd /path/to/monopoly

# Install server deps
cd server && npm install && cd ..

# Install client deps
cd client && npm install && cd ..

# Or install the root concurrently helper
npm install
```

### 2. Development (two terminals)

**Terminal 1 — Server:**
```bash
cd server
npm run dev        # starts on http://localhost:3001
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev        # starts on http://localhost:5173
```

Open http://localhost:5173 in your browser.

### 3. Production build

```bash
cd client && npm run build   # outputs to client/dist/
cd ../server && npm start    # serves both API and static files on :3001
```

Then share your server's URL (e.g. `http://your-server-ip:3001`) with friends.

---

## How to Play

1. **Host** clicks **Create Room**, picks a name and token, optionally enables the Free Parking jackpot house rule, then clicks **Create Room**
2. **Friends** click **Join Room** and enter the 6-character code
3. Once everyone is in, the host clicks **Start Game**
4. On your turn: click **Roll Dice**, then respond to whatever you land on
5. Use the **Trade** button anytime to propose trades with other players
6. Build houses/hotels and manage mortgages from the left sidebar property list
7. Last player solvent wins!

---

## Features

- 2–6 players with 6 tokens (car, hat, dog, iron, ship, wheelbarrow)
- Full 40-space Monopoly board rendered in the browser
- Complete ruleset: rent, monopolies, buildings, mortgage/unmortgage
- Community Chest (16 cards) & Chance (16 cards) with all standard actions
- Railroad rent (×1–4 per owned railroad), Utility rent (4× or 10× dice)
- Jail: roll doubles to escape, pay $50 fine, or use Get Out of Jail Free card
- Auctions when a player declines to buy
- Trade modal: offer/request properties and cash
- Bankruptcy → assets transfer to creditor or return to bank
- Free Parking jackpot house rule (toggle in lobby)
- Reconnect: refreshing the page rejoins your session automatically
- Real-time sync via Socket.io — all state is authoritative on the server

---

## Deployment (Railway / Render / VPS)

1. `cd client && npm run build`
2. Push the entire project (with `client/dist/`) to your server
3. `cd server && npm install --production && npm start`
4. Set `PORT` environment variable if needed (defaults to 3001)

The Express server serves the built React app at `/` and the Socket.io API at `/socket.io`.

---

## Project Structure

```
monopoly/
├── server/
│   ├── index.js          Express + Socket.io entry point
│   ├── gameLogic.js      All Monopoly rules & state mutations
│   ├── roomManager.js    Room create/join/reconnect
│   └── data/
│       ├── board.js      40-space board definition
│       └── cards.js      Community Chest & Chance decks
└── client/
    ├── index.html
    └── src/
        ├── App.jsx           Root component, socket wiring
        ├── boardData.js      Board data + grid helpers (client copy)
        ├── hooks/
        │   └── useSocket.js  Socket.io React hook
        └── components/
            ├── Lobby.jsx     Create/join/waiting room
            ├── Game.jsx      Main game layout
            ├── Board.jsx     11×11 CSS Grid board
            ├── Tile.jsx      Individual board tile
            ├── Dashboard.jsx Player info + property management
            ├── ActionPanel.jsx  Turn actions (roll, buy, auction…)
            ├── Dice.jsx      Animated dice
            ├── TradeModal.jsx   Trade proposal UI
            └── EventLog.jsx  Scrolling game log
```
