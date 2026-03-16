import React, { useState, useEffect, useRef } from 'react';
import './GameChat.css';

export default function GameChat({ messages, onSend, onClose }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <div className="gchat-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="gchat-panel">
        <div className="gchat-header">
          <span>💬 Game Chat</span>
          <button className="gchat-close" onClick={onClose}>✕</button>
        </div>
        <div className="gchat-messages">
          {messages.length === 0 && (
            <div className="gchat-empty">No messages yet — say something!</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="gchat-msg">
              <span className="gchat-name">{m.name}</span>
              <span className="gchat-text">{m.text}</span>
              <span className="gchat-time">{m.time}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="gchat-input-row">
          <input
            className="gchat-input"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Type a message…"
            maxLength={200}
          />
          <button className="gchat-send" onClick={handleSend} disabled={!text.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
