'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { getPassword, setPassword, generatePassword } = require('./passwordStore');
const { sendPasswordEmail } = require('./email');
const lb = require('./leaderboard');
const us = require('./userStore');
const rp = require('./reportStore');

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
  io.emit('force-logout');
  console.log(`[rotate] New password set: ${newPassword}`);

  try {
    await sendPasswordEmail(newPassword);
    res.json({ ok: true, password: newPassword });
  } catch (err) {
    console.error('[rotate] Email failed:', err.message);
    res.status(500).json({ ok: false, error: 'Email failed', password: newPassword });
  }
});

// ── Account API ───────────────────────────────────────────────────────────────

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

app.post('/api/accounts/register', (req, res) => {
  const { username, password } = req.body || {};
  res.json(us.register(username, password));
});

app.post('/api/accounts/login', (req, res) => {
  const { username, password } = req.body || {};
  res.json(us.login(username, password));
});

app.post('/api/accounts/logout', (req, res) => {
  res.json(us.logout(getToken(req)));
});

app.get('/api/accounts/me', (req, res) => {
  res.json(us.getMe(getToken(req)));
});

app.post('/api/accounts/balance/sync', (req, res) => {
  const { balance } = req.body || {};
  res.json(us.syncBalance(getToken(req), balance));
});

app.post('/api/accounts/daily', (req, res) => {
  res.json(us.claimDaily(getToken(req)));
});

app.post('/api/accounts/transfer', (req, res) => {
  const { toUsername, amount } = req.body || {};
  res.json(us.transfer(getToken(req), toUsername, amount));
});

app.get('/api/accounts/exists/:username', (req, res) => {
  res.json({ exists: us.userExists(req.params.username) });
});

// ── Casino Rich List (public) ─────────────────────────────────────────────────
app.get('/api/casino-leaderboard', (req, res) => {
  res.json({ ok: true, players: us.getTopBalances(20) });
});

// ── Leaderboard API ──────────────────────────────────────────────────────────

app.get('/api/leaderboard/:gameId', (req, res) => {
  res.json(lb.getLeaderboard(req.params.gameId));
});

// Check if score qualifies + get rank
app.get('/api/leaderboard/:gameId/check', (req, res) => {
  const score = parseFloat(req.query.score);
  const higherIsBetter = req.query.higherIsBetter !== 'false';
  if (isNaN(score)) return res.status(400).json({ error: 'Invalid score' });
  res.json({
    isHighScore: lb.isHighScore(req.params.gameId, score, higherIsBetter),
    rank: lb.getRank(req.params.gameId, score, higherIsBetter),
  });
});

// Submit a score
app.post('/api/leaderboard/:gameId', (req, res) => {
  const { score, name, higherIsBetter = true } = req.body || {};
  if (typeof score !== 'number' || !name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const clean = name.trim().slice(0, 20);
  if (!clean) return res.status(400).json({ error: 'Empty name' });
  const result = lb.addScore(req.params.gameId, score, clean, higherIsBetter);
  res.json(result);
});

// ── Report API ────────────────────────────────────────────────────────────────

// Anyone can submit a report
app.post('/api/reports', (req, res) => {
  const { gameId, entryName, entryScore, reason } = req.body || {};
  if (!gameId || !entryName) return res.status(400).json({ error: 'Missing fields' });
  res.json(rp.addReport({ gameId, entryName, entryScore, reason }));
});

// ── Admin API ─────────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (!us.isAdminToken(getToken(req))) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// View all reports
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  res.json({ ok: true, reports: rp.getReports() });
});

// Delete a report
app.delete('/api/admin/reports/:id', requireAdmin, (req, res) => {
  rp.deleteReport(req.params.id);
  res.json({ ok: true });
});

// Mark a report as reviewed
app.post('/api/admin/reports/:id/dismiss', requireAdmin, (req, res) => {
  rp.markReviewed(req.params.id);
  res.json({ ok: true });
});

// Remove a leaderboard entry (for handling reports)
app.delete('/api/admin/leaderboard/:gameId/:name', requireAdmin, (req, res) => {
  const { gameId, name } = req.params;
  const board = lb.getLeaderboard(gameId).filter(e => e.name !== decodeURIComponent(name));
  lb.overwriteLeaderboard(gameId, board);
  res.json({ ok: true });
});

// List all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(us.listUsers(getToken(req)));
});

// Delete a user
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  res.json(us.deleteUser(getToken(req), req.params.username));
});

// Give money to a user
app.post('/api/admin/give-money', requireAdmin, (req, res) => {
  const { username, amount } = req.body || {};
  res.json(us.adminGiveMoney(getToken(req), username, amount));
});

// Set a user's balance to an exact value
app.put('/api/admin/users/:username/balance', requireAdmin, (req, res) => {
  const { amount } = req.body || {};
  res.json(us.adminSetBalance(getToken(req), req.params.username, amount));
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
require('./games/texasholdem').register(io.of('/texasholdem'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));
