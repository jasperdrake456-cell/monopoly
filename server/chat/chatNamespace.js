'use strict';

const cs = require('./chatStore');
const { filter } = require('./chatFilter');

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
      const msg   = { id: msgId, username, displayName, text, timestamp: Date.now(), isAdmin };

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

module.exports = { register, muteUser, unmuteUser, getMutedUsers };
