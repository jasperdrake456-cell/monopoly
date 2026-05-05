import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { useChampion } from '../hooks/useChampion';
import { useNavigate, useLocation } from 'react-router-dom';
import './ChatPanel.css';

const SERVER_URL  = import.meta.env.VITE_SERVER_URL || '';
const TOKEN_KEY   = 'gv_auth_token';
const USER_KEY    = 'gv_auth_user';
const MAX_DISPLAY = 150;

// Simple hash → hue for username colours
function userHue(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function fmt(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel() {
  const { user, isLoggedIn } = useAuth();
  const { champion } = useChampion();
  const navigate = useNavigate();
  const location = useLocation();
  // Hide the floating chat + suggest buttons on the admin panel — admins
  // need that screen real estate for the dashboard.
  const hideOnRoute = location.pathname.startsWith('/admin');
  const [open,       setOpen]       = useState(false);
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState('');
  const [socket,     setSocket]     = useState(null);
  const [connected,  setConnected]  = useState(false);
  const [violation,  setViolation]  = useState(null); // { reason, muted }
  const [banned,     setBanned]     = useState(null); // { reason, expiresAt }
  const [slowLeft,   setSlowLeft]   = useState(0);   // seconds remaining in slow mode
  const [unread,     setUnread]     = useState(0);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const violTimer = useRef(null);
  const slowTimer = useRef(null);
  const openRef   = useRef(false); // always reflects current `open` value inside socket handlers

  const MAX_LEN = 200;

  // ── Socket lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const token     = localStorage.getItem(TOKEN_KEY);
    const savedUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null');

    const sock = io(SERVER_URL + '/chat', {
      auth: { token, user: savedUser },
      transports: ['websocket', 'polling'],
    });

    sock.on('connect',      () => setConnected(true));
    sock.on('disconnect',   () => setConnected(false));

    sock.on('chatHistory', (msgs) => {
      setMessages(msgs.slice(-MAX_DISPLAY));
    });

    sock.on('newMessage', (msg) => {
      setMessages(prev => {
        const next = [...prev, msg].slice(-MAX_DISPLAY);
        return next;
      });
      setUnread(prev => (openRef.current ? 0 : prev + 1));
    });

    sock.on('chatBanned', (data) => {
      setBanned(data);
    });

    sock.on('chatViolation', (data) => {
      clearTimeout(violTimer.current);
      setViolation(data);
      violTimer.current = setTimeout(() => setViolation(null), 5000);
    });

    sock.on('tipResult', (data) => {
      if (data.ok) {
        const sysMsg = { id: `tip_${Date.now()}`, username: 'system', displayName: '✅ Tip Sent', text: `You tipped ${data.to} $${(data.amount || 0).toLocaleString()}!`, timestamp: Date.now(), isSystem: true };
        setMessages(prev => [...prev, sysMsg].slice(-MAX_DISPLAY));
      } else {
        const sysMsg = { id: `tip_err_${Date.now()}`, username: 'system', displayName: '❌ Tip Failed', text: data.error || 'Tip failed', timestamp: Date.now(), isSystem: true };
        setMessages(prev => [...prev, sysMsg].slice(-MAX_DISPLAY));
      }
    });

    sock.on('chatSlowMode', ({ remaining }) => {
      setSlowLeft(remaining);
      clearInterval(slowTimer.current);
      slowTimer.current = setInterval(() => {
        setSlowLeft(prev => {
          if (prev <= 1) { clearInterval(slowTimer.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    });

    setSocket(sock);
    return () => { sock.disconnect(); };
  }, [isLoggedIn, user]);

  // Keep openRef in sync and clear unread when panel opens
  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(0);
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // ── Send ────────────────────────────────────────────────────────────────────
  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !socket || !connected || slowLeft > 0 || banned) return;
    const token = localStorage.getItem(TOKEN_KEY);
    socket.emit('sendMessage', { text, token });
    setInput('');
  }, [input, socket, connected, slowLeft, banned]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!isLoggedIn) return null;
  if (hideOnRoute) return null;

  return (
    <>
      {/* ── Suggestions button (above chat) ── */}
      <button
        className="chat-toggle suggestions-toggle"
        onClick={() => navigate('/suggestions')}
        aria-label="Make a suggestion"
      >
        <span className="chat-toggle-icon">💡</span>
        <span className="chat-toggle-label">Suggest</span>
      </button>

      {/* ── Toggle button ── */}
      <button
        className={`chat-toggle${unread > 0 ? ' chat-toggle--unread' : ''}${open ? ' chat-toggle--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle chat"
      >
        <span className="chat-toggle-icon">💬</span>
        <span className="chat-toggle-label">Chat</span>
        {unread > 0 && <span className="chat-toggle-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {/* ── Panel ── */}
      <div className={`chat-panel${open ? ' chat-panel--open' : ''}`}>
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <span className="chat-header-title">💬 Global Chat</span>
            <span className={`chat-dot${connected ? ' chat-dot--on' : ''}`} title={connected ? 'Connected' : 'Connecting…'} />
          </div>
          <button className="chat-close" onClick={() => setOpen(false)}>✕</button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">No messages yet. Say hi! 👋</div>
          )}
          {messages.map((m) => {
            const isMe      = m.username === user?.username?.toLowerCase();
            const isAdm     = m.isAdmin || m.username === 'jasper';
            const isChamp   = !isAdm && champion?.username === m.username;
            const hue       = userHue(m.username);
            return (
              <div key={m.id} className={`chat-msg${isMe ? ' chat-msg--me' : ''}${isAdm ? ' chat-msg--admin' : ''}${isChamp ? ' chat-msg--champion' : ''}`}>
                <div className="chat-msg-header">
                  <span
                    className="chat-msg-name"
                    style={isAdm ? {} : isChamp ? { color: '#FFD700' } : { color: `hsl(${hue},65%,68%)` }}
                  >
                    {isAdm   && <span className="chat-admin-badge">👑</span>}
                    {isChamp && <span className="chat-admin-badge">👑</span>}
                    {m.vipTier && !isAdm && !isChamp && (
                      <span className="chat-vip-badge" style={{ color: m.vipTier.color }} title={`${m.vipTier.name} VIP`}>
                        {m.vipTier.icon}
                      </span>
                    )}
                    {m.displayName || m.username}
                  </span>
                  <span className="chat-msg-time">{fmt(m.timestamp)}</span>
                </div>
                <div className="chat-msg-text">{m.text}</div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Violation toast */}
        {violation && (
          <div className={`chat-violation${violation.muted ? ' chat-violation--muted' : ''}`}>
            {violation.muted
              ? `🔇 You've been muted: ${violation.reason}`
              : `⚠️ ${violation.reason}`}
          </div>
        )}

        {/* Banned message */}
        {banned && (
          <div className="chat-banned">
            🚫 You are banned from chat.
            {banned.reason ? ` Reason: ${banned.reason}.` : ''}
            {banned.expiresAt
              ? ` Until: ${new Date(banned.expiresAt).toLocaleString()}`
              : ' (Permanent)'}
          </div>
        )}

        {/* Input area */}
        {!banned && (
          <div className="chat-input-area">
            {slowLeft > 0 && (
              <div className="chat-slow">⏳ Slow mode — wait {slowLeft}s</div>
            )}
            <div className="chat-input-row">
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={2}
                maxLength={MAX_LEN}
                placeholder="Say something…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={slowLeft > 0}
              />
              <button
                className="chat-send"
                onClick={send}
                disabled={!input.trim() || slowLeft > 0 || !connected}
              >➤</button>
            </div>
            <div className="chat-char-count">{input.length}/{MAX_LEN}</div>
          </div>
        )}
      </div>

      {/* Backdrop (mobile) */}
      {open && <div className="chat-backdrop" onClick={() => setOpen(false)} />}
    </>
  );
}
