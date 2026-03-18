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
const wl = require('./winLog');
const sc  = require('./siteConfig');
const chatStore = require('./chat/chatStore');
const chatNs    = require('./chat/chatNamespace');
const al        = require('./adminLog');

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
  const result = us.register(username, password, ip);
  if (result.ok) {
    us.recordIP(result.username, ip);
    console.log(`[register] New account "${result.username}" from IP ${ip}`);
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

// Prune zero-balance accounts on startup and every 5 minutes
(function runPrune() {
  const n = us.pruneZeroBalanceAccounts();
  if (n > 0) console.log(`[prune] Deleted ${n} zero-balance account(s)`);
})();
setInterval(() => {
  const n = us.pruneZeroBalanceAccounts();
  if (n > 0) console.log(`[prune] Deleted ${n} zero-balance account(s)`);
}, 5 * 60 * 1000);

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
  const result = us.deleteUser(getToken(req), req.params.username);
  if (result.ok) al.log('delete_user', { target: req.params.username });
  res.json(result);
});

// Give money to a user
app.post('/api/admin/give-money', requireAdmin, (req, res) => {
  const { username, amount } = req.body || {};
  const result = us.adminGiveMoney(getToken(req), username, amount);
  if (result.ok) al.log('give_money', { target: username, amount });
  res.json(result);
});

// Set a user's balance to an exact value
app.put('/api/admin/users/:username/balance', requireAdmin, (req, res) => {
  const { amount } = req.body || {};
  const result = us.adminSetBalance(getToken(req), req.params.username, amount);
  if (result.ok) al.log('set_balance', { target: req.params.username, amount });
  res.json(result);
});

// Kick a user (destroy all their sessions — forces logout)
app.post('/api/admin/kick/:username', requireAdmin, (req, res) => {
  const result = us.kickUser(getToken(req), req.params.username);
  if (result.ok) al.log('kick_user', { target: req.params.username, sessionsKilled: result.sessionsKilled });
  res.json(result);
});

// ── Big Win Log ────────────────────────────────────────────────────────────────

// Client reports a big win (profit >= $50k) — fire-and-forget, auth required
app.post('/api/accounts/big-win', (req, res) => {
  const token = getToken(req);
  const me = us.getMe(token);
  if (!me.ok) return res.json({ ok: false });
  const { game, bet, payout, profit, multiplier, details } = req.body || {};
  if (!game || bet == null || payout == null) return res.json({ ok: false });
  const realProfit = Math.floor(profit ?? (payout - bet));
  if (realProfit < 50_000) return res.json({ ok: false }); // server-side guard
  wl.logWin({
    username:   me.username,
    game,
    bet:        Math.floor(bet),
    payout:     Math.floor(payout),
    profit:     realProfit,
    multiplier: multiplier ?? null,
    details:    details || '',
    timestamp:  Date.now(),
  });
  console.log(`[winLog] 🏆 ${me.username} won $${realProfit.toLocaleString()} on ${game}`);
  res.json({ ok: true });
});

// Admin: view all big wins
app.get('/api/admin/wins', requireAdmin, (req, res) => {
  res.json({ ok: true, wins: wl.getWins() });
});

// Admin: clear the win log
app.delete('/api/admin/wins', requireAdmin, (req, res) => {
  wl.clearWins();
  res.json({ ok: true });
});

// Admin: delete a single win entry by id
app.delete('/api/admin/wins/:id', requireAdmin, (req, res) => {
  wl.deleteWin(req.params.id);
  res.json({ ok: true });
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
  al.log('ban_ip', { ip, reason, durationMs });
  res.json({ ok: true });
});

// Unban an IP
app.delete('/api/admin/bans/ip/:ip', requireAdmin, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  bn.unbanIP(ip);
  al.log('unban_ip', { ip });
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
  const clean = username.trim().toLowerCase();
  bn.banUser(clean, games, reason, durationMs);
  al.log('ban_user', { target: clean, games, reason, durationMs });
  res.json({ ok: true });
});

// Unban a user
app.delete('/api/admin/bans/user/:username', requireAdmin, (req, res) => {
  const u = decodeURIComponent(req.params.username);
  bn.unbanUser(u);
  al.log('unban_user', { target: u });
  res.json({ ok: true });
});

// Get the current IP of a request (so admin can look up IPs)
app.get('/api/admin/bans/lookup-ip', requireAdmin, (req, res) => {
  // Returns IP from query param user's last known IP — simplified: just shows IP of this request
  res.json({ ok: true, yourIP: getClientIP(req) });
});


// ── Site config (game closures + testing mode) ────────────────────────────────

// Public: client fetches this to know what's closed / testing mode state
app.get('/api/site/config', (req, res) => {
  res.json(sc.getConfig());
});

// Toggle a game open/closed
app.post('/api/admin/site/game-close', requireAdmin, (req, res) => {
  const { slug, closed } = req.body || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });
  sc.setGameClosed(slug, !!closed);
  res.json({ ok: true, config: sc.getConfig() });
});

// Toggle a specific game into/out of testing mode
app.post('/api/admin/site/game-test', requireAdmin, (req, res) => {
  const { slug, testing } = req.body || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'Missing slug' });
  sc.setGameTesting(slug, !!testing);
  res.json({ ok: true, config: sc.getConfig() });
});

// Add an approved tester
app.post('/api/admin/site/testers', requireAdmin, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });
  sc.addTester(username.trim().toLowerCase());
  res.json({ ok: true, config: sc.getConfig() });
});

// Remove an approved tester
app.delete('/api/admin/site/testers/:username', requireAdmin, (req, res) => {
  sc.removeTester(req.params.username.toLowerCase());
  res.json({ ok: true, config: sc.getConfig() });
});

// ── Chat admin API ────────────────────────────────────────────────────────────

// All messages (including filtered & shadow-muted) — admin only
app.get('/api/admin/chat/messages', requireAdmin, (req, res) => {
  res.json({ ok: true, messages: chatStore.getMessages() });
});

// Clear all chat messages
app.delete('/api/admin/chat/messages', requireAdmin, (req, res) => {
  chatStore.clearMessages();
  res.json({ ok: true });
});

// Get chat ban list
app.get('/api/admin/chat/bans', requireAdmin, (req, res) => {
  res.json({ ok: true, bans: chatStore.getChatBans() });
});

// Ban a user from chat
app.post('/api/admin/chat/ban', requireAdmin, (req, res) => {
  const { username, reason, duration } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });

  let expiresAt = null;
  if (duration && duration !== 'permanent') {
    const map = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
    const secs = map[duration];
    if (secs) expiresAt = Date.now() + secs * 1000;
  }

  chatStore.addChatBan(username, reason, expiresAt, 'jasper');
  res.json({ ok: true });
});

// Unban from chat
app.delete('/api/admin/chat/ban/:username', requireAdmin, (req, res) => {
  chatStore.removeChatBan(req.params.username);
  res.json({ ok: true });
});

// Get moderation settings
app.get('/api/admin/chat/settings', requireAdmin, (req, res) => {
  res.json({ ok: true, settings: chatStore.getSettings() });
});

// Update moderation settings
app.post('/api/admin/chat/settings', requireAdmin, (req, res) => {
  const patch = req.body || {};
  const updated = chatStore.updateSettings(patch);
  res.json({ ok: true, settings: updated });
});

// Get violation counts
app.get('/api/admin/chat/violations', requireAdmin, (req, res) => {
  res.json({ ok: true, violations: chatStore.getAllViolations() });
});

// Reset a user's violations (and unmute)
app.delete('/api/admin/chat/violations/:username', requireAdmin, (req, res) => {
  chatNs.unmuteUser(req.params.username);
  res.json({ ok: true });
});

// Mute a user (shadow-mute)
app.post('/api/admin/chat/mute/:username', requireAdmin, (req, res) => {
  chatNs.muteUser(req.params.username);
  res.json({ ok: true });
});

// Unmute a user
app.delete('/api/admin/chat/mute/:username', requireAdmin, (req, res) => {
  chatNs.unmuteUser(req.params.username);
  res.json({ ok: true });
});

// Get currently muted users
app.get('/api/admin/chat/muted', requireAdmin, (req, res) => {
  res.json({ ok: true, muted: chatNs.getMutedUsers() });
});

// ── Admin: platform stats ─────────────────────────────────────────────────────

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ ok: true, stats: us.adminGetStats() });
});

// ── Admin: broadcast to chat ───────────────────────────────────────────────────

app.post('/api/admin/chat/broadcast', requireAdmin, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'Empty message' });
  const msg = chatStore.addSystemMessage(text.trim());
  io.of('/chat').emit('newMessage', msg);
  al.log('broadcast', { text: text.trim() });
  res.json({ ok: true });
});

// ── Admin: audit log ──────────────────────────────────────────────────────────

app.get('/api/admin/audit-log', requireAdmin, (req, res) => {
  res.json({ ok: true, logs: al.getLogs() });
});

app.delete('/api/admin/audit-log', requireAdmin, (req, res) => {
  al.clearLogs();
  res.json({ ok: true });
});

// ── Admin: leaderboard browser ────────────────────────────────────────────────

// Get all boards at once (admin overview)
app.get('/api/admin/leaderboards', requireAdmin, (req, res) => {
  const GAME_IDS = [
    'crash','plinko','dice','roulette','blackjack','baccarat',
    'mines','ride-the-bus','slots','chicken-cross','hilo','tower',
    'wheel','video-poker','keno','dragon-tiger',
    '2048','snake','minesweeper','tetris','wordle','sudoku',
    'space-invaders','flappy-bird','memory-match','typing-speed',
  ];
  const boards = {};
  for (const id of GAME_IDS) {
    const entries = lb.getLeaderboard(id);
    if (entries.length > 0) boards[id] = entries;
  }
  res.json({ ok: true, boards });
});

// Clear an entire game's leaderboard
app.delete('/api/admin/leaderboards/:gameId', requireAdmin, (req, res) => {
  lb.overwriteLeaderboard(req.params.gameId, []);
  al.log('clear_leaderboard', { gameId: req.params.gameId });
  res.json({ ok: true });
});

// ── Admin: danger zone bulk actions ──────────────────────────────────────────

// Clear all chat violations (unmute everyone too)
app.post('/api/admin/danger/clear-violations', requireAdmin, (req, res) => {
  const viols = chatStore.getAllViolations();
  for (const v of viols) {
    chatStore.resetViolations(v.username);
    chatNs.unmuteUser(v.username);
  }
  al.log('danger_clear_violations', { count: viols.length });
  res.json({ ok: true, count: viols.length });
});

// Unban all IPs
app.post('/api/admin/danger/unban-all-ips', requireAdmin, (req, res) => {
  const bans = bn.listIPBans();
  for (const b of bans) bn.unbanIP(b.ip);
  al.log('danger_unban_all_ips', { count: bans.length });
  res.json({ ok: true, count: bans.length });
});

// Unban all users from games
app.post('/api/admin/danger/unban-all-users', requireAdmin, (req, res) => {
  const bans = bn.listUserBans();
  for (const b of bans) bn.unbanUser(b.username);
  al.log('danger_unban_all_users', { count: bans.length });
  res.json({ ok: true, count: bans.length });
});

// Kick all online users (destroy all sessions except admin)
app.post('/api/admin/danger/kick-all', requireAdmin, (req, res) => {
  const users = us.listUsers(getToken(req));
  let kicked = 0;
  if (users.ok) {
    for (const u of users.users) {
      if (u.username === 'jasper') continue;
      const r = us.kickUser(getToken(req), u.username);
      if (r.ok) kicked += r.sessionsKilled;
    }
  }
  al.log('danger_kick_all', { sessionsKilled: kicked });
  res.json({ ok: true, sessionsKilled: kicked });
});

// ── Static client ─────────────────────────────────────────────────────────────

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Game namespaces ───────────────────────────────────────────────────────────

chatNs.register(io.of('/chat'));
require('./games/monopoly').register(io.of('/monopoly'));
require('./games/chess').register(io.of('/chess'));
require('./games/connect4').register(io.of('/connect4'));
require('./games/checkers').register(io.of('/checkers'));
require('./games/battleship').register(io.of('/battleship'));
require('./games/texasholdem').register(io.of('/texasholdem'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));
