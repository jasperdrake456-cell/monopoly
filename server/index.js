'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { getPassword, setPassword, generatePassword } = require('./passwordStore');
const { sendPasswordEmail } = require('./email');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ── Auth API ─────────────────────────────────────────────────────────────────

// Client calls this to verify the password
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (password === getPassword()) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

// Scheduled task calls this to rotate the password + trigger email
app.post('/api/rotate-password', async (req, res) => {
  const secret = process.env.ROTATE_SECRET;
  const auth = req.headers['authorization'] || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const newPassword = generatePassword();
  setPassword(newPassword);
  console.log(`[rotate] New password set: ${newPassword}`);

  try {
    await sendPasswordEmail(newPassword);
    res.json({ ok: true, password: newPassword });
  } catch (err) {
    console.error('[rotate] Email failed:', err.message);
    res.status(500).json({ ok: false, error: 'Email failed', password: newPassword });
  }
});

// ── Static client ─────────────────────────────────────────────────────────────

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Game namespaces ───────────────────────────────────────────────────────────

require('./games/monopoly').register(io.of('/monopoly'));
require('./games/chess').register(io.of('/chess'));
require('./games/connect4').register(io.of('/connect4'));
require('./games/checkers').register(io.of('/checkers'));
require('./games/battleship').register(io.of('/battleship'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));
