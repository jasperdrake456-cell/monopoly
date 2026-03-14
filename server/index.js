'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Serve built client in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Register each game on its own namespace
require('./games/monopoly').register(io.of('/monopoly'));
require('./games/chess').register(io.of('/chess'));
require('./games/connect4').register(io.of('/connect4'));
require('./games/checkers').register(io.of('/checkers'));
require('./games/battleship').register(io.of('/battleship'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));
