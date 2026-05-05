'use strict';

// ── Ensure Odds API key is available before any modules cache process.env ─────
// Falls back to the key in sync-today.sh so Railway works without manual setup.
if (!process.env.ODDS_API_KEY) {
  process.env.ODDS_API_KEY = '358b60a6e8223a596d99cb0dc8fe6716';
}

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const compression = require('compression');
const path = require('path');
const nodeCrypto  = require('crypto');
const { getPassword, setPassword, generatePassword } = require('./passwordStore');
const { sendPasswordEmail } = require('./email');
const lb = require('./leaderboard');
const us = require('./userStore');
const rp = require('./reportStore');
const bn = require('./banStore');
const wl = require('./winLog');
const pw = require('./publicWinsStore');
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
const autoSettle = require('./autoSettle');
const autoSync   = require('./autoSync');
const jp        = require('./jackpotStore');
const gc        = require('./giftCodeStore');
const xp        = require('./xpStore');
const ms        = require('./missionsStore');
const wr        = require('./wagerRaceStore');
const lt        = require('./lotteryStore');
const vip       = require('./vipStore');
const pvp       = require('./pvpStore');
const cr        = require('./communityRainStore');
const mb        = require('./mysteryBoxStore');
const ns        = require('./newsStore');
const bs        = require('./boostStore');
const rf        = require('./referralStore');
const pr        = require('./prestigeStore');
const ci        = require('./checkInStore');
const tl        = require('./titleStore');
const ln        = require('./luckyNumbersStore');
const bh        = require('./balanceHistoryStore');
const jr        = require('./jackpotRushStore');
const dg        = require('./dailyGoalsStore');
const er        = require('./emojiReactionsStore');
const cryptoFeed      = require('./cryptoPriceFeed');
const cryptoPortfolio = require('./cryptoPortfolioStore');
const bank            = require('./bankStore');
const flashEvents     = require('./flashEventStore');
const cryptoOrders    = require('./cryptoOrdersStore');
const predMarket      = require('./predictionMarketStore');
const memeCoins       = require('./memeCoinStore');
const wishingWell     = require('./wishingWellStore');
const liveFeed        = require('./liveFeedStore');
const eggHunt         = require('./eggHuntStore');
const tournaments     = require('./tournamentStore');
const seasonPass      = require('./seasonPassStore');
const pets            = require('./petStore');
const factories       = require('./factoryStore');
const duels           = require('./duelStore');
const lootDrops       = require('./lootDropStore');
const cases           = require('./caseStore');
const jokers          = require('./jokerStore');
const auction         = require('./auctionStore');
const trades          = require('./tradeStore');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Gzip all API responses — skip Socket.io long-polling paths (prevents WS handshake corruption)
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/socket.io')) return false;
    return compression.filter(req, res);
  },
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

// Public registration
app.post('/api/accounts/register', (req, res) => {
  const { username, password } = req.body || {};
  const ip = getClientIP(req);
  const result = us.register(username, password, ip);
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
  try {
    const now = Date.now();
    let count = 0;
    for (const [token, data] of gameActivity) {
      if (now - data.lastSeen > ACTIVITY_TTL_MS) continue;
      us.addBonus(data.username, 5000);
      pendingBonuses.set(token, (pendingBonuses.get(token) || 0) + 5000);
      count++;
    }
    if (count > 0) console.log(`[Bonus] Gave $5,000 to ${count} online player(s)`);
  } catch (err) {
    console.error('[Bonus interval] Error:', err);
  }
}, 5 * 60 * 1000);

// Auto-sync upcoming games from Odds API every 6 hours
autoSync.start();

// Auto-settle sports games every 5 minutes using Odds API scores
autoSettle.start(5 * 60 * 1000, io);

// Auto-draw lottery at noon Pacific — check every 30 seconds
setInterval(() => {
  try {
    const result = lt.autoDrawIfTime();
    if (!result) return; // not time yet or already drawn
    if (result.winner) {
      const r = us.addBonusByAdmin(result.winner, result.jackpot);
      if (r.ok) io.emit('balanceReset', { username: result.winner, balance: r.balance });
      io.emit('lotteryDraw', { winner: result.winner, ticketId: result.ticketId, ticketNum: result.ticketNum, jackpot: result.jackpot });
      console.log(`[Lottery] 🎟️ Auto-draw! ${result.winner} wins $${result.jackpot.toLocaleString()}`);
    } else {
      io.emit('lotteryDraw', { winner: null, jackpot: result.jackpot, carry: result.carry });
      console.log('[Lottery] Auto-draw: no tickets sold today');
    }
  } catch (e) {
    console.error('[Lottery auto-draw]', e);
  }
}, 30_000);

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

// Admin: get all currently active users — both in-game and just-online.
// "in-game" comes from the gameActivity heartbeat map (90s TTL).
// "just-online" pulls anyone whose lastSeen has updated in the last 5 minutes
// via touchLastSeen (every authenticated API call refreshes it).
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const now    = Date.now();
  const active = [];
  const ingameBy = new Map(); // username → gameSlug
  for (const [token, data] of gameActivity) {
    if (now - data.lastSeen > ACTIVITY_TTL_MS) { gameActivity.delete(token); continue; }
    active.push({ username: data.username, gameSlug: data.gameSlug, lastSeen: data.lastSeen });
    ingameBy.set(data.username, data.gameSlug);
  }
  // Recently-active users (lastSeen within ~5 minutes) — covers people who
  // are on the site but not actively in a game.
  const ONLINE_WINDOW_MIN = 5;
  let onlineUsernames = [];
  try { onlineUsernames = us.getOnlineUsers(ONLINE_WINDOW_MIN); } catch {}
  const online = onlineUsernames.map(username => ({
    username,
    gameSlug: ingameBy.get(username) || null,
    inGame: ingameBy.has(username),
  }));
  // Live socket count — purely informational (counts every websocket, may
  // include duplicates from multi-tab users).
  const socketCount = io.sockets.sockets.size;
  res.json({ ok: true, activity: active, online, socketCount, windowMinutes: ONLINE_WINDOW_MIN });
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
  const token = getToken(req);
  if (!us.isAdminToken(token)) return res.status(403).json({ error: 'Forbidden' });
  const me = us.getMe(token);
  if (me.ok) req.user = me;
  next();
}

function requireOwner(req, res, next) {
  const token = getToken(req);
  if (!us.isOwnerToken(token)) return res.status(403).json({ error: 'Owner only' });
  const me = us.getMe(token);
  if (me.ok) req.user = me;
  next();
}

// Owner-only: manage secondary admins
app.get('/api/admin/secondary-admins', requireOwner, (req, res) => {
  res.json({ ok: true, admins: us.listSecondaryAdmins() });
});
app.post('/api/admin/secondary-admins', requireOwner, (req, res) => {
  const { username } = req.body || {};
  const result = us.grantAdmin(req.user.username, username);
  if (result.ok) al.log('admin_granted', { target: username, by: req.user.username });
  res.json(result);
});
app.delete('/api/admin/secondary-admins/:username', requireOwner, (req, res) => {
  const result = us.revokeAdmin(req.user.username, req.params.username);
  if (result.ok) al.log('admin_revoked', { target: req.params.username, by: req.user.username });
  res.json(result);
});

function requireAuth(req, res, next) {
  const me = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  req.user = me;
  // Mark user online for coin-rain / community-rain payouts
  try { us.touchLastSeen(me.username); } catch {}
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
  if (result.ok) {
    al.log('give_money', { target: username, amount });
    // Push new balance to recipient's browser immediately so the 800ms sync
    // timer can't push a stale pre-gift balance back to the server.
    io.emit('balanceReset', { username: (username || '').trim().toLowerCase(), balance: result.balance });
  }
  res.json(result);
});

// Set a user's balance to an exact value
app.put('/api/admin/users/:username/balance', requireAdmin, (req, res) => {
  const { amount } = req.body || {};
  const result = us.adminSetBalance(getToken(req), req.params.username, amount);
  if (result.ok) {
    al.log('set_balance', { target: req.params.username, amount });
    // Push new balance to the user's browser immediately so localStorage is updated
    // before their 800ms sync timer fires and overwrites the reset
    io.emit('balanceReset', { username: req.params.username.trim().toLowerCase(), balance: result.balance });
  }
  res.json(result);
});

// Kick a user (destroy all their sessions — forces logout)
app.post('/api/admin/kick/:username', requireAdmin, (req, res) => {
  const result = us.kickUser(getToken(req), req.params.username);
  if (result.ok) al.log('kick_user', { target: req.params.username, sessionsKilled: result.sessionsKilled });
  res.json(result);
});

// ── Big Win Log ────────────────────────────────────────────────────────────────

// Client reports a big win — auth required.
// Two thresholds:
//   - public Big Wins Board: $10k+
//   - admin big-win log:    $5M+
app.post('/api/accounts/big-win', (req, res) => {
  const token = getToken(req);
  const me = us.getMe(token);
  if (!me.ok) return res.json({ ok: false });
  const { game, bet, payout, profit, multiplier, details } = req.body || {};
  if (!game || bet == null || payout == null) return res.json({ ok: false });
  const realProfit = Math.floor(profit ?? (payout - bet));
  if (realProfit < 10_000) return res.json({ ok: false }); // server-side floor

  const entry = {
    username:   me.username,
    game,
    bet:        Math.floor(bet),
    payout:     Math.floor(payout),
    profit:     realProfit,
    multiplier: multiplier ?? null,
    details:    details || '',
    timestamp:  Date.now(),
  };

  // Public board always gets the entry.
  pw.logWin(entry);
  // Admin log is whales only.
  if (realProfit >= 5_000_000) wl.logWin({ ...entry });

  // Broadcast to all clients for live feed
  io.emit('bigWin', { username: me.username, game, profit: realProfit, multiplier: multiplier ?? null, timestamp: Date.now() });

  // Award XP + achievements for big win
  const xpResult = xp.recordBet({ username: me.username, game, amount: Math.floor(bet), won: true, multiplier: multiplier ?? 1, profit: realProfit });
  if (xpResult.unlocked.length > 0 || xpResult.leveledUp) {
    io.emit('xpEvent', { username: me.username, ...xpResult });
  }
  // Mission: big_win event
  const mult = multiplier ?? (payout / bet);
  ms.recordEvent(me.username, 'big_win', game, realProfit, mult);

  console.log(`[winLog] 🏆 ${me.username} won $${realProfit.toLocaleString()} on ${game}`);
  res.json({ ok: true });
});

// Admin: view big wins. Returns the public board ($10k+) merged with the
// whale-only persisted log ($5M+). Public entries are deduped by id when an
// entry was promoted to whale status. `whaleIds` flags which entries crossed
// the $5M threshold so the UI can highlight them.
app.get('/api/admin/wins', requireAdmin, (req, res) => {
  const publicWins = pw.getWins();
  const whales     = wl.getWins();
  const whaleKeys  = new Set(whales.map(w => `${w.username}|${w.timestamp}`));
  // Tag public entries that are whales for UI highlighting
  const wins = publicWins.map(w => ({
    ...w,
    isWhale: whaleKeys.has(`${w.username}|${w.timestamp}`) || (w.profit || 0) >= 5_000_000,
  }));
  // Append any whale entries the public store has already aged out
  const seen = new Set(wins.map(w => `${w.username}|${w.timestamp}`));
  for (const w of whales) {
    const key = `${w.username}|${w.timestamp}`;
    if (!seen.has(key)) wins.push({ ...w, isWhale: true });
  }
  wins.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  res.json({ ok: true, wins });
});

// Admin: clear both win logs
app.delete('/api/admin/wins', requireAdmin, (req, res) => {
  wl.clearWins();
  pw.clearWins();
  res.json({ ok: true });
});

// Admin: delete a single win entry by id (tries both logs)
app.delete('/api/admin/wins/:id', requireAdmin, (req, res) => {
  wl.deleteWin(req.params.id);
  res.json({ ok: true });
});

// Auto-clear ONLY the persisted whale log every hour. The public ring buffer
// rotates on its own as new wins arrive (max 50 entries) and doesn't need
// scheduled clearing.
const WIN_LOG_CLEAR_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  try {
    wl.clearWins();
    console.log('[winLog] hourly clear done');
  } catch (e) {
    console.error('[winLog] hourly clear failed:', e.message);
  }
}, WIN_LOG_CLEAR_INTERVAL_MS);

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
  if (slug !== undefined) go.setWildcardOverride(slug || null, true); // admin override is permanent
  if (boost !== undefined) go.setWildcardBoost(boost);
  al.log('set_wildcard', { slug, boost });
  res.json({ ok: true });
});

// ── Weekly Reset ──────────────────────────────────────────────────────────────

const WEEKLY_RESET_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'weeklyResetState.json');
function readWeeklyResetState() {
  try { return JSON.parse(require('fs').readFileSync(WEEKLY_RESET_FILE, 'utf8')); }
  catch { return { lastResetAt: 0 }; }
}
function writeWeeklyResetState(state) {
  try {
    const fs = require('fs');
    const dir = path.dirname(WEEKLY_RESET_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WEEKLY_RESET_FILE, JSON.stringify(state, null, 2));
  } catch (e) { console.error('[weeklyReset] write error:', e.message); }
}

// Core reset routine — usable both from the admin manual endpoint and the
// scheduled cron. Returns a summary object.
function runWeeklyReset(amount, source = 'manual') {
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

  // Kill every session except owner so users see a fresh login.
  const sessionsKilled = us.killAllSessionsExceptOwner();
  io.emit('forceLogout', { reason: 'Weekly reset — please log back in!' });

  writeWeeklyResetState({ lastResetAt: Date.now(), source, amount: RESET_AMOUNT });
  al.log('weekly_reset', { count, amount: RESET_AMOUNT, sessionsKilled, source });
  console.log(`[weeklyReset] ${source}: reset ${count} accounts to $${RESET_AMOUNT.toLocaleString()}, killed ${sessionsKilled} sessions`);
  return { count, amount: RESET_AMOUNT, sessionsKilled };
}

// Admin: manually trigger weekly reset
app.post('/api/admin/weekly-reset', requireAdmin, (req, res) => {
  const summary = runWeeklyReset(req.body?.amount, 'manual:' + req.user.username);
  res.json({ ok: true, ...summary });
});

// Read-only: when the next auto reset will fire (admin UI display)
app.get('/api/admin/weekly-reset/status', requireAdmin, (req, res) => {
  res.json({ ok: true, ...readWeeklyResetState(), nowMs: Date.now() });
});

// Scheduled auto-reset: fires every Sunday at noon (server local time) IF the
// last reset was more than 6 days ago. Polled once a minute so a missed tick
// (server restart, downtime) catches up the next minute.
const WEEKLY_RESET_DAY  = 0;     // Sunday
const WEEKLY_RESET_HOUR = 12;    // 12:00 noon local
const WEEKLY_RESET_MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000;
setInterval(() => {
  try {
    const now = new Date();
    if (now.getDay() !== WEEKLY_RESET_DAY) return;
    if (now.getHours() < WEEKLY_RESET_HOUR) return;
    const state = readWeeklyResetState();
    if (Date.now() - (state.lastResetAt || 0) < WEEKLY_RESET_MIN_GAP_MS) return;
    runWeeklyReset(5000, 'cron');
  } catch (e) { console.error('[weeklyReset cron]', e.message); }
}, 60 * 1000);

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
    gotd:    { used: state.gotd?.used    || false, game: state.gotd?.used ? go.getDailyWildcard() : null },
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

  const bonusResult = us.addBonusByAdmin(target, amt);

  // Push new balance to the recipient's browser immediately so their
  // localStorage is updated before their sync timer wipes the airdrop
  if (bonusResult.ok) {
    io.emit('balanceReset', { username: target, balance: bonusResult.balance });
  }

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

// ── XP & Levels ───────────────────────────────────────────────────────────────

app.get('/api/xp/profile', requireAuth, (req, res) => {
  const profile = xp.getProfile(req.user.username);
  if (!profile) return res.json({ ok: true, profile: { xp: 0, level: 1, levelInfo: xp.getLevelInfo(0), achievements: [], achievementDetails: [], totalWagered: 0, totalWins: 0, winStreak: 0, bestStreak: 0, gamesPlayed: {}, spinStreak: 0 } });
  res.json({ ok: true, profile });
});

app.get('/api/xp/profile/:username', (req, res) => {
  const uname = req.params.username.toLowerCase();
  let profile  = xp.getProfile(uname);
  // If no XP data yet, check if user exists and return empty scaffold
  if (!profile) {
    const userExists = us.userExists ? us.userExists(uname) : true;
    if (!userExists) return res.status(404).json({ ok: false, error: 'User not found' });
    profile = {
      xp: 0, level: 1, totalWagered: 0, totalWins: 0, winStreak: 0, bestStreak: 0,
      gamesPlayed: {}, achievements: [], achievementDetails: [], spinStreak: 0,
      levelInfo: xp.getLevelInfo(0),
    };
  }
  // Attach VIP tier
  const vipData = vip.getTierForWagered(profile.totalWagered || 0);
  profile.vipTier = vipData.tier > 0 ? vipData.name.toLowerCase() : 'none';
  profile.username = uname;
  res.json({ ok: true, profile });
});

app.get('/api/xp/leaderboard', (req, res) => {
  res.json({ ok: true, players: xp.getTopPlayers(25) });
});

app.get('/api/xp/meta', (req, res) => {
  res.json({ ok: true, levels: xp.LEVELS, achievements: xp.ACHIEVEMENTS });
});

// Record a bet result (called by casino game clients after each round)
app.post('/api/xp/record-bet', requireAuth, (req, res) => {
  const { game, amount, won, multiplier, profit } = req.body || {};
  if (!game || amount == null) return res.status(400).json({ ok: false });

  // Weekend XP bonus: 1.5× XP on Saturday (6) and Sunday (0) Pacific
  const pacificOffset = (() => {
    const d = new Date();
    const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
    const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
    return Math.min(jan, jul) === 420 ? 7 : 8; // PDT vs PST
  })();
  const pacificDay = new Date(Date.now() - pacificOffset * 3_600_000).getUTCDay();
  const xpMultiplier = (pacificDay === 0 || pacificDay === 6) ? 1.5 : 1;

  const result = xp.recordBet({ username: req.user.username, game, amount: Math.floor(amount), won: !!won, multiplier: multiplier ?? 1, profit: profit ?? 0 });
  // Include boost status in response so client can display it
  result.boostActive = bs.isBoostActive(req.user.username);

  // Lucky number bonus: roulette bets on today's lucky numbers get 2× XP
  const luckyNum = req.body?.luckyNumber ?? req.body?.betNumber ?? null;
  if (game === 'roulette' && luckyNum !== null && ln.isLucky(luckyNum) && result.xpGained > 0) {
    const luckyBonus = result.xpGained; // double XP
    const lr = xp.awardXP(req.user.username, luckyBonus);
    result.xpGained   += luckyBonus;
    result.newXp       = lr.newXp;
    result.luckyBonus  = luckyBonus;
  }

  // Apply weekend XP multiplier to the result
  if (xpMultiplier > 1 && result.xpGained > 0) {
    const bonus = Math.floor(result.xpGained * (xpMultiplier - 1));
    if (bonus > 0) {
      const r2 = xp.awardXP(req.user.username, bonus);
      result.xpGained += bonus;
      result.newXp     = r2.newXp;
      result.weekendBonus = bonus;
      if (r2.leveledUp && !result.leveledUp) {
        result.leveledUp = true;
        result.newLevel  = r2.newLevel;
        result.levelInfo = r2.levelInfo;
      }
    }
  }

  // Joker XP multiplier — apply bonus XP from equipped jokers with xpMultiplier
  // (e.g. XP Crystal +25%, Crown Joker +100%, Multiverse +200%).
  try {
    const jokerAbilities = jokers.getEquippedAbilities(req.user.username);
    const jokerXpMult = jokerAbilities?.xpMultiplier || 0;
    if (jokerXpMult > 0 && result.xpGained > 0) {
      const bonus = Math.floor(result.xpGained * jokerXpMult);
      if (bonus > 0) {
        const r3 = xp.awardXP(req.user.username, bonus);
        result.xpGained  += bonus;
        result.newXp      = r3.newXp;
        result.jokerXpBonus = bonus;
        if (r3.leveledUp && !result.leveledUp) {
          result.leveledUp = true;
          result.newLevel  = r3.newLevel;
          result.levelInfo = r3.levelInfo;
        }
      }
    }
  } catch {}

  // Daily goals — track wagered amount
  dg.addWager(req.user.username, Math.floor(amount));

  // Tournament tracking — updates standings for any active tournament the
  // user is enrolled in that matches this game (or '*')
  tournaments.recordBet(req.user.username, {
    profit: Number(profit) || 0,
    wager: Math.floor(amount),
    gameSlug: game,
  });

  // Season Pass & Pet Companion — earn passive XP from wagering
  try {
    const sp = seasonPass.addWagerXP(req.user.username, Math.floor(amount));
    if (sp && sp.gained > 0) result.seasonXp = sp.newXp;
    pets.addWagerXP(req.user.username, Math.floor(amount));
  } catch {}

  // Mission progress
  ms.recordEvent(req.user.username, 'wager', game, Math.floor(amount), multiplier);
  if (won) ms.recordEvent(req.user.username, 'win', game, Math.floor(amount), multiplier);
  if (won) ms.recordEvent(req.user.username, 'game_win', game, Math.floor(amount), multiplier);
  ms.recordEvent(req.user.username, 'game_wager', game, Math.floor(amount), multiplier);

  // Wager race — admins are excluded from competing
  if (!us.isAdminToken(getToken(req))) {
    wr.recordWager(req.user.username, Math.floor(amount));
  }

  // Level-up rewards: auto-credit coins + boost token when leveling up
  if (result.leveledUp) {
    const levelRewards = [0, 0, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 1000000];
    const reward = levelRewards[result.newLevel] || 0;
    if (reward > 0) {
      const r = us.addBonusByAdmin(req.user.username, reward);
      if (r.ok) {
        io.emit('balanceReset', { username: req.user.username, balance: r.balance });
        result.levelUpReward = reward;
      }
    }
    // Award 1 boost token every even level
    if (result.newLevel % 2 === 0) {
      bs.awardToken(req.user.username, 1);
      result.boostTokenAwarded = true;
    }
  }

  // Award boost token for achievement unlocks (1 per 5 achievements batch)
  if (result.unlocked.length >= 2) {
    bs.awardToken(req.user.username, 1);
    result.boostTokenAwarded = (result.boostTokenAwarded || false) || true;
  }

  if (result.unlocked.length > 0 || result.leveledUp) {
    io.emit('xpEvent', { username: req.user.username, ...result });
  }
  res.json({ ok: true, ...result });
});

// ── Daily Missions ─────────────────────────────────────────────────────────────

app.get('/api/missions', requireAuth, (req, res) => {
  const missions = ms.getMissions(req.user.username);
  res.json({ ok: true, missions });
});

app.post('/api/missions/claim/:id', requireAuth, (req, res) => {
  const result = ms.claimReward(req.user.username, req.params.id);
  if (!result.ok) return res.status(400).json(result);
  // Credit the reward
  const bonus = us.addBonusByAdmin(req.user.username, result.reward);
  if (bonus.ok) {
    io.emit('balanceReset', { username: req.user.username, balance: bonus.balance });
    al.log('mission_claimed', { username: req.user.username, missionId: req.params.id, reward: result.reward });
    xp.awardXP(req.user.username, Math.floor(result.reward / 10));
  }
  res.json({ ok: true, reward: result.reward, newBalance: bonus.balance });
});

// ── Coin Rain (admin) ──────────────────────────────────────────────────────────

app.post('/api/admin/coin-rain', requireAdmin, (req, res) => {
  const { amount = 1000, message = '🌧️ Coin Rain!' } = req.body || {};
  const amt = Math.min(Math.max(Math.floor(amount), 100), 1_000_000);

  // Credit all currently connected users
  const connectedSockets = [...io.sockets.sockets.values()];
  const credited = new Set();

  // We credit everyone in the users DB who has been online in last 30 mins
  const allUsers = us.getOnlineUsers ? us.getOnlineUsers(30) : [];
  for (const username of allUsers) {
    if (credited.has(username)) continue;
    credited.add(username);
    const r = us.addBonusByAdmin(username, amt);
    if (r.ok) io.emit('balanceReset', { username, balance: r.balance });
  }

  // Broadcast rain event to ALL clients (even offline ones will see it on next load)
  io.emit('coinRain', { amount: amt, message, creditedCount: credited.size });
  al.log('coin_rain', { admin: req.user.username, amount: amt, credited: credited.size });
  console.log(`[CoinRain] Admin dropped $${amt.toLocaleString()} on ${credited.size} user(s)`);
  res.json({ ok: true, amount: amt, credited: credited.size });
});

// ── Live Recent Wins (public feed) ─────────────────────────────────────────────

app.get('/api/wins/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
  const wins  = pw.getWins().slice(0, limit);
  res.json({ ok: true, wins });
});

// ── Wager Race ────────────────────────────────────────────────────────────────

app.get('/api/wager-race', (req, res) => {
  res.json({ ok: true, ...wr.getLeaderboard() });
});

app.get('/api/wager-race/prev', (req, res) => {
  res.json({ ok: true, prev: wr.getPrevWinners() });
});

// Admin: manually trigger wager race payout
app.post('/api/admin/wager-race/payout', requireAdmin, (req, res) => {
  const payouts = wr.payoutAndReset();
  const errors  = [];
  for (const { username, prize } of payouts) {
    const r = us.addBonusByAdmin(username, prize);
    if (r.ok) {
      io.emit('balanceReset', { username, balance: r.balance });
      io.emit('wagerRaceWin', { username, prize, rank: payouts.indexOf({ username, prize }) + 1 });
    } else errors.push(username);
  }
  al.log('wager_race_payout', { payouts });
  res.json({ ok: true, payouts, errors });
});

// ── Lottery ───────────────────────────────────────────────────────────────────

app.get('/api/lottery', (req, res) => {
  const status = lt.getStatus();
  const myTickets = req.query.u ? lt.getUserTickets(req.query.u) : [];
  res.json({ ok: true, ...status, myTickets });
});

app.get('/api/lottery/my-tickets', requireAuth, (req, res) => {
  res.json({ ok: true, tickets: lt.getUserTickets(req.user.username), status: lt.getStatus() });
});

app.post('/api/lottery/buy', requireAuth, (req, res) => {
  // Admins cannot participate in the lottery
  if (us.isAdminToken(getToken(req))) {
    return res.status(403).json({ ok: false, error: 'Admins cannot participate in the lottery' });
  }
  // Charge the player — check balance first
  const me = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if ((me.balance || 0) < lt.TICKET_PRICE) {
    return res.status(400).json({ ok: false, error: `Insufficient balance — you need $${lt.TICKET_PRICE.toLocaleString()} to buy a ticket` });
  }

  const result = lt.buyTicket(req.user.username);
  if (!result.ok) return res.status(400).json(result);

  // Deduct ticket cost server-side
  const deductResult = us.addBonusByAdmin(req.user.username, -lt.TICKET_PRICE);
  if (deductResult.ok) io.emit('balanceReset', { username: req.user.username, balance: deductResult.balance });

  al.log('lottery_ticket', { username: req.user.username, ticketId: result.ticketId });
  res.json({ ok: true, ...result });
});

app.post('/api/admin/lottery/draw', requireAdmin, (req, res) => {
  const result = lt.drawWinner();
  if (result.winner) {
    const r = us.addBonusByAdmin(result.winner, result.jackpot);
    if (r.ok) io.emit('balanceReset', { username: result.winner, balance: r.balance });
    io.emit('lotteryDraw', { winner: result.winner, jackpot: result.jackpot });
    al.log('lottery_draw', { winner: result.winner, jackpot: result.jackpot });
    console.log(`[Lottery] 🎟️ Winner: ${result.winner} wins $${result.jackpot.toLocaleString()}`);
  }
  res.json({ ok: true, ...result });
});

// ── VIP Status ────────────────────────────────────────────────────────────────

app.get('/api/vip', requireAuth, (req, res) => {
  const profile = xp.getProfile(req.user.username);
  const totalWagered = profile?.totalWagered || 0;
  const tierInfo = vip.getTierForWagered(totalWagered);
  res.json({ ok: true, vip: tierInfo });
});

// /tiers must come BEFORE /:username so it isn't eaten as a username param
app.get('/api/vip/tiers', (req, res) => {
  res.json({ ok: true, tiers: vip.VIP_TIERS });
});

app.get('/api/vip/:username', (req, res) => {
  const profile = xp.getProfile(req.params.username.toLowerCase());
  const totalWagered = profile?.totalWagered || 0;
  res.json({ ok: true, vip: vip.getTierForWagered(totalWagered) });
});

// ── PvP Coin Flip Challenges ──────────────────────────────────────────────────

app.get('/api/pvp/challenges', (req, res) => {
  res.json({ ok: true, challenges: pvp.getOpenChallenges(), results: pvp.getRecentResults(10) });
});

app.get('/api/pvp/my-challenges', requireAuth, (req, res) => {
  res.json({ ok: true, challenges: pvp.getUserChallenges(req.user.username) });
});

app.post('/api/pvp/challenge', requireAuth, (req, res) => {
  if (us.isAdminToken(getToken(req))) {
    return res.status(403).json({ ok: false, error: 'Admins cannot create PvP challenges' });
  }
  const { opponent, amount } = req.body || {};
  const amt = Math.floor(Number(amount));
  const result = pvp.createChallenge(req.user.username, opponent?.toLowerCase() || null, amt);
  if (!result.ok) return res.status(400).json(result);

  // Escrow: deduct from challenger immediately
  const r = us.addBonusByAdmin(req.user.username, -amt);
  if (!r.ok) {
    pvp.cancelChallenge(result.id, req.user.username);
    return res.status(400).json({ ok: false, error: 'Insufficient balance' });
  }
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  io.emit('newPvpChallenge', { challenger: req.user.username, amount: amt, id: result.id, opponent: opponent || null });
  res.json({ ok: true, ...result });
});

app.post('/api/pvp/accept/:id', requireAuth, (req, res) => {
  if (us.isAdminToken(getToken(req))) {
    return res.status(403).json({ ok: false, error: 'Admins cannot accept PvP challenges' });
  }
  // Pre-check: get challenge details for balance deduction
  const challenges = pvp.getOpenChallenges();
  const challenge  = challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ ok: false, error: 'Challenge not found or expired' });

  // Deduct from acceptor
  const deduct = us.addBonusByAdmin(req.user.username, -challenge.amount);
  if (!deduct.ok) return res.status(400).json({ ok: false, error: 'Insufficient balance' });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });

  const result = pvp.acceptChallenge(req.params.id, req.user.username);
  if (!result.ok) {
    // Refund acceptor if something went wrong
    const refund = us.addBonusByAdmin(req.user.username, challenge.amount);
    if (refund.ok) io.emit('balanceReset', { username: req.user.username, balance: refund.balance });
    return res.status(400).json(result);
  }

  // Pay winner 2× (both stakes)
  const prize = challenge.amount * 2;
  const pay   = us.addBonusByAdmin(result.winner, prize);
  if (pay.ok) io.emit('balanceReset', { username: result.winner, balance: pay.balance });

  // Refund challenger if they lost (they already had amount deducted; winner is paid 2x)
  // If challenger lost, refund is 0 (challenger already paid). If acceptor lost, 0 refund too.
  // Simple: winner gets 2x, loser gets 0. Already handled above.

  io.emit('pvpResult', { id: result.id, winner: result.winner, loser: result.loser, flip: result.flip, amount: challenge.amount, prize });
  al.log('pvp_result', { winner: result.winner, loser: result.loser, amount: challenge.amount });
  res.json({ ok: true, ...result, prize });
});

app.delete('/api/pvp/challenge/:id', requireAuth, (req, res) => {
  const challenges = pvp.getOpenChallenges();
  const challenge  = challenges.find(c => c.id === req.params.id && c.challenger === req.user.username);
  if (!challenge) return res.status(404).json({ ok: false, error: 'Not found' });

  const result = pvp.cancelChallenge(req.params.id, req.user.username);
  if (result.ok) {
    // Refund escrowed amount
    const r = us.addBonusByAdmin(req.user.username, challenge.amount);
    if (r.ok) io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  }
  res.json(result);
});

// ── Community Rain Pool ────────────────────────────────────────────────────────

app.get('/api/rain/status', (req, res) => {
  res.json({ ok: true, ...cr.getStatus() });
});

app.post('/api/rain/contribute', requireAuth, (req, res) => {
  const { amount } = req.body || {};
  const amt = Math.min(Math.max(Math.floor(Number(amount) || cr.CONTRIBUTION_MIN), cr.CONTRIBUTION_MIN), cr.CONTRIBUTION_MAX);

  // Anyone logged in can contribute; admin sentinel has infinite balance.
  const deduct = us.spendBalance(req.user.username, amt);
  if (!deduct.ok) return res.status(400).json({ ok: false, error: deduct.error || 'Insufficient balance' });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });

  cr.addContributor(req.user.username, amt);
  const result = cr.contribute(amt);

  // Broadcast pool update to everyone
  io.emit('rainPoolUpdate', { pool: result.pool, target: result.target, contributor: req.user.username, amount: amt });

  if (result.fired) {
    // Pool hit target — pay out to all recently-online users
    const onlineUsers = us.getOnlineUsers ? us.getOnlineUsers(30) : [];
    const payout = cr.collectPool(onlineUsers);
    if (payout) {
      for (const username of payout.players) {
        const r = us.addBonusByAdmin(username, payout.perUser);
        if (r.ok) io.emit('balanceReset', { username, balance: r.balance });
      }
      io.emit('communityRain', {
        totalPool: payout.totalPool,
        perUser:   payout.perUser,
        players:   payout.players.length,
        triggeredBy: req.user.username,
      });
      al.log('community_rain', { totalPool: payout.totalPool, perUser: payout.perUser, players: payout.players.length });
      console.log(`[CommunityRain] 💧 Pool exploded! $${payout.totalPool.toLocaleString()} split among ${payout.players.length} users ($${payout.perUser.toLocaleString()} each)`);
    }
  }

  res.json({ ok: true, ...cr.getStatus() });
});

// ── Mystery Box ────────────────────────────────────────────────────────────────

app.get('/api/mystery-box', requireAuth, (req, res) => {
  res.json({ ok: true, ...mb.getStatus(req.user.username) });
});

app.post('/api/mystery-box/claim', requireAuth, (req, res) => {
  const result = mb.claim(req.user.username);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  // Credit reward
  const r = us.addBonusByAdmin(req.user.username, result.reward.amount);
  if (r.ok) {
    io.emit('balanceReset', { username: req.user.username, balance: r.balance });
    // If it's a legendary reward, announce it to everyone
    if (result.reward.tier === 'legendary') {
      io.emit('bigWin', {
        username:   req.user.username,
        game:       'mystery-box',
        profit:     result.reward.amount,
        multiplier: null,
        timestamp:  Date.now(),
      });
    }
  }
  al.log('mystery_box', { username: req.user.username, reward: result.reward });
  bh.log(req.user.username, { type: 'mystery-box', amount: result.reward.amount, balance: r.balance, description: `${result.reward.tier} Mystery Box: ${result.reward.label}` });
  res.json({ ok: true, reward: result.reward, newBalance: r.balance });
});

// ── News / Announcements ──────────────────────────────────────────────────────

app.get('/api/news', (req, res) => {
  res.json({ ok: true, news: ns.getNews() });
});

app.post('/api/admin/news', requireAdmin, (req, res) => {
  const { title, body, type, pinned } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Title required' });
  const item = ns.postNews({ title, body, type, pinned, adminName: req.user.username });
  io.emit('newsBroadcast', item);
  al.log('news_post', { admin: req.user.username, title });
  res.json({ ok: true, item });
});

app.delete('/api/admin/news/:id', requireAdmin, (req, res) => {
  ns.deleteNews(req.params.id);
  io.emit('newsDeleted', { id: req.params.id });
  res.json({ ok: true });
});

app.patch('/api/admin/news/:id/pin', requireAdmin, (req, res) => {
  ns.pinNews(req.params.id, !!req.body?.pinned);
  res.json({ ok: true });
});

// ── Boost Tokens ──────────────────────────────────────────────────────────────

app.get('/api/boost', requireAuth, (req, res) => {
  res.json({ ok: true, ...bs.getStatus(req.user.username) });
});

app.post('/api/boost/activate', requireAuth, (req, res) => {
  const result = bs.activateBoost(req.user.username);
  if (!result.ok) return res.status(400).json(result);
  io.emit('boostActivated', { username: req.user.username, until: result.activeUntil });
  al.log('boost_activated', { username: req.user.username });
  res.json({ ok: true, ...result });
});

// Admin: award boost tokens to a user
app.post('/api/admin/boost/award', requireAdmin, (req, res) => {
  const { username, count = 1 } = req.body || {};
  if (!username) return res.status(400).json({ ok: false, error: 'username required' });
  const result = bs.awardToken(username.toLowerCase(), Math.min(Math.max(1, count), 10));
  al.log('boost_award', { admin: req.user.username, username, count });
  res.json({ ok: true, ...result });
});

// ── Referral System ────────────────────────────────────────────────────────────

app.get('/api/referral', requireAuth, (req, res) => {
  const stats = rf.getStats(req.user.username);
  res.json({ ok: true, ...stats });
});

app.post('/api/referral/use', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'code required' });
  const result = rf.useCode(code, req.user.username);
  if (!result.ok) return res.status(400).json(result);
  // Award bonus to new user
  const newUserBonus = us.addBonusByAdmin(req.user.username, result.bonus);
  if (newUserBonus.ok) io.emit('balanceReset', { username: req.user.username, balance: newUserBonus.balance });
  // Award bonus to referrer
  const refBonus = us.addBonusByAdmin(result.referredBy, result.bonus);
  if (refBonus.ok) {
    io.emit('balanceReset', { username: result.referredBy, balance: refBonus.balance });
    io.emit('referralBonus', { username: result.referredBy, newUser: req.user.username, bonus: result.bonus });
  }
  al.log('referral_used', { newUser: req.user.username, referredBy: result.referredBy });
  res.json({ ok: true, bonus: result.bonus });
});

// ── Daily Check-in Streak ─────────────────────────────────────────────────────

app.get('/api/checkin', requireAuth, (req, res) => {
  res.json({ ok: true, ...ci.getStatus(req.user.username) });
});

app.post('/api/checkin', requireAuth, (req, res) => {
  const result = ci.claim(req.user.username);
  if (!result.ok) return res.status(400).json(result);
  const r = us.addBonusByAdmin(req.user.username, result.reward);
  if (r.ok) {
    io.emit('balanceReset', { username: req.user.username, balance: r.balance });
    bh.log(req.user.username, { type: 'check-in', amount: result.reward, balance: r.balance, description: `Day ${result.streak} check-in` });
  }
  if (result.isWeekly) {
    io.emit('bigWin', { username: req.user.username, game: 'check-in', profit: result.reward, multiplier: null, timestamp: Date.now() });
  }
  al.log('checkin', { username: req.user.username, streak: result.streak, reward: result.reward });
  res.json({ ok: true, ...result, newBalance: r.balance });
});

// ── Player Titles ─────────────────────────────────────────────────────────────

app.get('/api/titles', requireAuth, (req, res) => {
  const profile = xp.getProfile(req.user.username);
  const unlocked = tl.getUnlockedTitles(profile?.achievements || []);
  const equipped = tl.getEquipped(req.user.username);
  res.json({ ok: true, unlocked, equipped, all: tl.TITLES });
});

app.post('/api/titles/equip', requireAuth, (req, res) => {
  const { titleId } = req.body || {};
  // Verify user has unlocked this title
  const profile = xp.getProfile(req.user.username);
  const unlocked = tl.getUnlockedTitles(profile?.achievements || []);
  if (titleId !== null && !unlocked.find(t => t.id === titleId)) {
    return res.status(403).json({ ok: false, error: 'Title not unlocked' });
  }
  const result = tl.equipTitle(req.user.username, titleId);
  res.json(result);
});

// ── Lucky Numbers ─────────────────────────────────────────────────────────────

app.get('/api/lucky-numbers', (req, res) => {
  res.json({ ok: true, numbers: ln.getTodaysNumbers() });
});

// ── Prestige ──────────────────────────────────────────────────────────────────

app.get('/api/prestige', requireAuth, (req, res) => {
  const prestige = pr.getPrestige(req.user.username);
  const profile  = xp.getProfile(req.user.username);
  res.json({ ok: true, prestige, canPrestige: pr.canPrestige(profile?.level || 0), titles: pr.PRESTIGE_TITLES });
});

app.post('/api/prestige', requireAuth, (req, res) => {
  const profile = xp.getProfile(req.user.username);
  const result  = pr.prestige(req.user.username, profile?.level || 0);
  if (!result.ok) return res.status(400).json(result);
  // Award prestige bonus
  const r = us.addBonusByAdmin(req.user.username, result.bonus);
  if (r.ok) io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  // Reset XP to level 1 (award negative XP to bring to 0, then re-level)
  if (profile) {
    xp.resetXP(req.user.username);
  }
  io.emit('prestigeEvent', { username: req.user.username, prestige: result.prestige });
  al.log('prestige', { username: req.user.username, level: result.prestige.level });
  res.json({ ok: true, ...result, bonus: result.bonus, newBalance: r.balance });
});

// ── Today's Top Winners ────────────────────────────────────────────────────────

app.get('/api/wins/today', (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  // Pull from public store (broader feed) so the daily leaderboard isn't
  // empty when there are no $5M whale wins.
  const wins = pw.getWins()
    .filter(w => w.timestamp >= todayStart.getTime())
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 20);
  res.json({ ok: true, wins });
});

// ── Balance History ────────────────────────────────────────────────────────────

app.get('/api/balance-history', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 50);
  const history = bh.getHistory(req.user.username, limit);
  res.json({ ok: true, history });
});

// ── Jackpot Rush ───────────────────────────────────────────────────────────────

app.get('/api/jackpot-rush', (req, res) => {
  res.json({ ok: true, ...jr.getStatus() });
});

app.post('/api/admin/jackpot-rush/start', requireOwner, (req, res) => {
  const status = jr.forceStart();
  io.emit('jackpotRushStarted', status);
  res.json({ ok: true, ...status });
});

// Hourly check (every 60 minutes)
setInterval(() => {
  const result = jr.tryTrigger();
  if (result.triggered) {
    io.emit('jackpotRushStarted', jr.getStatus());
    console.log('[jackpotRush] Rush triggered!');
  }
}, 60 * 60 * 1000);
// Also check shortly after startup
setTimeout(() => {
  const result = jr.tryTrigger();
  if (result.triggered) io.emit('jackpotRushStarted', jr.getStatus());
}, 5000);

// ── Daily Goals ────────────────────────────────────────────────────────────────

app.get('/api/daily-goals', requireAuth, (req, res) => {
  const status = dg.getStatus(req.user.username);
  res.json({ ok: true, ...status });
});

app.post('/api/daily-goals/claim', requireAuth, (req, res) => {
  const { tierId } = req.body || {};
  const result = dg.claimTier(req.user.username, tierId);
  if (!result.ok) return res.status(400).json(result);
  // Award the bonus
  const r = us.addBonusByAdmin(req.user.username, result.tier.bonus);
  bh.log(req.user.username, {
    type: 'daily-goal', amount: result.tier.bonus, balance: r.balance,
    description: `Daily Goal: ${result.tier.label} (wager ${result.tier.target.toLocaleString()})`,
  });
  res.json({ ok: true, tier: result.tier, balance: r.balance });
});

// ── Emoji reactions on wins ─────────────────────────────────────────────────────

app.post('/api/wins/react', (req, res) => {
  const { winId, emoji } = req.body || {};
  const result = er.react(winId, emoji, req.ip);
  if (!result.ok) return res.status(400).json(result);
  // Broadcast to all clients
  io.emit('winReaction', { winId, reactions: result.reactions });
  res.json(result);
});

app.get('/api/wins/react/:winId', (req, res) => {
  res.json({ ok: true, reactions: er.getReactions(req.params.winId) });
});

// ── Win Streak Leaderboard ─────────────────────────────────────────────────────

app.get('/api/leaderboard/streaks', (req, res) => {
  // Get all XP profiles and sort by current win streak
  const allProfiles = xp.getTopPlayers(500);
  const players = allProfiles
    .map(p => {
      const full = xp.getProfile(p.username);
      return { username: p.username, streak: full?.winStreak || 0 };
    })
    .filter(p => p.streak >= 3)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 20);
  res.json({ ok: true, players });
});

// ── Crypto Investing ──────────────────────────────────────────────────────────

app.get('/api/crypto/prices', (req, res) => {
  const prices = cryptoFeed.getPriceList();
  res.json({ ok: true, prices, lastFetch: cryptoFeed.getLastFetch() });
});

app.get('/api/crypto/portfolio', requireAuth, (req, res) => {
  const portfolio = cryptoPortfolio.getPortfolio(req.user.username);
  res.json({ ok: true, ...portfolio });
});

app.post('/api/crypto/buy', requireAuth, (req, res) => {
  const { coinId, amountUSD } = req.body || {};
  if (!coinId || !amountUSD) return res.status(400).json({ ok: false, error: 'Missing coinId or amountUSD' });
  const amt = Math.round(parseFloat(amountUSD));
  const spend = us.spendBalance(req.user.username, amt);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error });
  const result = cryptoPortfolio.buy(req.user.username, coinId, amt);
  if (!result.ok) {
    // Refund if portfolio action failed
    us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(result);
  }
  bh.log(req.user.username, { type: 'crypto-buy', amount: -amt, balance: spend.balance, description: `Bought ${coinId} @ $${result.entryPrice?.toLocaleString()}` });
  res.json({ ...result, balance: spend.balance });
});

app.post('/api/crypto/sell', requireAuth, (req, res) => {
  const { coinId } = req.body || {};
  if (!coinId) return res.status(400).json({ ok: false, error: 'Missing coinId' });
  const result = cryptoPortfolio.sell(req.user.username, coinId);
  if (!result.ok) return res.status(400).json(result);
  // Credit payout
  const r = us.addBonusByAdmin(req.user.username, result.payout);
  bh.log(req.user.username, { type: 'crypto-sell', amount: result.pnl, balance: r.balance, description: `Sold ${coinId} @ $${result.exitPrice} — P&L ${result.pnl >= 0 ? '+' : ''}$${result.pnl.toFixed(2)}` });
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  res.json({ ...result, balance: r.balance });
});

app.post('/api/crypto/short', requireAuth, (req, res) => {
  const { coinId, amountUSD } = req.body || {};
  if (!coinId || !amountUSD) return res.status(400).json({ ok: false, error: 'Missing coinId or amountUSD' });
  const amt = Math.round(parseFloat(amountUSD));
  const spend = us.spendBalance(req.user.username, amt);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error });
  const result = cryptoPortfolio.short(req.user.username, coinId, amt);
  if (!result.ok) {
    us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(result);
  }
  bh.log(req.user.username, { type: 'crypto-short', amount: -amt, balance: spend.balance, description: `Shorted ${coinId} @ $${result.entryPrice?.toLocaleString()}` });
  res.json({ ...result, balance: spend.balance });
});

app.post('/api/crypto/close-short', requireAuth, (req, res) => {
  const { coinId } = req.body || {};
  if (!coinId) return res.status(400).json({ ok: false, error: 'Missing coinId' });
  const result = cryptoPortfolio.closeShort(req.user.username, coinId);
  if (!result.ok) return res.status(400).json(result);
  const r = us.addBonusByAdmin(req.user.username, result.payout);
  bh.log(req.user.username, { type: 'crypto-close-short', amount: result.pnl, balance: r.balance, description: `Closed short ${coinId} @ $${result.exitPrice} — P&L ${result.pnl >= 0 ? '+' : ''}$${result.pnl.toFixed(2)}` });
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  res.json({ ...result, balance: r.balance });
});

// ── Bank / Vault ───────────────────────────────────────────────────────────────

app.get('/api/bank/positions', requireAuth, (req, res) => {
  res.json({ ok: true, positions: bank.getPositions(req.user.username), tiers: bank.getTiers() });
});

app.post('/api/bank/deposit', requireAuth, (req, res) => {
  const { tier, amount } = req.body || {};
  const amt = Math.floor(Number(amount) || 0);
  if (amt < 1000) return res.status(400).json({ ok: false, error: 'Min deposit: 1,000' });
  const deduct = us.spendBalance(req.user.username, amt);
  if (!deduct.ok) return res.status(400).json(deduct);
  const result = bank.deposit(req.user.username, tier, amt);
  if (!result.ok) {
    // refund
    us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(result);
  }
  bh.log(req.user.username, { type: 'bank-deposit', amount: -amt, balance: deduct.balance, description: `Bank deposit (${tier})` });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  if (amt >= 100000) liveFeed.push('bank-deposit', { user: req.user.username, amount: amt, tier });
  res.json({ ...result, balance: deduct.balance });
});

app.post('/api/bank/withdraw', requireAuth, (req, res) => {
  const { positionId } = req.body || {};
  const result = bank.withdraw(req.user.username, positionId);
  if (!result.ok) return res.status(400).json(result);
  const r = us.addBonusByAdmin(req.user.username, result.payout);
  bh.log(req.user.username, { type: 'bank-withdraw', amount: result.payout, balance: r.balance, description: `Bank withdraw` });
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  res.json({ ...result, balance: r.balance });
});

// ── Flash Events ───────────────────────────────────────────────────────────────

app.get('/api/flash-events/current', (req, res) => {
  res.json({ ok: true, event: flashEvents.getCurrent(), types: flashEvents.getTypes() });
});

app.post('/api/admin/flash-events/trigger', requireAdmin, (req, res) => {
  const { type } = req.body || {};
  const ev = flashEvents.trigger(type);
  io.emit('flashEventStart', ev);
  al.log('flash_event_triggered', { admin: req.user.username, type: ev.type });
  res.json({ ok: true, event: ev });
});

// Background tick — try to trigger random events (called periodically).
setInterval(() => {
  const ev = flashEvents.tick();
  if (ev) {
    io.emit('flashEventStart', ev);
    console.log(`[FlashEvents] ⚡ ${ev.info.name} started (${Math.round((ev.endsAt - ev.startedAt)/1000)}s)`);
  }
}, 120_000); // every 2 min

// ── Crypto: historical chart ──────────────────────────────────────────────────

app.get('/api/crypto/chart/:coinId', async (req, res) => {
  const { coinId } = req.params;
  const days = ['1', '7', '30', '90'].includes(String(req.query.days)) ? String(req.query.days) : '1';
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Upstream failed' });
    const d = await r.json();
    // prices: [[timestamp, price], ...]
    res.json({ ok: true, coinId, days, prices: d.prices || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Chart fetch failed' });
  }
});

// ── Crypto: limit orders ──────────────────────────────────────────────────────

app.get('/api/crypto/orders', requireAuth, (req, res) => {
  res.json({ ok: true, orders: cryptoOrders.getUserOrders(req.user.username) });
});

app.post('/api/crypto/orders', requireAuth, (req, res) => {
  const { type, coinId, amountUSD, targetPrice, direction } = req.body || {};
  const amt = Math.floor(Number(amountUSD) || 0);

  // For buy / short, reserve the funds NOW by spending balance (so user can't overspend)
  if (type === 'buy' || type === 'short') {
    if (amt < 100) return res.status(400).json({ ok: false, error: 'Min amount: 100' });
    const deduct = us.spendBalance(req.user.username, amt);
    if (!deduct.ok) return res.status(400).json(deduct);
    io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  }

  const result = cryptoOrders.placeOrder(req.user.username, { type, coinId, amountUSD: amt, targetPrice, direction });
  if (!result.ok) {
    // refund if we pre-deducted
    if (type === 'buy' || type === 'short') us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(result);
  }
  res.json(result);
});

app.delete('/api/crypto/orders/:id', requireAuth, (req, res) => {
  const order = cryptoOrders.getUserOrders(req.user.username).find(o => o.id === req.params.id);
  const result = cryptoOrders.cancelOrder(req.user.username, req.params.id);
  if (!result.ok) return res.status(400).json(result);
  // Refund reserved funds for pending buy/short
  if (order && (order.type === 'buy' || order.type === 'short') && order.status === 'pending') {
    const r = us.addBonusByAdmin(req.user.username, order.amountUSD);
    io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  }
  res.json(result);
});

// Check limit orders on every price tick (called by cryptoPriceFeed after update).
if (typeof cryptoFeed.onPriceUpdate === 'function') {
  cryptoFeed.onPriceUpdate((prices) => {
    // prices is array of { id, symbol, usd, ... } — convert to { id: usd }
    const priceMap = {};
    for (const p of prices) priceMap[p.id] = p.usd;
    const triggered = cryptoOrders.checkTriggers(priceMap);
    for (const o of triggered) {
      try {
        let result;
        if (o.type === 'buy')          result = cryptoPortfolio.buy(o.username, o.coinId, o.amountUSD);
        else if (o.type === 'short')   result = cryptoPortfolio.short(o.username, o.coinId, o.amountUSD);
        else if (o.type === 'sell')    result = cryptoPortfolio.sell(o.username, o.coinId);
        else if (o.type === 'close-short') result = cryptoPortfolio.closeShort(o.username, o.coinId);
        if (result && result.ok && result.payout) us.addBonusByAdmin(o.username, result.payout);
        cryptoOrders.markExecuted(o.id, result || { ok: false });
        io.emit('cryptoOrderFilled', { username: o.username, order: o, result });
      } catch (e) {
        cryptoOrders.markExecuted(o.id, { ok: false, error: e.message });
      }
    }
  });
}

// ── Prediction Markets ────────────────────────────────────────────────────────

app.get('/api/prediction-markets', (req, res) => {
  res.json({ ok: true, markets: predMarket.listMarkets(), sharePrice: predMarket.SHARE_PRICE, payout: predMarket.PAYOUT });
});

app.get('/api/prediction-markets/mine', requireAuth, (req, res) => {
  res.json({ ok: true, bets: predMarket.getMyBets(req.user.username) });
});

app.post('/api/prediction-markets/buy', requireAuth, (req, res) => {
  const { marketId, side, shares } = req.body || {};
  const n = Math.floor(Number(shares) || 0);
  if (n < 1) return res.status(400).json({ ok: false, error: 'Invalid share count' });
  const cost = n * predMarket.SHARE_PRICE;
  const deduct = us.spendBalance(req.user.username, cost);
  if (!deduct.ok) return res.status(400).json(deduct);
  const result = predMarket.buyShares(req.user.username, marketId, side, n);
  if (!result.ok) {
    us.addBonusByAdmin(req.user.username, cost);
    return res.status(400).json(result);
  }
  bh.log(req.user.username, { type: 'prediction-buy', amount: -cost, balance: deduct.balance, description: `Bought ${n} ${side.toUpperCase()} share(s)` });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  io.emit('predictionMarketUpdate', { market: result.market });
  if (n >= 5) liveFeed.push('prediction-buy', { user: req.user.username, question: result.market.question, side, shares: n, cost });
  res.json({ ...result, balance: deduct.balance });
});

app.post('/api/admin/prediction-markets', requireAdmin, (req, res) => {
  const { question, description, endsAt } = req.body || {};
  const result = predMarket.createMarket({ question, description, endsAt });
  if (result.ok) {
    io.emit('predictionMarketCreated', { market: result.market });
    al.log('prediction_market_created', { admin: req.user.username, marketId: result.market.id });
  }
  res.json(result);
});

app.post('/api/admin/prediction-markets/:id/resolve', requireAdmin, (req, res) => {
  const { outcome } = req.body || {};
  const result = predMarket.resolveMarket(req.params.id, outcome);
  if (!result.ok) return res.status(400).json(result);
  for (const p of result.payouts) {
    const r = us.addBonusByAdmin(p.username, p.amount);
    if (r.ok) {
      io.emit('balanceReset', { username: p.username, balance: r.balance });
      bh.log(p.username, { type: 'prediction-payout', amount: p.amount, balance: r.balance, description: `Prediction market resolved ${outcome}` });
    }
  }
  io.emit('predictionMarketResolved', { market: result.market, outcome });
  liveFeed.push('prediction-resolve', { question: result.market.question, outcome, winnerCount: result.payouts.length });
  al.log('prediction_market_resolved', { admin: req.user.username, marketId: req.params.id, outcome, payouts: result.payouts.length });
  res.json({ ok: true, payouts: result.payouts.length });
});

// ── Meme Coin Creator ─────────────────────────────────────────────────────────

app.get('/api/meme-coins', (req, res) => {
  res.json({ ok: true, coins: memeCoins.listCoins(), creationFee: memeCoins.CREATION_FEE });
});

app.get('/api/meme-coins/holdings', requireAuth, (req, res) => {
  res.json({ ok: true, holdings: memeCoins.getHoldings(req.user.username) });
});

app.post('/api/meme-coins/create', requireAuth, (req, res) => {
  const { name, symbol, emoji } = req.body || {};
  const fee = memeCoins.CREATION_FEE;
  const deduct = us.spendBalance(req.user.username, fee);
  if (!deduct.ok) return res.status(400).json(deduct);
  const result = memeCoins.createCoin(req.user.username, { name, symbol, emoji });
  if (!result.ok) {
    us.addBonusByAdmin(req.user.username, fee);
    return res.status(400).json(result);
  }
  bh.log(req.user.username, { type: 'meme-coin-create', amount: -fee, balance: deduct.balance, description: `Launched $${result.coin.symbol}` });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  io.emit('memeCoinCreated', { coin: result.coin });
  liveFeed.push('meme-launch', { user: req.user.username, symbol: result.coin.symbol, name: result.coin.name, emoji: result.coin.emoji });
  res.json({ ...result, balance: deduct.balance });
});

app.post('/api/meme-coins/buy', requireAuth, (req, res) => {
  const { symbol, amountUSD } = req.body || {};
  const amt = Math.floor(Number(amountUSD) || 0);
  if (amt < 100) return res.status(400).json({ ok: false, error: 'Min buy: 100' });
  const deduct = us.spendBalance(req.user.username, amt);
  if (!deduct.ok) return res.status(400).json(deduct);
  const result = memeCoins.buyCoin(req.user.username, symbol, amt);
  if (!result.ok) {
    us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(result);
  }
  // Pay creator fee
  if (result.creatorCut > 0 && result.coin.creator !== req.user.username.toLowerCase()) {
    us.addBonusByAdmin(result.coin.creator, result.creatorCut);
  }
  bh.log(req.user.username, { type: 'meme-coin-buy', amount: -amt, balance: deduct.balance, description: `Bought $${symbol}` });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  io.emit('memeCoinTrade', { coin: result.coin, type: 'buy' });
  if (amt >= 1000) liveFeed.push('meme-trade', { user: req.user.username, symbol, amount: amt, type: 'buy' });
  res.json({ ...result, balance: deduct.balance });
});

app.post('/api/meme-coins/sell', requireAuth, (req, res) => {
  const { symbol, tokens } = req.body || {};
  const result = memeCoins.sellCoin(req.user.username, symbol, Number(tokens));
  if (!result.ok) return res.status(400).json(result);
  const r = us.addBonusByAdmin(req.user.username, result.payout);
  if (result.creatorCut > 0 && result.coin.creator !== req.user.username.toLowerCase()) {
    us.addBonusByAdmin(result.coin.creator, result.creatorCut);
  }
  bh.log(req.user.username, { type: 'meme-coin-sell', amount: result.payout, balance: r.balance, description: `Sold $${symbol}` });
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  io.emit('memeCoinTrade', { coin: result.coin, type: 'sell' });
  if (result.payout >= 1000) liveFeed.push('meme-trade', { user: req.user.username, symbol, amount: result.payout, type: 'sell' });
  res.json({ ...result, balance: r.balance });
});

// ── Wishing Well ──────────────────────────────────────────────────────────────

app.get('/api/wishing-well', (req, res) => {
  res.json({ ok: true, ...wishingWell.getStatus() });
});

app.post('/api/wishing-well/throw', requireAuth, (req, res) => {
  const cost = wishingWell.THROW_AMOUNT;
  const deduct = us.spendBalance(req.user.username, cost);
  if (!deduct.ok) return res.status(400).json(deduct);
  const r = wishingWell.throwIn(req.user.username);
  if (!r.ok) {
    us.addBonusByAdmin(req.user.username, cost);
    return res.status(400).json(r);
  }
  bh.log(req.user.username, { type: 'wishing-well', amount: -cost, balance: deduct.balance, description: 'Wishing Well entry' });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  io.emit('wishingWellThrow', { username: req.user.username, wishes: r.wishes, nextDrawIn: r.nextDrawIn });
  res.json({ ok: true, ...r, balance: deduct.balance });
});

// Tick every minute — draw winner if enough time passed
setInterval(() => {
  const result = wishingWell.draw();
  if (result) {
    const r = us.addBonusByAdmin(result.winner, result.prize);
    if (r.ok) io.emit('balanceReset', { username: result.winner, balance: r.balance });
    bh.log(result.winner, { type: 'wishing-well-win', amount: result.prize, balance: r.balance, description: `🌟 Wishing Well jackpot!` });
    io.emit('wishingWellWinner', result);
    liveFeed.push('wishing-well-win', result);
    al.log('wishing_well_win', result);
    console.log(`[WishingWell] 🌟 ${result.winner} won $${result.prize} from ${result.participants} wishes`);
  }
}, 60_000);

// ── Daily Egg Hunt ───────────────────────────────────────────────────────────

app.get('/api/eggs', requireAuth, (req, res) => {
  res.json({ ok: true, ...eggHunt.getStatus(req.user.username), dailyMax: eggHunt.DAILY_EGGS });
});

app.post('/api/eggs/crack', requireAuth, (req, res) => {
  const result = eggHunt.crackEgg(req.user.username);
  if (!result.ok) return res.status(400).json(result);
  const r = us.addBonusByAdmin(req.user.username, result.reward.amount);
  bh.log(req.user.username, { type: 'egg-hunt', amount: result.reward.amount, balance: r.balance, description: `${result.reward.label} (${result.reward.rarity})` });
  io.emit('balanceReset', { username: req.user.username, balance: r.balance });
  if (result.reward.rarity === 'jackpot' || result.reward.rarity === 'mythic') {
    liveFeed.push('egg-jackpot', { user: req.user.username, reward: result.reward });
    io.emit('eggJackpot', { user: req.user.username, reward: result.reward });
  }
  res.json({ ok: true, ...result, balance: r.balance });
});

// ── Player Gifting ───────────────────────────────────────────────────────────

app.post('/api/gift', requireAuth, (req, res) => {
  const { recipient, amount, message = '' } = req.body || {};
  const amt = Math.floor(Number(amount) || 0);
  if (amt < 100)      return res.status(400).json({ ok: false, error: 'Minimum gift: 100' });
  if (amt > 500_000)  return res.status(400).json({ ok: false, error: 'Maximum gift: 500,000' });
  const rec = (recipient || '').trim().toLowerCase();
  if (!rec || rec === req.user.username.toLowerCase()) {
    return res.status(400).json({ ok: false, error: 'Invalid recipient' });
  }
  if (!us.userExists(rec)) return res.status(404).json({ ok: false, error: 'Recipient not found' });

  // 5% tax to burn (house take)
  const tax = Math.floor(amt * 0.05);
  const netGift = amt - tax;

  const deduct = us.spendBalance(req.user.username, amt);
  if (!deduct.ok) return res.status(400).json(deduct);
  const r = us.addBonusByAdmin(rec, netGift);
  bh.log(req.user.username, { type: 'gift-sent',     amount: -amt,     balance: deduct.balance, description: `Gift to ${rec}` });
  bh.log(rec,                { type: 'gift-received', amount: netGift, balance: r.balance,       description: `Gift from ${req.user.username}${message ? ': ' + String(message).slice(0,100) : ''}` });
  io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
  io.emit('balanceReset', { username: rec, balance: r.balance });
  io.emit('giftReceived', { from: req.user.username, to: rec, amount: netGift, message: String(message).slice(0, 100) });
  liveFeed.push('gift', { from: req.user.username, to: rec, amount: netGift });
  res.json({ ok: true, sent: amt, received: netGift, tax, balance: deduct.balance });
});

// ── 🏆 Tournaments ────────────────────────────────────────────────────────────

app.get('/api/tournaments', (req, res) => {
  res.json({
    ok: true,
    active:    tournaments.activeTournaments(),
    upcoming:  tournaments.upcomingTournaments(10),
    all:       tournaments.listAll().slice(0, 30),
  });
});

app.get('/api/tournaments/:id', (req, res) => {
  const t = tournaments.getById(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Not found' });
  const leaderboard = tournaments.getLeaderboard(req.params.id) || [];
  res.json({ ok: true, tournament: t, leaderboard });
});

app.post('/api/tournaments/:id/join', requireAuth, (req, res) => {
  const t = tournaments.getById(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'Not found' });
  if (t.entryFee > 0) {
    const deduct = us.spendBalance(req.user.username, t.entryFee);
    if (!deduct.ok) return res.status(400).json(deduct);
    io.emit('balanceReset', { username: req.user.username, balance: deduct.balance });
    bh.log(req.user.username, { type: 'tournament-join', amount: -t.entryFee, balance: deduct.balance, description: `Joined ${t.name}` });
  }
  const result = tournaments.join(req.params.id, req.user.username);
  if (!result.ok) {
    if (t.entryFee > 0) us.addBonusByAdmin(req.user.username, t.entryFee);
    return res.status(400).json(result);
  }
  io.emit('tournamentUpdate', { tournament: result.tournament });
  liveFeed.push('tournament-join', { user: req.user.username, name: t.name, prizePool: result.tournament.prizePool });
  res.json({ ok: true, tournament: result.tournament });
});

app.post('/api/admin/tournaments', requireAdmin, (req, res) => {
  const result = tournaments.create(req.body || {});
  if (!result.ok) return res.status(400).json(result);
  io.emit('tournamentCreated', { tournament: result.tournament });
  al.log('tournament_created', { admin: req.user.username, tournamentId: result.tournament.id, name: result.tournament.name });
  res.json(result);
});

app.post('/api/admin/tournaments/:id/cancel', requireAdmin, (req, res) => {
  const result = tournaments.cancel(req.params.id);
  if (!result.ok) return res.status(400).json(result);
  for (const p of result.payouts) {
    const r = us.addBonusByAdmin(p.username, p.amount);
    if (r.ok) io.emit('balanceReset', { username: p.username, balance: r.balance });
    bh.log(p.username, { type: 'tournament-refund', amount: p.amount, balance: r.balance, description: `Refund: ${result.tournament.name}` });
  }
  io.emit('tournamentUpdate', { tournament: result.tournament });
  al.log('tournament_cancelled', { admin: req.user.username, tournamentId: req.params.id });
  res.json({ ok: true });
});

// Auto-tick: activate scheduled tournaments and finalize expired ones
setInterval(() => {
  const { started, finalized } = tournaments.tick();
  for (const t of started) {
    io.emit('tournamentStarted', { tournament: t });
    liveFeed.push('tournament-started', { name: t.name, prizePool: t.prizePool, entries: t.entries.length });
    console.log(`[Tournaments] 🏁 "${t.name}" started (${t.entries.length} entries, prize pool $${t.prizePool})`);
  }
  for (const { tournament: t, payouts } of finalized) {
    for (const p of payouts) {
      const r = us.addBonusByAdmin(p.username, p.amount);
      if (r.ok) io.emit('balanceReset', { username: p.username, balance: r.balance });
      bh.log(p.username, { type: 'tournament-payout', amount: p.amount, balance: r.balance, description: `${t.name} — ${p.reason}` });
    }
    io.emit('tournamentEnded', { tournament: t, winners: t.winners });
    liveFeed.push('tournament-ended', { name: t.name, winners: t.winners });
    al.log('tournament_ended', { tournamentId: t.id, winners: t.winners });
    console.log(`[Tournaments] 🏆 "${t.name}" ended. Winners:`, t.winners.map(w => `${w.username}=$${w.prize}`).join(', '));
  }
}, 30_000);

// ── Season Pass ──────────────────────────────────────────────────────────────

app.get('/api/season-pass', (req, res) => {
  const tok = getToken(req);
  const u   = tok && us.validateToken(tok);
  res.json({ ok: true, ...seasonPass.getStatus(u), premiumCost: seasonPass.getPremiumCost() });
});

app.post('/api/season-pass/upgrade', requireAuth, (req, res) => {
  if (seasonPass.isPremium(req.user.username)) {
    return res.status(400).json({ ok: false, error: 'Already premium' });
  }
  const cost = seasonPass.getPremiumCost();
  const spend = us.spendBalance(req.user.username, cost);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  seasonPass.activatePremium(req.user.username);
  bh.log(req.user.username, { type: 'season-pass-premium', amount: -cost, balance: spend.balance, description: 'Season Pass Premium upgrade' });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  res.json({ ok: true, balance: spend.balance });
});

app.post('/api/season-pass/claim', requireAuth, (req, res) => {
  const { tier, track } = req.body || {};
  const r = seasonPass.claimTier(req.user.username, tier, track);
  if (!r.ok) return res.status(400).json(r);

  let balance = null;
  const reward = r.reward;
  if (reward.type === 'chips') {
    const b = us.addBonusByAdmin(req.user.username, reward.amount);
    if (b.ok) {
      balance = b.balance;
      bh.log(req.user.username, { type: 'season-pass-claim', amount: reward.amount, balance: b.balance, description: `Season Pass T${r.tier} (${r.track})` });
    }
  } else if (reward.type === 'xp') {
    xp.awardXP(req.user.username, reward.amount);
  } else if (reward.type === 'boost-token') {
    bs.awardToken(req.user.username, reward.amount || 1);
  } else if (reward.type === 'mystery-box') {
    // Grant a virtual box — if mystery box store has a grant method, use it; else add chip equivalent
    try {
      if (mb.grantBox) mb.grantBox(req.user.username, reward.tier);
      else {
        const fallback = reward.tier === 'legendary' ? 50_000 : reward.tier === 'gold' ? 15_000 : 5_000;
        const b = us.addBonusByAdmin(req.user.username, fallback);
        if (b.ok) balance = b.balance;
      }
    } catch {
      const fallback = reward.tier === 'legendary' ? 50_000 : reward.tier === 'gold' ? 15_000 : 5_000;
      const b = us.addBonusByAdmin(req.user.username, fallback);
      if (b.ok) balance = b.balance;
    }
  } else if (reward.type === 'title') {
    try { if (tl && tl.awardTitle) tl.awardTitle(req.user.username, reward.id); } catch {}
  }

  if (balance !== null) io.emit('balanceReset', { username: req.user.username, balance });
  res.json({ ok: true, reward, tier: r.tier, track: r.track, balance });
});

// ── Pet Companions ───────────────────────────────────────────────────────────

app.get('/api/pets', (req, res) => {
  const tok = getToken(req);
  const u   = tok && us.validateToken(tok);
  res.json({ ok: true, catalog: pets.listPets(), mine: u ? pets.getUserPet(u) : null });
});

app.post('/api/pets/adopt', requireAuth, (req, res) => {
  const { petId } = req.body || {};
  const catalog = pets.listPets();
  const chosen  = catalog.find(p => p.id === petId);
  if (!chosen) return res.status(400).json({ ok: false, error: 'Unknown pet' });
  const spend = us.spendBalance(req.user.username, chosen.cost);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  pets.adopt(req.user.username, petId);
  bh.log(req.user.username, { type: 'pet-adopt', amount: -chosen.cost, balance: spend.balance, description: `Adopted ${chosen.name}` });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  liveFeed.push('pet-adopt', { user: req.user.username, pet: chosen.name, emoji: chosen.emoji });
  res.json({ ok: true, balance: spend.balance, pet: pets.getUserPet(req.user.username) });
});

app.post('/api/pets/feed', requireAuth, (req, res) => {
  const amt = Math.floor(Number(req.body?.amount) || 0);
  if (amt < 100) return res.status(400).json({ ok: false, error: 'Feed at least 100 chips' });
  const spend = us.spendBalance(req.user.username, amt);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  const r = pets.feed(req.user.username, amt);
  if (!r.ok) {
    // Refund
    us.addBonusByAdmin(req.user.username, amt);
    return res.status(400).json(r);
  }
  bh.log(req.user.username, { type: 'pet-feed', amount: -amt, balance: spend.balance, description: `Fed pet (${amt} XP)` });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  res.json({ ok: true, balance: spend.balance, ...r, pet: pets.getUserPet(req.user.username) });
});

app.post('/api/pets/collect', requireAuth, (req, res) => {
  const r = pets.collectTip(req.user.username);
  if (!r.ok) return res.status(400).json(r);
  const b = us.addBonusByAdmin(req.user.username, r.amount);
  if (b.ok) {
    bh.log(req.user.username, { type: 'pet-tip', amount: r.amount, balance: b.balance, description: 'Pet passive tip' });
    io.emit('balanceReset', { username: req.user.username, balance: b.balance });
  }
  res.json({ ok: true, amount: r.amount, balance: b.balance, pet: pets.getUserPet(req.user.username) });
});

// ── Chip Factory (idle/tycoon) ──────────────────────────────────────────────

app.get('/api/factories', (req, res) => {
  const tok = getToken(req);
  const u   = tok && us.validateToken(tok);
  res.json({ ok: true, ...factories.getStatus(u) });
});

app.post('/api/factories/buy', requireAuth, (req, res) => {
  const { factoryId } = req.body || {};
  const f = factories.FACTORIES[factoryId];
  if (!f) return res.status(400).json({ ok: false, error: 'Unknown factory' });
  const status = factories.getStatus(req.user.username);
  if (status.owned[factoryId]) return res.status(400).json({ ok: false, error: 'Already owned' });
  const spend = us.spendBalance(req.user.username, f.baseCost);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  factories.buy(req.user.username, factoryId);
  bh.log(req.user.username, { type: 'factory-buy', amount: -f.baseCost, balance: spend.balance, description: `Bought ${f.name}` });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  res.json({ ok: true, balance: spend.balance, ...factories.getStatus(req.user.username) });
});

app.post('/api/factories/upgrade', requireAuth, (req, res) => {
  const { factoryId } = req.body || {};
  const status = factories.getStatus(req.user.username);
  const owned  = status.owned[factoryId];
  if (!owned) return res.status(400).json({ ok: false, error: 'Not owned' });
  if (owned.atMax) return res.status(400).json({ ok: false, error: 'Already max level' });
  const cost = owned.upgradeCost;
  const spend = us.spendBalance(req.user.username, cost);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  // Auto-collect the factory's pending chips first so the new level doesn't retroactively apply
  if (owned.pending > 0) {
    const creditR = us.addBonusByAdmin(req.user.username, owned.pending);
    if (creditR.ok) {
      bh.log(req.user.username, { type: 'factory-collect', amount: owned.pending, balance: creditR.balance, description: `Auto-collect before upgrade` });
    }
  }
  const r = factories.upgrade(req.user.username, factoryId);
  if (!r.ok) {
    // Refund cost
    us.addBonusByAdmin(req.user.username, cost);
    return res.status(400).json(r);
  }
  // Fetch final balance after potential credit + spend
  const finalBal = us.getBalance ? us.getBalance(req.user.username) : spend.balance;
  bh.log(req.user.username, { type: 'factory-upgrade', amount: -cost, balance: finalBal, description: `Upgrade ${factoryId} → L${r.newLevel}` });
  io.emit('balanceReset', { username: req.user.username, balance: finalBal });
  res.json({ ok: true, balance: finalBal, newLevel: r.newLevel, ...factories.getStatus(req.user.username) });
});

app.post('/api/factories/collect', requireAuth, (req, res) => {
  const r = factories.collect(req.user.username);
  if (r.amount <= 0) return res.json({ ok: true, amount: 0, ...factories.getStatus(req.user.username) });
  const credit = us.addBonusByAdmin(req.user.username, r.amount);
  if (!credit.ok) return res.status(500).json({ ok: false, error: 'Credit failed' });
  bh.log(req.user.username, { type: 'factory-collect', amount: r.amount, balance: credit.balance, description: 'Factory yield collected' });
  io.emit('balanceReset', { username: req.user.username, balance: credit.balance });
  res.json({ ok: true, amount: r.amount, balance: credit.balance, ...factories.getStatus(req.user.username) });
});

// ── Duels (1v1 Coin Flip) ───────────────────────────────────────────────────

app.get('/api/duels', (req, res) => {
  res.json({
    ok: true,
    open: duels.listOpen(),
    history: duels.listHistory(20),
    minWager: duels.MIN_WAGER,
    maxWager: duels.MAX_WAGER,
    houseCut: duels.HOUSE_CUT,
    expiryMinutes: Math.floor(duels.EXPIRY_MS / 60_000),
  });
});

app.post('/api/duels/create', requireAuth, (req, res) => {
  const { wager, side } = req.body || {};
  const w = Math.floor(Number(wager) || 0);
  // Pre-check before deducting
  const probe = duels.create({ username: req.user.username, wager: w, side });
  if (!probe.ok) return res.status(400).json(probe);
  // Created successfully — now deduct. If deduction fails, cancel.
  const spend = us.spendBalance(req.user.username, w);
  if (!spend.ok) {
    duels.cancel(probe.duel.id, req.user.username);
    return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  }
  bh.log(req.user.username, { type: 'duel-create', amount: -w, balance: spend.balance, description: `Created duel for $${w}` });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  io.emit('duelCreated', { duel: probe.duel });
  liveFeed.push('duel-created', { user: req.user.username, wager: w, side });
  res.json({ ok: true, duel: probe.duel, balance: spend.balance });
});

app.post('/api/duels/cancel/:id', requireAuth, (req, res) => {
  const r = duels.cancel(req.params.id, req.user.username);
  if (!r.ok) return res.status(400).json(r);
  const credit = us.addBonusByAdmin(req.user.username, r.refund);
  if (credit.ok) {
    bh.log(req.user.username, { type: 'duel-cancel', amount: r.refund, balance: credit.balance, description: 'Duel cancelled refund' });
    io.emit('balanceReset', { username: req.user.username, balance: credit.balance });
  }
  io.emit('duelCancelled', { id: req.params.id });
  res.json({ ok: true, refund: r.refund, balance: credit.balance });
});

app.post('/api/duels/accept/:id', requireAuth, (req, res) => {
  const duel = duels.getById(req.params.id);
  if (!duel) return res.status(400).json({ ok: false, error: 'Duel not found' });
  if (duel.status !== 'open') return res.status(400).json({ ok: false, error: 'Duel not open' });
  if (duel.createdBy === req.user.username.toLowerCase()) {
    return res.status(400).json({ ok: false, error: 'Cannot accept your own duel' });
  }
  // Deduct acceptor's wager first
  const spend = us.spendBalance(req.user.username, duel.wager);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  const r = duels.accept(req.params.id, req.user.username);
  if (!r.ok) {
    // Refund
    us.addBonusByAdmin(req.user.username, duel.wager);
    return res.status(400).json(r);
  }
  const settled = r.duel;
  // Credit winner
  const winnerCredit = us.addBonusByAdmin(settled.winner, settled.winnerPayout);
  if (winnerCredit.ok) {
    bh.log(settled.winner, { type: 'duel-win', amount: settled.winnerPayout, balance: winnerCredit.balance, description: `Won duel vs ${settled.loser}` });
    io.emit('balanceReset', { username: settled.winner, balance: winnerCredit.balance });
  }
  // Log acceptor wager
  bh.log(req.user.username, { type: 'duel-accept', amount: -duel.wager, balance: spend.balance, description: `Accepted duel vs ${duel.createdBy}` });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  io.emit('duelSettled', { duel: settled });
  liveFeed.push('duel-settled', {
    winner: settled.winner, loser: settled.loser,
    pool: settled.pool, payout: settled.winnerPayout, coin: settled.coin,
  });
  res.json({ ok: true, duel: settled });
});

// Tick: refund expired duels
setInterval(() => {
  const refunds = duels.tick();
  for (const r of refunds) {
    const credit = us.addBonusByAdmin(r.username, r.amount);
    if (credit.ok) {
      bh.log(r.username, { type: 'duel-expire', amount: r.amount, balance: credit.balance, description: `Duel expired unfilled — refund` });
      io.emit('balanceReset', { username: r.username, balance: credit.balance });
    }
    io.emit('duelCancelled', { id: r.duelId });
  }
}, 60_000);

// ── Loot Drops (global first-to-click chip) ─────────────────────────────────

app.get('/api/loot', (req, res) => {
  res.json({
    ok: true,
    current: lootDrops.getCurrent(),
    history: lootDrops.getHistory(10),
  });
});

app.post('/api/loot/grab/:id', requireAuth, (req, res) => {
  const active = lootDrops.getCurrent();
  if (!active || active.id !== req.params.id) {
    return res.status(400).json({ ok: false, error: 'Drop not available' });
  }
  const r = lootDrops.claim(req.user.username);
  if (!r.ok) return res.status(400).json(r);
  const credit = us.addBonusByAdmin(req.user.username, r.drop.amount);
  if (credit.ok) {
    bh.log(req.user.username, { type: 'loot-drop', amount: r.drop.amount, balance: credit.balance, description: `${r.drop.tier} loot drop (${r.drop.emoji})` });
    io.emit('balanceReset', { username: req.user.username, balance: credit.balance });
  }
  io.emit('lootDropClaimed', { drop: r.drop });
  liveFeed.push('loot-drop', { user: req.user.username, amount: r.drop.amount, tier: r.drop.tier, emoji: r.drop.emoji });
  console.log(`[LootDrop] 🎁 ${req.user.username} grabbed ${r.drop.emoji} ${r.drop.tier} drop $${r.drop.amount.toLocaleString()}`);
  res.json({ ok: true, drop: r.drop, balance: credit.balance });
});

// Spawner: random interval between 2-7 minutes
function scheduleLootDrop() {
  const delay = 120_000 + Math.floor(Math.random() * 300_000); // 2-7 min
  setTimeout(() => {
    // Clear any expired first
    lootDrops.tick();
    const drop = lootDrops.spawn();
    if (drop) {
      io.emit('lootDropSpawned', { drop });
      liveFeed.push('loot-drop-spawn', { tier: drop.tier, emoji: drop.emoji, amount: drop.amount });
      console.log(`[LootDrop] 🎁 Spawned ${drop.emoji} ${drop.tier} drop $${drop.amount.toLocaleString()} (${drop.ttl}s)`);
    }
    scheduleLootDrop();
  }, delay);
}
scheduleLootDrop();

// Sweep expired drops every 15s
setInterval(() => {
  const swept = lootDrops.tick();
  if (swept) {
    io.emit('lootDropExpired', { id: swept.id });
    console.log(`[LootDrop] ⏰ ${swept.emoji} drop expired unclaimed`);
  }
}, 15_000);

// ── Case Opening (CSGO-style unboxing) ─────────────────────────────────────

app.get('/api/cases', (req, res) => {
  const me = us.getMe(getToken(req));
  const freeMs = me.ok ? cases.msUntilFree(me.username) : 0;
  res.json({
    ok: true,
    cases: cases.getAllCases(),
    rarities: cases.getRarities(),
    recent: cases.getRecentOpens(),
    freeCooldownMs: freeMs,
  });
});

app.post('/api/cases/open', requireAuth, (req, res) => {
  const { caseId, free } = req.body || {};
  if (!caseId) return res.status(400).json({ ok: false, error: 'caseId required' });

  const caseDef = cases.CASES.find(c => c.id === caseId);
  if (!caseDef) return res.status(404).json({ ok: false, error: 'Unknown case' });

  // Handle the free "Welcome Case" path
  if (free || caseDef.freeOnly) {
    if (!caseDef.freeOnly) return res.status(400).json({ ok: false, error: 'This case is not free' });
    const wait = cases.msUntilFree(req.user.username);
    if (wait > 0) return res.status(429).json({ ok: false, error: 'Free case on cooldown', cooldownMs: wait });

    const result = cases.openCase(req.user.username, caseId, { free: true });
    if (!result.ok) return res.status(400).json(result);
    cases.recordFreeClaim(req.user.username);

    const credit = us.addBonusByAdmin(req.user.username, result.item.value);
    if (credit.ok) {
      bh.log(req.user.username, { type: 'case-open', amount: result.item.value, balance: credit.balance, description: `Opened ${caseDef.emoji} ${caseDef.name} → ${result.item.emoji} ${result.item.name}` });
      io.emit('balanceReset', { username: req.user.username, balance: credit.balance });
    }
    io.emit('caseOpen', result.entry);
    liveFeed.push('case-open', { user: req.user.username, caseName: caseDef.name, item: result.item });
    return res.json({ ok: true, ...result, balance: credit.ok ? credit.balance : null, cooldownMs: 60 * 60 * 1000 });
  }

  // Paid case path — deduct first, then RNG, then credit item value.
  // Apply Joker crateDiscountPct if the user has any (e.g. Crate Key: 15% off).
  let effectivePrice = caseDef.price;
  let crateDiscount = 0;
  if (caseDef.price > 0) {
    try {
      const ab = jokers.getEquippedAbilities(req.user.username);
      const disc = Math.min(0.5, Math.max(0, ab?.crateDiscountPct || 0));
      if (disc > 0) {
        crateDiscount  = Math.floor(caseDef.price * disc);
        effectivePrice = caseDef.price - crateDiscount;
      }
    } catch {}
    const spend = us.spendBalance(req.user.username, effectivePrice);
    if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
    io.emit('balanceReset', { username: req.user.username, balance: spend.balance });
  }

  const result = cases.openCase(req.user.username, caseId);
  if (!result.ok) {
    // RNG failed after we already charged — refund.
    if (caseDef.price > 0) us.addBonusByAdmin(req.user.username, effectivePrice);
    return res.status(400).json(result);
  }

  const credit = us.addBonusByAdmin(req.user.username, result.item.value);
  if (credit.ok) {
    const discNote = crateDiscount > 0 ? ` (joker discount -$${crateDiscount.toLocaleString()})` : '';
    bh.log(req.user.username, { type: 'case-open', amount: result.item.value - effectivePrice, balance: credit.balance, description: `Opened ${caseDef.emoji} ${caseDef.name} → ${result.item.emoji} ${result.item.name}${discNote}` });
    io.emit('balanceReset', { username: req.user.username, balance: credit.balance });
  }

  // XP + mission bookkeeping — count the case open as a wager
  try { xp.recordBet({ username: req.user.username, game: 'cases', amount: caseDef.price, won: result.item.value >= caseDef.price, multiplier: caseDef.price > 0 ? (result.item.value / caseDef.price) : 1, profit: result.item.value - caseDef.price }); } catch {}
  try { dg.addWager(req.user.username, caseDef.price); } catch {}

  // Broadcast + big-win check
  io.emit('caseOpen', result.entry);
  liveFeed.push('case-open', { user: req.user.username, caseName: caseDef.name, item: result.item });
  if (result.item.value - caseDef.price >= 50_000) {
    wl.logWin({
      username:   req.user.username,
      game:       'cases',
      bet:        caseDef.price,
      payout:     result.item.value,
      profit:     result.item.value - caseDef.price,
      multiplier: caseDef.price > 0 ? +(result.item.value / caseDef.price).toFixed(2) : null,
      details:    `${caseDef.name} → ${result.item.emoji} ${result.item.name} (${result.item.rarity})`,
      timestamp:  Date.now(),
    });
    io.emit('bigWin', { username: req.user.username, game: 'cases', profit: result.item.value - caseDef.price, multiplier: caseDef.price > 0 ? +(result.item.value / caseDef.price).toFixed(2) : null, timestamp: Date.now() });
  }

  console.log(`[Cases] 📦 ${req.user.username} opened ${caseDef.name} → ${result.item.emoji} ${result.item.name} ($${result.item.value.toLocaleString()}, ${result.item.rarity})`);
  res.json({ ok: true, ...result, balance: credit.ok ? credit.balance : null });
});

// ── Jokers (collectibles w/ equipable abilities) ──────────────────────────────

// Catalog + rarity palette (public)
app.get('/api/jokers/catalog', (req, res) => {
  const catalog = jokers.getCatalog().map(j => ({
    ...j,
    marketValue: auction.marketValue(j.id, j.baseValue),
  }));
  res.json({
    ok: true,
    jokers: catalog,
    rarities: jokers.getRarities(),
    cratePrice: jokers.getCratePrice(),
    maxEquipped: jokers.getMaxEquipped(),
  });
});

// Viewer's inventory
app.get('/api/jokers/inventory', requireAuth, (req, res) => {
  const inv = jokers.getInventory(req.user.username);
  // Attach market values for each instance's joker type
  const owned = inv.owned.map(o => ({
    ...o,
    marketValue: o.def ? auction.marketValue(o.def.id, o.def.baseValue) : 0,
  }));
  res.json({
    ok: true,
    owned,
    equipped: inv.equipped,
    abilities: jokers.getEquippedAbilities(req.user.username),
  });
});

// Buy a Joker Crate ($1M) → random weighted pull
app.post('/api/jokers/crate/open', requireAuth, (req, res) => {
  const basePrice = jokers.getCratePrice();
  // Apply the user's Joker crateDiscountPct if any (Crate Key = 15% off, etc.)
  let crateDiscount = 0;
  let price = basePrice;
  try {
    const ab = jokers.getEquippedAbilities(req.user.username);
    const disc = Math.min(0.5, Math.max(0, ab?.crateDiscountPct || 0));
    if (disc > 0) {
      crateDiscount = Math.floor(basePrice * disc);
      price = basePrice - crateDiscount;
    }
  } catch {}
  const spend = us.spendBalance(req.user.username, price);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });

  const pull = jokers.openCrate(req.user.username);
  if (!pull.ok) {
    us.addBonusByAdmin(req.user.username, price); // refund on failure
    return res.status(500).json({ ok: false, error: 'Crate failed' });
  }

  const discNote = crateDiscount > 0 ? ` (joker discount -$${crateDiscount.toLocaleString()})` : '';
  try { bh.log(req.user.username, { type: 'joker-crate', amount: -price, balance: spend.balance, description: `Joker Crate → ${pull.joker.emoji} ${pull.joker.name} (${pull.joker.rarity})${discNote}` }); } catch {}
  try { dg.addWager(req.user.username, price); } catch {}

  // Broadcast pull (anyone-sees-anyone feed + big-win if legendary+)
  io.emit('jokerPulled', { username: req.user.username, joker: pull.joker, instanceId: pull.instanceId, at: Date.now() });
  liveFeed.push('joker-pull', { user: req.user.username, joker: pull.joker });

  if (pull.joker.rarity === 'legendary' || pull.joker.rarity === 'mythic') {
    io.emit('bigWin', {
      username: req.user.username, game: 'jokers',
      profit: pull.joker.baseValue - price,
      multiplier: +(pull.joker.baseValue / price).toFixed(2),
      timestamp: Date.now(),
    });
  }

  console.log(`[Jokers] 🃏 ${req.user.username} pulled ${pull.joker.emoji} ${pull.joker.name} (${pull.joker.rarity})`);
  res.json({ ok: true, joker: pull.joker, instanceId: pull.instanceId, balance: spend.balance });
});

// Equip / unequip
app.post('/api/jokers/equip', requireAuth, (req, res) => {
  const { instanceId } = req.body || {};
  if (!instanceId) return res.status(400).json({ ok: false, error: 'instanceId required' });
  const r = jokers.equip(req.user.username, instanceId);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, abilities: jokers.getEquippedAbilities(req.user.username) });
});
app.post('/api/jokers/unequip', requireAuth, (req, res) => {
  const { instanceId } = req.body || {};
  if (!instanceId) return res.status(400).json({ ok: false, error: 'instanceId required' });
  const r = jokers.unequip(req.user.username, instanceId);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, abilities: jokers.getEquippedAbilities(req.user.username) });
});

// Joker collection leaderboard (total market value)
app.get('/api/jokers/leaderboard', (req, res) => {
  const rows = jokers.getCollectionLeaderboard((jokerId, base) => auction.marketValue(jokerId, base), 50);
  res.json({ ok: true, leaderboard: rows, rarities: jokers.getRarities() });
});

// ── Auction House ─────────────────────────────────────────────────────────

app.get('/api/auction/listings', (req, res) => {
  const listings = auction.listAll().map(l => {
    const def = jokers.getJokerDef(l.jokerId);
    return {
      ...l,
      joker: def ? {
        id: def.id, name: def.name, emoji: def.emoji, rarity: def.rarity,
        baseValue: def.baseValue, description: def.description, abilities: def.abilities,
      } : null,
      marketValue: def ? auction.marketValue(def.id, def.baseValue) : 0,
    };
  });
  res.json({ ok: true, listings, houseFee: auction.getHouseFee() });
});

app.get('/api/auction/market/:jokerId', (req, res) => {
  const def = jokers.getJokerDef(req.params.jokerId);
  if (!def) return res.status(404).json({ ok: false, error: 'Unknown joker' });
  res.json({ ok: true, market: auction.marketSnapshot(def.id, def.baseValue) });
});

app.post('/api/auction/list', requireAuth, (req, res) => {
  const { instanceId, price } = req.body || {};
  if (!instanceId || !price) return res.status(400).json({ ok: false, error: 'instanceId and price required' });
  if (!jokers.ownsInstance(req.user.username, instanceId)) return res.status(400).json({ ok: false, error: 'You do not own that joker' });

  // Escrow — remove from inventory
  const removed = jokers.removeInstance(req.user.username, instanceId);
  if (!removed.ok) return res.status(400).json(removed);

  const created = auction.createListing({ seller: req.user.username, instance: removed.instance, price: Math.floor(price) });
  if (!created.ok) {
    jokers.addInstance(req.user.username, removed.instance); // return on failure
    return res.status(400).json(created);
  }
  io.emit('auctionListed', { listingId: created.listing.id, jokerId: removed.instance.jokerId, seller: req.user.username, price: created.listing.price });
  res.json({ ok: true, listing: created.listing });
});

app.post('/api/auction/cancel', requireAuth, (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ ok: false, error: 'listingId required' });
  const l = auction.getListing(listingId);
  if (!l) return res.status(404).json({ ok: false, error: 'Listing not found' });
  if (l.seller !== req.user.username) return res.status(403).json({ ok: false, error: 'Not your listing' });

  const cancelled = auction.cancelListing(listingId, req.user.username);
  if (!cancelled.ok) return res.status(400).json(cancelled);
  jokers.addInstance(req.user.username, cancelled.instance); // return to seller
  io.emit('auctionCancelled', { listingId });
  res.json({ ok: true });
});

app.post('/api/auction/buy', requireAuth, (req, res) => {
  const { listingId } = req.body || {};
  if (!listingId) return res.status(400).json({ ok: false, error: 'listingId required' });
  const l = auction.getListing(listingId);
  if (!l) return res.status(404).json({ ok: false, error: 'Listing not found' });
  if (l.seller === req.user.username) return res.status(400).json({ ok: false, error: 'Cannot buy your own listing' });

  // Charge buyer
  const spend = us.spendBalance(req.user.username, l.price);
  if (!spend.ok) return res.status(400).json({ ok: false, error: spend.error || 'Insufficient balance' });
  io.emit('balanceReset', { username: req.user.username, balance: spend.balance });

  // Consume listing, move instance to buyer
  const consumed = auction.consumeListing(listingId);
  if (!consumed.ok) {
    us.addBonusByAdmin(req.user.username, l.price); // refund if race
    return res.status(400).json(consumed);
  }
  jokers.addInstance(req.user.username, consumed.listing.instance);

  // Pay seller (minus house fee)
  const fee    = Math.floor(l.price * auction.getHouseFee());
  const payout = l.price - fee;
  const credit = us.addBonusByAdmin(l.seller, payout);
  if (credit.ok) io.emit('balanceReset', { username: l.seller, balance: credit.balance });

  // Record sale for market tracker
  auction.recordSale(l.jokerId, l.price);

  try { bh.log(req.user.username, { type: 'auction-buy', amount: -l.price, balance: spend.balance, description: `Bought ${consumed.listing.instance.jokerId} from ${l.seller}` }); } catch {}
  try { bh.log(l.seller, { type: 'auction-sold', amount: payout, balance: credit.ok ? credit.balance : null, description: `Sold ${consumed.listing.instance.jokerId} to ${req.user.username} (${auction.getHouseFee() * 100}% fee)` }); } catch {}

  io.emit('auctionSold', { listingId, jokerId: l.jokerId, price: l.price, seller: l.seller, buyer: req.user.username });
  liveFeed.push('auction-sold', { buyer: req.user.username, seller: l.seller, jokerId: l.jokerId, price: l.price });
  res.json({ ok: true, balance: spend.balance });
});

// ── Trading (P2P offers) ───────────────────────────────────────────────────

app.get('/api/trades/mine', requireAuth, (req, res) => {
  const offers = trades.listByUser(req.user.username).map(o => {
    return {
      ...o,
      offererJokers: o.offererInstances.map(inst => ({
        instanceId: inst.instanceId,
        def: jokers.getJokerDef(inst.jokerId),
      })).filter(x => x.def),
      requestedJokers: o.requestedJokerIds.map(id => jokers.getJokerDef(id)).filter(Boolean),
    };
  });
  res.json({ ok: true, offers });
});

app.post('/api/trades/create', requireAuth, (req, res) => {
  const { receiver, offererInstanceIds, offererCoins, requestedJokerIds, requestedCoins, message } = req.body || {};
  if (!receiver)                 return res.status(400).json({ ok: false, error: 'receiver required' });
  if (receiver === req.user.username) return res.status(400).json({ ok: false, error: 'Cannot trade with yourself' });

  // Verify receiver exists
  if (!us.userExists(receiver)) return res.status(404).json({ ok: false, error: 'Receiver not found' });

  // Verify offerer has the coins (check only; deducted at accept)
  if (offererCoins && offererCoins > 0) {
    if ((us.getBalance(req.user.username) || 0) < offererCoins) return res.status(400).json({ ok: false, error: 'Not enough coins' });
  }

  // Pull instances from offerer inventory (escrow)
  const instances = [];
  const inst_ids = Array.isArray(offererInstanceIds) ? offererInstanceIds : [];
  for (const iid of inst_ids) {
    const rem = jokers.removeInstance(req.user.username, iid);
    if (!rem.ok) {
      // Roll back any already-removed
      for (const prev of instances) jokers.addInstance(req.user.username, prev);
      return res.status(400).json({ ok: false, error: `You do not own instance ${iid}` });
    }
    instances.push(rem.instance);
  }

  const created = trades.createOffer({
    offerer: req.user.username,
    receiver,
    offererInstances: instances,
    offererCoins: offererCoins || 0,
    requestedJokerIds: requestedJokerIds || [],
    requestedCoins: requestedCoins || 0,
    message,
  });

  if (!created.ok) {
    // Return escrow on failure
    for (const inst of instances) jokers.addInstance(req.user.username, inst);
    return res.status(400).json(created);
  }

  io.emit('tradeCreated', { offerId: created.offer.id, offerer: req.user.username, receiver });
  res.json({ ok: true, offer: created.offer });
});

app.post('/api/trades/cancel', requireAuth, (req, res) => {
  const { offerId } = req.body || {};
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  const o = trades.getOffer(offerId);
  if (!o || o.status !== 'open') return res.status(404).json({ ok: false, error: 'Offer not active' });
  if (o.offerer !== req.user.username) return res.status(403).json({ ok: false, error: 'Not your offer' });

  // Return escrow
  for (const inst of o.offererInstances) jokers.addInstance(req.user.username, inst);
  trades.setStatus(offerId, 'cancelled');
  io.emit('tradeResolved', { offerId, status: 'cancelled' });
  res.json({ ok: true });
});

app.post('/api/trades/reject', requireAuth, (req, res) => {
  const { offerId } = req.body || {};
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  const o = trades.getOffer(offerId);
  if (!o || o.status !== 'open') return res.status(404).json({ ok: false, error: 'Offer not active' });
  if (o.receiver !== req.user.username) return res.status(403).json({ ok: false, error: 'Not addressed to you' });

  // Return escrow to offerer
  for (const inst of o.offererInstances) jokers.addInstance(o.offerer, inst);
  trades.setStatus(offerId, 'rejected');
  io.emit('tradeResolved', { offerId, status: 'rejected' });
  res.json({ ok: true });
});

app.post('/api/trades/accept', requireAuth, (req, res) => {
  const { offerId, suppliedInstanceIds } = req.body || {};
  if (!offerId) return res.status(400).json({ ok: false, error: 'offerId required' });
  const o = trades.getOffer(offerId);
  if (!o || o.status !== 'open') return res.status(404).json({ ok: false, error: 'Offer not active' });
  if (o.receiver !== req.user.username) return res.status(403).json({ ok: false, error: 'Not addressed to you' });

  // Validate receiver has coins (if any requested)
  if (o.requestedCoins > 0) {
    if ((us.getBalance(req.user.username) || 0) < o.requestedCoins) {
      return res.status(400).json({ ok: false, error: 'Not enough coins to fulfill offer' });
    }
  }

  // Validate supplied instances: one per requestedJokerId
  const supplied = Array.isArray(suppliedInstanceIds) ? suppliedInstanceIds : [];
  if (supplied.length !== o.requestedJokerIds.length) {
    return res.status(400).json({ ok: false, error: 'Must supply one instance per requested joker' });
  }
  const inv = jokers.getInventory(req.user.username);
  // Track which requested jokerIds have been matched so same slot isn't reused
  const usedInst = new Set();
  const matchedInstances = [];
  for (let i = 0; i < o.requestedJokerIds.length; i++) {
    const wantedId = o.requestedJokerIds[i];
    const iid      = supplied[i];
    if (usedInst.has(iid)) return res.status(400).json({ ok: false, error: 'Duplicate instance supplied' });
    const owned = inv.owned.find(x => x.instanceId === iid && x.jokerId === wantedId);
    if (!owned) return res.status(400).json({ ok: false, error: `Missing required joker ${wantedId}` });
    usedInst.add(iid);
    matchedInstances.push({ instanceId: iid, jokerId: wantedId, acquiredAt: owned.acquiredAt });
  }

  // Validate offerer still has coins too
  if (o.offererCoins > 0) {
    if ((us.getBalance(o.offerer) || 0) < o.offererCoins) {
      // Return escrow, cancel
      for (const inst of o.offererInstances) jokers.addInstance(o.offerer, inst);
      trades.setStatus(offerId, 'failed');
      return res.status(400).json({ ok: false, error: 'Offerer no longer has the required coins' });
    }
  }

  // Perform the swap atomically-ish:
  // 1. move escrowed instances from offer → receiver
  for (const inst of o.offererInstances) jokers.addInstance(req.user.username, inst);

  // 2. remove receiver's requested instances + give to offerer
  for (const m of matchedInstances) {
    const rem = jokers.removeInstance(req.user.username, m.instanceId);
    if (rem.ok) jokers.addInstance(o.offerer, rem.instance);
  }

  // 3. swap coins
  if (o.offererCoins > 0) {
    const s = us.spendBalance(o.offerer, o.offererCoins);
    if (s.ok) {
      io.emit('balanceReset', { username: o.offerer, balance: s.balance });
      const r = us.addBonusByAdmin(req.user.username, o.offererCoins);
      if (r.ok) io.emit('balanceReset', { username: req.user.username, balance: r.balance });
    }
  }
  if (o.requestedCoins > 0) {
    const s = us.spendBalance(req.user.username, o.requestedCoins);
    if (s.ok) {
      io.emit('balanceReset', { username: req.user.username, balance: s.balance });
      const r = us.addBonusByAdmin(o.offerer, o.requestedCoins);
      if (r.ok) io.emit('balanceReset', { username: o.offerer, balance: r.balance });
    }
  }

  trades.setStatus(offerId, 'accepted');
  io.emit('tradeResolved', { offerId, status: 'accepted' });
  liveFeed.push('trade-accepted', { offerer: o.offerer, receiver: req.user.username });
  res.json({ ok: true });
});

// ── Live Events Feed (public ticker) ─────────────────────────────────────────

app.get('/api/live-feed', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
  res.json({ ok: true, events: liveFeed.recent(limit) });
});

// ── Online count (public) ──────────────────────────────────────────────────────

app.get('/api/online-count', (req, res) => {
  const stats = us.adminGetStats ? us.adminGetStats() : { onlineNow: 0 };
  // Also include socket count as fallback
  const socketCount = io.sockets.sockets.size;
  res.json({ ok: true, online: Math.max(stats.onlineNow || 0, Math.floor(socketCount * 0.7)) });
});

// ── Global Stats ──────────────────────────────────────────────────────────────

app.get('/api/stats/global', (req, res) => {
  const wins   = wl.getWins();
  const topWin = wins.reduce((best, w) => !best || w.profit > best.profit ? w : best, null);
  const totalProfit = wins.reduce((s, w) => s + (w.profit || 0), 0);
  const top    = xp.getTopPlayers(1)[0] || null;
  const raceInfo = wr.getLeaderboard(1);
  const lottery  = lt.getStatus();
  const userStats = us.adminGetStats ? us.adminGetStats() : {};
  // Top players for search suggestions
  const topPlayers = xp.getTopPlayers(10).map(p => {
    const full = xp.getProfile(p.username);
    return { username: p.username, totalWon: full?.totalWagered || 0 };
  });
  res.json({
    ok: true,
    biggestWinEver: topWin,
    totalProfitPaid: totalProfit,
    bigWinCount: wins.length,
    topXpPlayer: top,
    wagerRacePool: raceInfo.prizePool,
    lotteryJackpot: lottery.jackpot,
    lotteryTickets: lottery.tickets,
    onlineNow: userStats.onlineNow || 0,
    totalUsers: userStats.totalUsers || 0,
    topPlayers,
  });
});

// ── Jackpot (shared pool for Slots) ──────────────────────────────────────────

// Public: get current jackpot amount
app.get('/api/jackpot', (req, res) => {
  res.json({ ok: true, amount: jp.getJackpot() });
});

// Auth: contribute 2% of wager to jackpot after each spin
app.post('/api/jackpot/contribute', requireAuth, (req, res) => {
  const { wager } = req.body || {};
  const amt = Math.floor(Number(wager) || 0);
  if (amt <= 0) return res.status(400).json({ ok: false, error: 'Invalid wager' });
  const contribution = Math.floor(amt * 0.02);
  const newAmount    = jp.contribute(contribution);
  res.json({ ok: true, amount: newAmount, contribution });
});

// Auth: claim the jackpot (called when 7️⃣7️⃣7️⃣ hit)
app.post('/api/jackpot/claim', requireAuth, (req, res) => {
  const { wager } = req.body || {};
  const { won, resetTo } = jp.claim();

  // Credit winner
  const token = getToken(req);
  us.addBonusByAdmin(req.user.username, won);

  // Push updated balance to client
  const me = us.getMe(token);
  if (me.ok) {
    io.emit('balanceReset', { username: req.user.username, balance: me.balance });
  }

  // Broadcast jackpot won event to ALL connected clients
  io.emit('jackpotWon', {
    winner:  req.user.username,
    amount:  won,
    resetTo,
    wager:   Math.floor(Number(wager) || 0),
  });

  al.log('jackpot_won', { winner: req.user.username, amount: won });
  console.log(`[jackpot] 🎰 JACKPOT! ${req.user.username} won $${won.toLocaleString()}! Pool reset to $${resetTo.toLocaleString()}`);

  // Award jackpot achievement + XP
  const jackpotUnlocked = xp.recordJackpotWin(req.user.username);
  if (jackpotUnlocked.length > 0) io.emit('xpEvent', { username: req.user.username, unlocked: jackpotUnlocked });

  res.json({ ok: true, amount: won, resetTo });
});

// Admin: reset jackpot pool manually (optional custom amount)
app.post('/api/admin/jackpot/reset', requireAdmin, (req, res) => {
  const custom = Number(req.body?.amount);
  const amount = (!isNaN(custom) && custom > 0) ? jp.resetTo(custom) : jp.reset();
  al.log('jackpot_reset', { amount });
  res.json({ ok: true, amount });
});

// ── Sports Betting (player routes) ───────────────────────────────────────────

// List all open games (created by admin via desktop app)
app.get('/api/sports/games', requireAuth, (req, res) => {
  const games = sb.getGames(false); // open only
  res.json({ ok: true, games });
});

// Manual trigger for auto-settle (admin only)
app.post('/api/admin/settle-now', requireAdmin, async (req, res) => {
  try {
    await autoSettle.runAutoSettle();
    res.json({ ok: true, message: 'Auto-settle run complete — check server logs' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Manual trigger for auto-sync (admin only)
app.post('/api/admin/sync-games-now', requireAdmin, async (req, res) => {
  try {
    await autoSync.runAutoSync();
    const games = sb.getGames(false); // open, upcoming only
    res.json({ ok: true, message: 'Game sync complete — check server logs', openGames: games.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Live scores for all games that have started (open + all sports with bets)
app.get('/api/sports/scores', requireAuth, async (req, res) => {
  if (!process.env.ODDS_API_KEY) return res.json({ ok: true, scores: [] });

  // Fetch scores for all games that have started (open or settled) in the last 3 days
  const allGames  = sb.getGames(true);
  const started   = allGames.filter(g => new Date(g.startTime).getTime() <= Date.now());
  const sportKeys = [...new Set(started.map(g => {
    const map = {
      'NCAAB': 'basketball_ncaab', 'NBA': 'basketball_nba',
      'NHL': 'icehockey_nhl', 'NFL': 'americanfootball_nfl',
      'MLB': 'baseball_mlb', 'Premier League': 'soccer_epl',
      'UEFA Champions League': 'soccer_uefa_champs_league',
      'MMA': 'mma_mixed_martial_arts',
    };
    return map[g.sport];
  }).filter(Boolean))];

  try {
    const all = [];
    for (const key of sportKeys) {
      const raw = await odds.fetchScoresForSport(key, false); // include in-progress
      all.push(...raw);
    }
    res.json({ ok: true, scores: all });
  } catch (e) {
    res.json({ ok: true, scores: [] }); // degrade gracefully
  }
});

// Place a bet
app.post('/api/sports/bet', requireAuth, (req, res) => {
  const { gameId, pick, odds: betOdds, amount } = req.body || {};
  const amt = Math.floor(Number(amount));
  const me  = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if ((me.balance || 0) < amt) return res.status(400).json({ ok: false, error: 'Insufficient balance' });

  const result = sb.placeBet({ username: req.user.username, gameId, pick, odds: betOdds, amount: amt });
  if (!result.ok) return res.status(400).json(result);

  us.syncBalance(getToken(req), (me.balance || 0) - amt);
  res.json(result);
});

// Get my bets
app.get('/api/sports/bets', requireAuth, (req, res) => {
  res.json({ ok: true, bets: sb.getUserBets(req.user.username) });
});

// Place a parlay bet
app.post('/api/sports/parlay', requireAuth, (req, res) => {
  const { picks, amount } = req.body || {};
  const amt = Math.floor(Number(amount));
  const me  = us.getMe(getToken(req));
  if (!me.ok) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  if ((me.balance || 0) < amt) return res.status(400).json({ ok: false, error: 'Insufficient balance' });

  const result = sb.placeParlayBet({ username: req.user.username, picks, amount: amt });
  if (!result.ok) return res.status(400).json(result);

  us.syncBalance(getToken(req), (me.balance || 0) - amt);
  res.json(result);
});

// Get my parlays
app.get('/api/sports/my-parlays', requireAuth, (req, res) => {
  res.json({ ok: true, parlays: sb.getUserParlays(req.user.username) });
});

// ── Sports Betting (admin routes — used by desktop Electron app) ──────────────

// List ALL games (open + settled) with bet stats
app.get('/api/admin/sports/games', requireAdmin, (req, res) => {
  const games    = sb.getGames(true);
  const enriched = games.map(g => ({ ...g, ...sb.getGameBetStats(g.gameId) }));
  res.json({ ok: true, games: enriched });
});

// Create a new game
app.post('/api/admin/sports/games', requireAdmin, (req, res) => {
  const { sport, sportEmoji, homeTeam, awayTeam, odds: gameOdds, startTime } = req.body || {};
  if (!sport || !homeTeam || !awayTeam || !gameOdds || !startTime) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }
  const result = sb.createGame({ sport, sportEmoji, homeTeam, awayTeam, odds: gameOdds, startTime });
  al.log('sports_create_game', { sport, homeTeam, awayTeam });
  res.json(result);
});

// Update odds / details on an open game
app.put('/api/admin/sports/games/:id', requireAdmin, (req, res) => {
  const result = sb.updateGame(req.params.id, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  al.log('sports_update_game', { gameId: req.params.id });
  res.json(result);
});

// Settle a game — winner = exact team name or 'cancelled'
app.post('/api/admin/sports/games/:id/settle', requireAdmin, (req, res) => {
  const { winner } = req.body || {};
  if (!winner) return res.status(400).json({ ok: false, error: 'Missing winner' });

  const result = sb.settleGame(req.params.id, winner);
  if (!result.ok) return res.status(400).json(result);

  const creditErrors = [];

  // Credit all straight-bet winners and push balance to their clients
  for (const [username, amount] of Object.entries(result.payouts)) {
    const r = us.addBonusByAdmin(username, amount);
    if (r.ok) {
      io.emit('balanceReset', { username, balance: r.balance });
      console.log(`[sports] ✅ Payout: ${username} +$${amount.toLocaleString()}`);
    } else {
      creditErrors.push(`${username}: ${r.error}`);
      console.error(`[sports] ❌ addBonusByAdmin failed for ${username}: ${r.error}`);
    }
  }

  // Parlay payouts are now embedded in settleGame result (atomic settlement)
  const parlayPayouts = result.parlayPayouts || {};
  for (const [username, amount] of Object.entries(parlayPayouts)) {
    const r = us.addBonusByAdmin(username, amount);
    if (r.ok) {
      io.emit('balanceReset', { username, balance: r.balance });
      console.log(`[sports] ✅ Parlay payout: ${username} +$${amount.toLocaleString()}`);
      xp.recordParlayWin(username);
    } else {
      creditErrors.push(`parlay ${username}: ${r.error}`);
      console.error(`[sports] ❌ addBonusByAdmin (parlay) failed for ${username}: ${r.error}`);
    }
  }

  al.log('sports_settle_game', { gameId: req.params.id, winner, betsSettled: result.settled.length, creditErrors });
  res.json({
    ok: true,
    settled: result.settled.length,
    payouts: { ...result.payouts, ...parlayPayouts },
    creditErrors: creditErrors.length ? creditErrors : undefined,
  });
});

// Cancel & refund a game — credits refunds and settles parlay legs
app.delete('/api/admin/sports/games/:id', requireAdmin, (req, res) => {
  const result = sb.cancelGame(req.params.id);
  if (!result.ok) return res.status(400).json(result);

  // Refund straight bets
  for (const [username, amount] of Object.entries(result.payouts)) {
    const r = us.addBonusByAdmin(username, amount);
    if (r.ok) {
      io.emit('balanceReset', { username, balance: r.balance });
      console.log(`[sports] 🔄 Refund: ${username} +$${amount.toLocaleString()}`);
    } else {
      console.error(`[sports] ❌ Refund failed for ${username}: ${r.error}`);
    }
  }

  // Parlay payouts for void legs now embedded in cancelGame (= settleGame) result
  const parlayPayouts = result.parlayPayouts || {};
  for (const [username, amount] of Object.entries(parlayPayouts)) {
    const r = us.addBonusByAdmin(username, amount);
    if (r.ok) {
      io.emit('balanceReset', { username, balance: r.balance });
      console.log(`[sports] 🔄 Parlay void payout: ${username} +$${amount.toLocaleString()}`);
    } else {
      console.error(`[sports] ❌ Parlay refund failed for ${username}: ${r.error}`);
    }
  }

  al.log('sports_cancel_game', { gameId: req.params.id });
  res.json({ ok: true });
});

// All bets across all games (for admin overview)
app.get('/api/admin/sports/bets', requireAdmin, (req, res) => {
  res.json({ ok: true, bets: sb.getAllBets() });
});

// Auto-cleanup: cancel all started games that have 0 open bets (nothing to pay out)
app.post('/api/admin/sports/cleanup-zero-bets', requireAdmin, (req, res) => {
  const allGames = sb.getGames(true);
  const now = Date.now();
  const stale = allGames.filter(g =>
    g.status === 'open' &&
    new Date(g.startTime).getTime() < now   // game has started
  );

  // Re-enrich with live bet counts
  const toCancel = stale.filter(g => {
    const stats = sb.getGameBetStats(g.gameId);
    return stats.betCount === 0;
  });

  let cancelled = 0;
  for (const g of toCancel) {
    const r = sb.cancelGame(g.gameId);
    if (r.ok) {
      cancelled++;
      // Settle parlay legs (void this leg; pay out if all other legs won)
      const parlayPayouts = sb.settleParlayBets(g.gameId, 'cancelled');
      for (const [username, amount] of Object.entries(parlayPayouts)) {
        const cr = us.addBonusByAdmin(username, amount);
        if (cr.ok) io.emit('balanceReset', { username, balance: cr.balance });
      }
      al.log('sports_auto_cancel_zero_bets', { gameId: g.gameId, homeTeam: g.homeTeam, awayTeam: g.awayTeam });
      console.log(`[sports] Auto-cancelled 0-bet game: ${g.homeTeam} vs ${g.awayTeam}`);
    }
  }

  res.json({ ok: true, cancelled, message: `Cancelled ${cancelled} started game(s) with 0 bets` });
});

// Purge all settled/cancelled games + their bets from the DB (keeps it lean)
app.post('/api/admin/sports/purge-history', requireAdmin, (req, res) => {
  const result = sb.purgeHistory();
  al.log('sports_purge_history', result);
  console.log(`[sports] Admin purged history — ${result.gamesRemoved} games, ${result.betsRemoved} bets removed`);
  res.json({ ok: true, ...result, message: `Removed ${result.gamesRemoved} game(s) and ${result.betsRemoved} bet record(s)` });
});

// Purge all settled/cancelled games and their bets from the database
app.delete('/api/admin/sports/history', requireAdmin, (req, res) => {
  const result = sb.purgeHistory();
  al.log('sports_purge_history', result);
  console.log(`[sports] Purged history: ${result.gamesRemoved} games, ${result.betsRemoved} bets removed`);
  res.json({ ok: true, ...result });
});

// ── Gift Code Redemption ──────────────────────────────────────────────────────

// Player: redeem a gift code
app.post('/api/redeem', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, error: 'Missing code' });

  const result = gc.redeemCode(code, req.user.username);
  if (!result.ok) return res.status(400).json(result);

  // Credit coins server-side (locked so client sync can't overwrite it)
  const bonusResult = us.addBonusByAdmin(req.user.username, result.amount);
  if (!bonusResult.ok) return res.status(500).json({ ok: false, error: 'Failed to credit balance' });

  al.log('gift_code_redeemed', { username: req.user.username, code: result.code, amount: result.amount });
  console.log(`[GiftCode] ${req.user.username} redeemed ${result.code} (+$${result.amount.toLocaleString()})`);
  // Return the server-authoritative new balance so the client doesn't have to guess
  res.json({ ok: true, amount: result.amount, newBalance: bonusResult.balance });
});

// Admin: list codes
app.get('/api/admin/gift-codes', requireAdmin, (req, res) => {
  res.json({ ok: true, codes: gc.listCodes() });
});

// Admin: create code
app.post('/api/admin/gift-codes', requireAdmin, (req, res) => {
  const { code, amount, maxUses, expiresAt, note } = req.body || {};
  const result = gc.createCode({ code, amount, maxUses, expiresAt, note });
  if (result.ok) al.log('gift_code_created', { code: result.entry.code, amount: result.entry.amount });
  res.json(result);
});

// Admin: delete code
app.delete('/api/admin/gift-codes/:code', requireAdmin, (req, res) => {
  al.log('gift_code_deleted', { code: req.params.code });
  res.json(gc.deleteCode(req.params.code));
});

// ── Daily Free Spin ───────────────────────────────────────────────────────────

// Check spin status (canSpin, nextSpinAt)
app.get('/api/daily-spin', requireAuth, (req, res) => {
  res.json(us.getDailySpinStatus(getToken(req)));
});

// Claim today's spin
app.post('/api/daily-spin', requireAuth, (req, res) => {
  const result = us.claimDailySpin(getToken(req));
  if (result.ok) {
    io.emit('balanceReset', { username: req.user.username, balance: result.balance });
    console.log(`[DailySpin] ${req.user.username} won ${result.prize}`);
    // Award XP + track spin streak for achievements
    xp.awardXP(req.user.username, 25);
    const spinUnlocked = xp.recordDailySpin(req.user.username);
    if (spinUnlocked.length > 0) io.emit('xpEvent', { username: req.user.username, unlocked: spinUnlocked });
  }
  res.json(result);
});

// ── Static client ─────────────────────────────────────────────────────────────

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Game namespaces ───────────────────────────────────────────────────────────

chatNs.setGlobalEmit((event, data) => io.emit(event, data));
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
