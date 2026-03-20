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
const sg        = require('./suggestions');
const ru        = require('./riggedUsers');
const go        = require('./gameOdds');
const ch        = require('./championStore');
const odds      = require('./oddsAPI');
const sb        = require('./sportsStore');

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

// Public registration is disabled — only admins can create accounts.
app.post('/api/accounts/register', (req, res) => {
  res.status(403).json({ ok: false, error: 'Account creation is disabled. Contact the admin to get an account.' });
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

app.post('/api/accounts/transfer', requireAuth, (req, res) => {
  const { toUsername, amount } = req.body || {};
  const result = us.transfer(getToken(req), toUsername, amount);
  if (result.ok && Number(amount) >= 10000) {
    io.emit('moneyReceived', {
      to:     (toUsername || '').toLowerCase(),
      from:   req.user.username,
      amount: Number(amount),
    });
  }
  res.json(result);
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

// Auto-deletion of zero-balance accounts is disabled.

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

function requireAuth(req, res, next) {
  const me = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  req.user = me;
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

// Delete a user (admin only)
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const result = us.deleteUser(getToken(req), req.params.username);
  if (result.ok) al.log('delete_user', { target: req.params.username });
  res.json(result);
});

// Create a user (admin only — public registration is disabled)
app.post('/api/admin/users/create', requireAdmin, (req, res) => {
  const { username, password } = req.body || {};
  const result = us.register(username, password, 'admin-created');
  if (result.ok) al.log('create_user', { target: result.username });
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
  // Also fire a dedicated event so clients can show a full-screen popup
  io.of('/chat').emit('announcement', { text: text.trim(), timestamp: Date.now() });
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

// ── Suggestions ───────────────────────────────────────────────────────────────

// Public: submit a suggestion (auth required, 1 pending at a time)
app.post('/api/suggestions', requireAuth, (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'Empty suggestion' });
  const result = sg.addSuggestion(req.user.username, req.user.displayName, String(text).trim());
  if (result.error) return res.status(409).json({ ok: false, error: result.error });
  res.json(result);
});

// Public: get own suggestion status
app.get('/api/suggestions/mine', requireAuth, (req, res) => {
  res.json({ ok: true, suggestion: sg.getUserSuggestion(req.user.username) });
});

// Admin: get all suggestions
app.get('/api/admin/suggestions', requireAdmin, (req, res) => {
  res.json({ ok: true, suggestions: sg.getSuggestions() });
});

// Admin: accept or deny a suggestion
app.post('/api/admin/suggestions/:id/review', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['accepted','denied'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
  const result = sg.reviewSuggestion(req.params.id, status);
  al.log('review_suggestion', { id: req.params.id, status });
  res.json(result);
});

// Admin: delete a suggestion
app.delete('/api/admin/suggestions/:id', requireAdmin, (req, res) => {
  sg.deleteSuggestion(req.params.id);
  res.json({ ok: true });
});

// ── Rigged Users ──────────────────────────────────────────────────────────────

// Public: check if current user is rigged (returns obfuscated response)
app.get('/api/user/game-config', requireAuth, (req, res) => {
  const rigged = ru.isRigged(req.user.username);
  // Obfuscated: never directly say "rigged"; client checks the flag
  res.json({ ok: true, luckyMode: !rigged });
});

// Admin: list rigged users
app.get('/api/admin/rigged', requireAdmin, (req, res) => {
  res.json({ ok: true, users: ru.getRiggedList() });
});

// Admin: add rigged user
app.post('/api/admin/rigged', requireAdmin, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });
  al.log('rig_user', { target: username });
  res.json(ru.addRigged(username.toLowerCase()));
});

// Admin: remove rigged user
app.delete('/api/admin/rigged/:username', requireAdmin, (req, res) => {
  al.log('unrig_user', { target: req.params.username });
  res.json(ru.removeRigged(req.params.username));
});

// ── Game Odds / Wildcard ──────────────────────────────────────────────────────

// Public: get game boost for a specific game (and whether it's the wildcard)
app.get('/api/game-config/:slug', (req, res) => {
  const slug          = req.params.slug;
  const wildcard      = go.getDailyWildcard();
  const baseBoost     = go.getGameBoost(slug);
  const happyMult     = ch.getHappyHourMultiplier();
  const boost         = parseFloat((baseBoost * happyMult).toFixed(4));
  const happyHourActive = happyMult > 1.0;
  res.json({ ok: true, slug, wildcard, isWildcard: slug === wildcard, boost, wildcardBoost: go.getWildcardBoost(), happyHourActive });
});

// Public: get today's wildcard
app.get('/api/game-config', (req, res) => {
  res.json({ ok: true, ...go.getAllBoosts() });
});

// Admin: set per-game boost
app.post('/api/admin/game-odds/:slug', requireAdmin, (req, res) => {
  const { multiplier } = req.body || {};
  al.log('set_game_odds', { slug: req.params.slug, multiplier });
  res.json(go.setGameBoost(req.params.slug, multiplier));
});

// Admin: reset per-game boost to default
app.delete('/api/admin/game-odds/:slug', requireAdmin, (req, res) => {
  al.log('reset_game_odds', { slug: req.params.slug });
  res.json(go.resetGameBoost(req.params.slug));
});

// Admin: set wildcard override
app.post('/api/admin/game-odds/wildcard/override', requireAdmin, (req, res) => {
  const { slug, boost } = req.body || {};
  if (slug !== undefined) go.setWildcardOverride(slug || null);
  if (boost !== undefined) go.setWildcardBoost(boost);
  al.log('set_wildcard', { slug, boost });
  res.json({ ok: true });
});

// ── Weekly Reset ──────────────────────────────────────────────────────────────

// Admin: manually trigger weekly reset (also called by scheduled task)
app.post('/api/admin/weekly-reset', requireAdmin, (req, res) => {
  const { amount } = req.body || {};
  const RESET_AMOUNT = Number(amount) > 0 ? Math.floor(Number(amount)) : 5000;

  // Crown the richest player as this week's champion BEFORE resetting balances
  const top = us.getTopBalances(1);
  if (top.length > 0) {
    const newChamp = top[0];
    ch.setChampion(newChamp.username, newChamp.displayName);
    const crownMsg = chatStore.addSystemMessage(
      `👑 ${newChamp.displayName} is this week's Casino Champion with $${(newChamp.casinoBalance || 0).toLocaleString()}! They now have special powers for the week.`
    );
    io.of('/chat').emit('newMessage', crownMsg);
    io.of('/chat').emit('announcement', {
      text: `👑 ${newChamp.displayName} is this week's Casino Champion!`,
      timestamp: Date.now(),
    });
  } else {
    ch.clearChampion();
  }

  const count = us.bulkResetBalances(RESET_AMOUNT);

  // Kick everyone and kill all sessions so they see a fresh login
  const allUsers = us.listUsers(getToken(req));
  let sessionsKilled = 0;
  if (allUsers.ok) {
    for (const u of allUsers.users) {
      const r = us.kickUser(getToken(req), u.username);
      if (r.ok) sessionsKilled += r.sessionsKilled;
    }
  }
  // Broadcast forced-logout event so clients redirect to login
  io.emit('forceLogout', { reason: 'Weekly reset — please log back in!' });

  al.log('weekly_reset', { count, amount: RESET_AMOUNT, sessionsKilled });
  res.json({ ok: true, count, amount: RESET_AMOUNT, sessionsKilled });
});

// ── Weekly Champion ───────────────────────────────────────────────────────────

// Public: get current champion info (for crown badges everywhere)
app.get('/api/champion', (req, res) => {
  const state = ch.getState();
  res.json({
    ok: true,
    champion: state.champion,
    happyHourActive: state.happyHourActive && state.happyHourEndsAt > Date.now(),
    happyHourEndsAt: state.happyHourEndsAt,
  });
});

// Champion-only: get full panel state
app.get('/api/champion/panel', requireAuth, (req, res) => {
  if (!ch.isChampion(req.user.username)) {
    return res.status(403).json({ ok: false, error: 'Not the current champion' });
  }
  const state = ch.getState();
  res.json({
    ok: true,
    champion:   state.champion,
    broadcasts: { used: state.broadcasts.used,  limit: ch.BROADCAST_LIMIT },
    mutes:      { used: state.mutes.used,        limit: ch.MUTE_LIMIT },
    happyHour:  {
      used:   state.happyHour.used,
      active: state.happyHourActive && state.happyHourEndsAt > Date.now(),
      endsAt: state.happyHourEndsAt,
    },
    gotd:    { used: state.gotd?.used    || false },
    airdrop: { used: state.airdrop?.used || false },
  });
});

// Champion-only: broadcast a message site-wide (max 3/week)
app.post('/api/champion/broadcast', requireAuth, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'Empty message' });

  const result = ch.useBroadcast(req.user.username);
  if (!result.ok) return res.status(403).json(result);

  const state = ch.getState();
  const name  = state.champion?.displayName || req.user.username;
  const msg   = chatStore.addSystemMessage(`👑 Champion ${name}: ${text.trim()}`);
  io.of('/chat').emit('newMessage', msg);
  io.of('/chat').emit('announcement', { text: `👑 ${name}: ${text.trim()}`, timestamp: Date.now() });

  res.json({ ok: true, broadcastsLeft: ch.BROADCAST_LIMIT - result.used });
});

// Champion-only: mute a player from chat for 1 hour (max 3/week)
app.post('/api/champion/mute', requireAuth, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });
  const target = (username || '').toLowerCase().trim();
  if (target === 'jasper') return res.status(403).json({ ok: false, error: 'Cannot mute the admin' });
  if (target === req.user.username) return res.status(400).json({ ok: false, error: 'Cannot mute yourself' });

  const result = ch.useMute(req.user.username);
  if (!result.ok) return res.status(403).json(result);

  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  chatStore.addChatBan(target, `Muted for 1 hour by the weekly champion`, expiresAt, req.user.username);

  res.json({ ok: true, mutesLeft: ch.MUTE_LIMIT - result.used });
});

// Champion-only: trigger happy hour (1.5× payout boost, 30 min, once per day)
app.post('/api/champion/happy-hour', requireAuth, (req, res) => {
  const result = ch.triggerHappyHour(req.user.username);
  if (!result.ok) return res.status(403).json(result);

  const state = ch.getState();
  const name  = state.champion?.displayName || req.user.username;
  const msg   = chatStore.addSystemMessage(`🎉 HAPPY HOUR started by ${name}! ALL casino games pay 1.5× for 30 minutes!`);
  io.of('/chat').emit('newMessage', msg);
  io.of('/chat').emit('announcement', {
    text: `🎉 HAPPY HOUR! 1.5× payouts on ALL casino games for 30 minutes!`,
    timestamp: Date.now(),
  });

  // Auto-announce expiry
  setTimeout(() => {
    // Re-check state in case server restarted; getHappyHourMultiplier handles expiry
    const expMsg = chatStore.addSystemMessage('⏰ Happy hour has ended. Thanks to this week\'s champion!');
    io.of('/chat').emit('newMessage', expMsg);
  }, ch.HAPPY_HOUR_MS);

  res.json({ ok: true, endsAt: result.endsAt });
});

// Champion-only: override the Game of the Day (once per day)
const CHAMPION_GOTD_SLUGS = [
  'crash','plinko','dice','roulette','blackjack','baccarat','mines',
  'ride-the-bus','slots','chicken-cross','texas-holdem','hilo','tower',
  'wheel','video-poker','keno','dragon-tiger',
];
const CHAMPION_GOTD_NAMES = {
  'crash': 'Crash', 'plinko': 'Plinko', 'dice': 'Dice', 'roulette': 'Roulette',
  'blackjack': 'Blackjack', 'baccarat': 'Baccarat', 'mines': 'Mines',
  'ride-the-bus': 'Ride the Bus', 'slots': 'Slots', 'chicken-cross': 'Chicken Cross',
  'texas-holdem': "Texas Hold'em", 'hilo': 'HiLo', 'tower': 'Tower',
  'wheel': 'Wheel', 'video-poker': 'Video Poker', 'keno': 'Keno', 'dragon-tiger': 'Dragon Tiger',
};
app.post('/api/champion/gotd', requireAuth, (req, res) => {
  const { game } = req.body || {};
  if (!game || !CHAMPION_GOTD_SLUGS.includes(game)) {
    return res.status(400).json({ ok: false, error: 'Invalid game slug' });
  }
  const result = ch.useGotd(req.user.username);
  if (!result.ok) return res.status(403).json(result);

  go.setWildcardOverride(game);

  const state    = ch.getState();
  const name     = state.champion?.displayName || req.user.username;
  const gameName = CHAMPION_GOTD_NAMES[game] || game;
  const msg      = chatStore.addSystemMessage(`👑 Champion ${name} has declared ${gameName} as today's Game of the Day!`);
  io.of('/chat').emit('newMessage', msg);
  io.of('/chat').emit('announcement', {
    text: `👑 ${name} set today's Game of the Day to ${gameName}! Check the homepage for bonus odds!`,
    timestamp: Date.now(),
  });

  res.json({ ok: true });
});

// Champion-only: airdrop coins to a player (once per day, max $50k)
app.post('/api/champion/airdrop', requireAuth, (req, res) => {
  const { username, amount } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });
  const target = (username || '').trim().toLowerCase();
  if (target === req.user.username) return res.status(400).json({ ok: false, error: 'Cannot airdrop yourself' });

  const amt = Math.floor(Number(amount));
  if (!amt || amt < 1 || amt > ch.AIRDROP_MAX) {
    return res.status(400).json({ ok: false, error: `Amount must be $1 – $${ch.AIRDROP_MAX.toLocaleString()}` });
  }
  if (!us.userExists(target)) return res.status(404).json({ ok: false, error: 'User not found' });

  const result = ch.useAirdrop(req.user.username);
  if (!result.ok) return res.status(403).json(result);

  us.addBonusByAdmin(target, amt);

  const state = ch.getState();
  const name  = state.champion?.displayName || req.user.username;
  const msg   = chatStore.addSystemMessage(`💸 Champion ${name} airdropped $${amt.toLocaleString()} to @${target}! 🎁`);
  io.of('/chat').emit('newMessage', msg);
  io.of('/chat').emit('announcement', {
    text: `💸 @${target} just received a $${amt.toLocaleString()} airdrop from Champion ${name}! 🎁`,
    timestamp: Date.now(),
  });

  res.json({ ok: true });
});

// Admin: remove champion
app.delete('/api/admin/champion', requireAdmin, (req, res) => {
  ch.clearChampion();
  al.log('clear_champion', {});
  res.json({ ok: true });
});

// Admin: manually set champion (for testing or overriding)
app.post('/api/admin/champion', requireAdmin, (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'Missing username' });
  const clean  = (username || '').toLowerCase().trim();
  const result = us.listUsers(getToken(req));
  if (!result.ok) return res.status(403).json({ ok: false, error: 'Forbidden' });
  const user   = result.users.find(u => u.username === clean);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  ch.setChampion(user.username, user.displayName);
  al.log('set_champion', { target: user.username });
  res.json({ ok: true });
});

// ── Sports Betting ────────────────────────────────────────────────────────────

// Public: list upcoming games with odds (cached 30 min)
app.get('/api/sports/games', requireAuth, async (req, res) => {
  try {
    const sports = await odds.fetchAllGames();
    res.json({ ok: true, sports });
  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      return res.json({ ok: false, error: 'NO_API_KEY' });
    }
    console.error('[sports] fetchAllGames error:', err.message);
    res.json({ ok: false, error: 'Failed to fetch games' });
  }
});

// Place a bet — deducts balance immediately
app.post('/api/sports/bet', requireAuth, (req, res) => {
  const { gameId, sport, homeTeam, awayTeam, commenceTime, pick, odds: betOdds, amount } = req.body || {};
  const amt = Math.floor(Number(amount));

  // Deduct from user balance first
  const me = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if ((me.balance || 0) < amt) return res.status(400).json({ ok: false, error: 'Insufficient balance' });

  // Place the bet in the store
  const result = sb.placeBet({
    username: req.user.username,
    gameId, sport, homeTeam, awayTeam, commenceTime, pick,
    odds: betOdds, amount: amt,
  });
  if (!result.ok) return res.status(400).json(result);

  // Deduct from server balance
  us.syncBalance(getToken(req), (me.balance || 0) - amt);

  res.json(result);
});

// Get my bets
app.get('/api/sports/bets', requireAuth, (req, res) => {
  const bets = sb.getUserBets(req.user.username);
  res.json({ ok: true, bets });
});

// ── Sports auto-settlement (runs every 10 minutes) ───────────────────────────
async function settleSportsBets() {
  const sportsWithBets = sb.getSportsWithOpenBets();
  if (sportsWithBets.length === 0) return;

  for (const sportKey of sportsWithBets) {
    try {
      const scores      = await odds.fetchScoresForSport(sportKey);
      const openByGame  = sb.getOpenBetsByGame();

      for (const score of scores) {
        if (!score.completed) continue;
        const gameBets = openByGame[score.id];
        if (!gameBets || gameBets.length === 0) continue;

        // Determine the winner from scores
        let winner = null;
        const sc = score.scores || [];
        if (sc.length >= 2) {
          const s0 = parseInt(sc[0].score, 10);
          const s1 = parseInt(sc[1].score, 10);
          if (!isNaN(s0) && !isNaN(s1)) {
            if (s0 === s1) winner = 'push';
            else winner = s0 > s1 ? sc[0].name : sc[1].name;
          }
        }
        if (!winner) continue;

        // Settle each bet and credit winners
        for (const bet of gameBets) {
          const settled = sb.settleBet(bet.betId, winner);
          if (!settled) continue;

          if (settled.status === 'won' || settled.status === 'push') {
            // Credit payout to user's balance
            us.addBonusByAdmin(settled.username, settled.payout);
            console.log(`[sports] Settled WIN  — ${settled.username} +$${settled.payout} (${bet.pick} vs ${winner})`);
          } else {
            console.log(`[sports] Settled LOSS — ${settled.username} -$${settled.amount} (picked ${bet.pick}, winner ${winner})`);
          }
        }
      }
    } catch (err) {
      console.error(`[sports] Settlement error for ${sportKey}:`, err.message);
    }
  }
}

// Run settlement every 10 minutes
setInterval(settleSportsBets, 10 * 60 * 1000);
// Also run once at startup (after 30 sec delay to let server warm up)
setTimeout(settleSportsBets, 30_000);

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
require('./games/uno').register(io.of('/uno'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Game platform server running on port ${PORT}`));

// ── Global error handlers to prevent server crashes ───────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
