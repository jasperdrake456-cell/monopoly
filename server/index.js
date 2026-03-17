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
const bn = require('./banStore');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ── IP ban middleware ──────────────────────────────────────────────────────────
function getClientIP(req) {
  // x-forwarded-for: "client, proxy1, proxy2" — take the leftmost (real client) entry
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    if (ip) return ip;
  }
  // Some reverse proxies use x-real-ip
  const realIP = req.headers['x-real-ip'];
  if (realIP) return realIP.trim();
  return req.socket?.remoteAddress || 'unknown';
}

app.use((req, res, next) => {
  // Skip static file serving and non-API routes
  if (!req.path.startsWith('/api/')) return next();
  // Admin and auth routes are always allowed (so admin can unban)
  if (req.path.startsWith('/api/admin/') || req.path === '/api/auth') return next();
  const ip = getClientIP(req);
  if (bn.isIPBanned(ip)) {
    const ban = bn.getIPBan(ip);
    return res.status(403).json({
      ok: false,
      error: 'Your IP has been banned.',
      reason: ban?.reason || '',
      expiresAt: ban?.expiresAt || null,
    });
  }
  next();
});

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
  const ip = getClientIP(req);

  // Check registration log + account store — block if at/over limit
  const ipCheck = us.checkIPAccountLimit(ip, 3);
  if (ipCheck.blocked) {
    const msg = ipCheck.reason === 'unknown_ip'
      ? 'Unable to verify your connection. Please try again or contact support.'
      : `Too many accounts from this device (${ipCheck.count}/3). Maximum 3 accounts per IP address.`;
    console.log(`[register] BLOCKED IP ${ip}: ${msg}`);
    return res.status(429).json({ ok: false, error: msg });
  }

  // Pass IP so it's stored as registerIP (permanent) at creation time
  const result = us.register(username, password, ip);
  if (result.ok) {
    // Write to the permanent registration log so this IP is counted
    // even if the account is later deleted
    us.logRegistration(ip, result.username);
    us.recordIP(result.username, ip);
    console.log(`[register] New account "${result.username}" from IP ${ip} (now ${(ipCheck.count || 0) + 1}/3 for this IP)`);
  }
  res.json(result);
});

app.post('/api/accounts/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = us.login(username, password);
  if (result.ok) us.recordIP(result.username, getClientIP(req));
  res.json(result);
});

app.post('/api/accounts/logout', (req, res) => {
  res.json(us.logout(getToken(req)));
});

app.get('/api/accounts/me', (req, res) => {
  const result = us.getMe(getToken(req));
  if (result.ok) us.recordIP(result.username, getClientIP(req));
  res.json(result);
});

app.post('/api/accounts/balance/sync', (req, res) => {
  const { balance } = req.body || {};
  const token = getToken(req);
  const result = us.syncBalance(token, balance);
  if (result.ok) {
    const me = us.getMe(token);
    if (me.ok) us.recordIP(me.username, getClientIP(req));
  }
  res.json(result);
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

// ── Ban check (called by client on game load) ─────────────────────────────────
app.get('/api/ban-check', (req, res) => {
  const token    = getToken(req);
  const gameSlug = req.query.game || '';
  const me       = us.getMe(token);
  if (!me.ok) return res.json({ banned: false });
  const ban = bn.getUserBan(me.username);
  if (!ban) return res.json({ banned: false });
  const bannedFromThis = ban.games.includes('*') || ban.games.includes(gameSlug);
  res.json({
    banned: bannedFromThis,
    reason: ban.reason || '',
    games: ban.games,
    expiresAt: ban.expiresAt || null,
  });
});

// ── Live game activity tracking ───────────────────────────────────────────────
// token → { username, gameSlug, lastSeen }
const gameActivity = new Map();
const ACTIVITY_TTL_MS = 90_000; // treat as offline after 90 seconds of no heartbeat

// token → pending bonus chips to deliver on next heartbeat
const pendingBonuses = new Map();

// Every 5 minutes: give all active online players $5,000
setInterval(() => {
  const now = Date.now();
  let count = 0;
  for (const [token, data] of gameActivity) {
    if (now - data.lastSeen > ACTIVITY_TTL_MS) continue;
    us.addBonus(data.username, 5000);
    pendingBonuses.set(token, (pendingBonuses.get(token) || 0) + 5000);
    count++;
  }
  if (count > 0) console.log(`[Bonus] Gave $5,000 to ${count} online player(s)`);
}, 5 * 60 * 1000);

// Game reports current activity (or null to clear)
app.post('/api/accounts/activity', (req, res) => {
  const token = getToken(req);
  const me    = us.getMe(token);
  if (!me.ok) return res.json({ ok: false });
  const { gameSlug } = req.body || {};
  if (!gameSlug) {
    gameActivity.delete(token);
    pendingBonuses.delete(token);
  } else {
    gameActivity.set(token, { username: me.username, gameSlug, lastSeen: Date.now() });
  }
  // Deliver any pending bonus chips to the client
  const bonus = pendingBonuses.get(token) || 0;
  if (bonus > 0) pendingBonuses.delete(token);
  res.json({ ok: true, bonus });
});

// Admin: get all currently active users and what they're playing
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const now    = Date.now();
  const active = [];
  for (const [token, data] of gameActivity) {
    if (now - data.lastSeen > ACTIVITY_TTL_MS) { gameActivity.delete(token); continue; }
    active.push({ username: data.username, gameSlug: data.gameSlug, lastSeen: data.lastSeen });
  }
  res.json({ ok: true, activity: active });
});

// ── Casino Rich List (public) ─────────────────────────────────────────────────
app.get('/api/casino-leaderboard', (req, res) => {
  res.json(us.getTopBalances(20));
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

// Kick a user (destroy all their sessions — forces logout)
app.post('/api/admin/kick/:username', requireAdmin, (req, res) => {
  res.json(us.kickUser(getToken(req), req.params.username));
});

// ── Ban admin API ──────────────────────────────────────────────────────────────

// List all IP bans
app.get('/api/admin/bans/ips', requireAdmin, (req, res) => {
  res.json({ ok: true, bans: bn.listIPBans() });
});

// Ban an IP
app.post('/api/admin/bans/ip', requireAdmin, (req, res) => {
  const { ip, reason = '', durationMs = null } = req.body || {};
  if (!ip) return res.status(400).json({ ok: false, error: 'IP required' });
  bn.banIP(ip, reason, durationMs);
  res.json({ ok: true });
});

// Unban an IP
app.delete('/api/admin/bans/ip/:ip', requireAdmin, (req, res) => {
  bn.unbanIP(decodeURIComponent(req.params.ip));
  res.json({ ok: true });
});

// List all user game bans
app.get('/api/admin/bans/users', requireAdmin, (req, res) => {
  res.json({ ok: true, bans: bn.listUserBans() });
});

// Ban a user from game(s)
app.post('/api/admin/bans/user', requireAdmin, (req, res) => {
  const { username, games = ['*'], reason = '', durationMs = null } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Username required' });
  bn.banUser(username.trim().toLowerCase(), games, reason, durationMs);
  res.json({ ok: true });
});

// Unban a user
app.delete('/api/admin/bans/user/:username', requireAdmin, (req, res) => {
  bn.unbanUser(decodeURIComponent(req.params.username));
  res.json({ ok: true });
});

// Get the current IP of a request (so admin can look up IPs)
app.get('/api/admin/bans/lookup-ip', requireAdmin, (req, res) => {
  // Returns IP from query param user's last known IP — simplified: just shows IP of this request
  res.json({ ok: true, yourIP: getClientIP(req) });
});

// Set a custom account limit for an IP (admin: allow extra accounts)
app.put('/api/admin/ip-limit', requireAdmin, (req, res) => {
  const { ip, limit } = req.body || {};
  if (!ip) return res.status(400).json({ ok: false, error: 'IP required' });
  const n = parseInt(limit, 10);
  if (isNaN(n) || n < 1) return res.status(400).json({ ok: false, error: 'Invalid limit' });
  us.setIPLimit(ip, n);
  res.json({ ok: true, ip, limit: n });
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
