'use strict';

const cs = require('./chatStore');
const { filter } = require('./chatFilter');
const us = require('../userStore');
const { getTierForWagered } = require('../vipStore');
const xpStore = require('../xpStore');

// In-memory state (resets on server restart — bans are persisted in chatStore)
const lastMessageAt  = new Map(); // username → timestamp (ms) for slow-mode
const userHistory    = new Map(); // username → [text, ...] (recent msgs for repeat detection)
const shadowMutedSet = new Set(); // usernames currently shadow-muted

// ── Helpers ───────────────────────────────────────────────────────────────────

function muteUser(username) {
  shadowMutedSet.add(username.toLowerCase());
}

function unmuteUser(username) {
  shadowMutedSet.delete(username.toLowerCase());
  cs.resetViolations(username);
}

function getMutedUsers() {
  return [...shadowMutedSet];
}

// ── Register namespace ────────────────────────────────────────────────────────

let _globalEmit = () => {};

function setGlobalEmit(fn) { _globalEmit = fn; }

function register(namespace) {
  namespace.on('connection', (socket) => {
    const authUser = socket.handshake.auth?.user;
    if (!authUser?.username) {
      socket.disconnect(true);
      return;
    }

    const username    = authUser.username.toLowerCase();
    const displayName = authUser.displayName || authUser.username;
    const isAdmin     = username === 'jasper';

    // Send public history on connect (filtered messages hidden from normal users)
    const history = cs.getMessages().filter(m => !m.filtered && !m.shadowMuted);
    socket.emit('chatHistory', history);

    // Notify if banned
    const existingBan = cs.isChatBanned(username);
    if (existingBan) {
      socket.emit('chatBanned', { reason: existingBan.reason, expiresAt: existingBan.expiresAt });
    }

    // ── sendMessage ──────────────────────────────────────────────────────────
    socket.on('sendMessage', (data) => {
      const rawText = (data?.text || '').trim();
      if (!rawText) return;

      // ── /stats command: show your own stats ────────────────────────────────
      if (rawText.toLowerCase() === '/stats') {
        const xpModule = require('../xpStore');
        const profile  = xpModule.getProfile(username);
        const statsText = profile
          ? `📊 ${displayName} | Level ${profile.level} | ${(profile.xp || 0).toLocaleString()} XP | ${(profile.totalWins || 0)} wins | Best streak: ${profile.bestStreak || 0}`
          : `📊 ${displayName} | No stats yet`;
        const statsMsg = {
          id: `${Date.now()}_stats`,
          username: 'system',
          displayName: '📊 Stats',
          text: statsText,
          timestamp: Date.now(),
          isSystem: true,
        };
        socket.emit('newMessage', statsMsg);
        return;
      }

      // ── /tip command: /tip <username> <amount> ─────────────────────────────
      const tipMatch = rawText.match(/^\/tip\s+(\S+)\s+(\d+)\s*$/i);
      if (tipMatch) {
        const toUser  = tipMatch[1].toLowerCase();
        const amount  = Math.min(Math.max(parseInt(tipMatch[2], 10), 1), 1_000_000);
        const authToken = socket.handshake.auth?.token;
        const result  = us.transfer(authToken, toUser, amount);
        if (result.ok) {
          // Broadcast balance updates to both users
          _globalEmit('balanceReset', { username, balance: result.fromBalance });
          _globalEmit('balanceReset', { username: toUser, balance: result.toBalance });
          // Notify recipient
          _globalEmit('moneyReceived', { to: toUser, from: username, amount });
          // Broadcast a system message about the tip
          const tipMsg = {
            id:        `${Date.now()}_tip`,
            username:  'system',
            displayName: '💰 Tip',
            text:      `${displayName} tipped ${toUser} $${amount.toLocaleString()}! 🎁`,
            timestamp: Date.now(),
            isSystem:  true,
          };
          namespace.emit('newMessage', tipMsg);
          cs.addMessage(tipMsg);
          socket.emit('tipResult', { ok: true, to: toUser, amount });
        } else {
          socket.emit('tipResult', { ok: false, error: result.error || 'Tip failed' });
        }
        return;
      }

      const settings = cs.getSettings();
      const text     = rawText.slice(0, settings.maxLength);

      // Check chat ban
      const ban = cs.isChatBanned(username);
      if (ban) {
        socket.emit('chatBanned', { reason: ban.reason, expiresAt: ban.expiresAt });
        return;
      }

      // Slow mode (admins exempt)
      if (!isAdmin && settings.slowMode > 0) {
        const last    = lastMessageAt.get(username) || 0;
        const elapsed = (Date.now() - last) / 1000;
        if (elapsed < settings.slowMode) {
          socket.emit('chatSlowMode', { remaining: Math.ceil(settings.slowMode - elapsed) });
          return;
        }
      }

      // Admins bypass content filter
      if (!isAdmin) {
        const recent = userHistory.get(username) || [];
        const result = filter(text, settings, recent);

        if (!result.allowed) {
          const violations = cs.addViolation(username);

          // Auto-mute if over threshold
          const shouldMute = settings.muteEnabled
            && settings.autoMuteAfter > 0
            && violations >= settings.autoMuteAfter;

          if (shouldMute) {
            muteUser(username);
          }

          socket.emit('chatViolation', {
            reason: result.reason,
            muted:  shouldMute,
            violations,
          });

          // Log filtered message for admin view
          cs.addMessage({
            id:           `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            username,
            displayName,
            text,
            timestamp:    Date.now(),
            filtered:     true,
            filterReason: result.reason,
          });
          return;
        }
      }

      const msgId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      // Attach VIP tier for chat badge
      let vipTier = null;
      try {
        const profile = xpStore.getProfile(username);
        if (profile && profile.totalWagered > 0) {
          const tier = getTierForWagered(profile.totalWagered || 0);
          if (tier.tier > 0) vipTier = { tier: tier.tier, name: tier.name, icon: tier.icon, color: tier.color };
        }
      } catch { /* non-critical */ }
      const msg   = { id: msgId, username, displayName, text, timestamp: Date.now(), isAdmin, vipTier };

      // Shadow-muted: send back only to sender
      if (!isAdmin && shadowMutedSet.has(username) && settings.shadowMute) {
        socket.emit('newMessage', msg);
        cs.addMessage({ ...msg, shadowMuted: true });
        return;
      }

      // Update rate-limit & repeat-history
      lastMessageAt.set(username, Date.now());
      const hist = [text, ...(userHistory.get(username) || [])].slice(0, 10);
      userHistory.set(username, hist);

      // Broadcast to all
      namespace.emit('newMessage', msg);
      cs.addMessage(msg);
    });

    socket.on('disconnect', () => {});
  });
}

module.exports = { register, muteUser, unmuteUser, getMutedUsers, setGlobalEmit };
