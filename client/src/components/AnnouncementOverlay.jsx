import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './AnnouncementOverlay.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const AUTO_DISMISS_MS = 8000;

export default function AnnouncementOverlay() {
  const [queue, setQueue]     = useState([]);   // array of { id, text }
  const socketRef             = useRef(null);
  const timerRef              = useRef(null);

  useEffect(() => {
    const sock = io(SERVER_URL + '/chat', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = sock;

    sock.on('announcement', ({ text }) => {
      const id = Date.now() + Math.random();
      setQueue(q => [...q, { id, text }]);
    });

    return () => { sock.disconnect(); };
  }, []);

  // Auto-dismiss the front announcement after AUTO_DISMISS_MS
  useEffect(() => {
    if (queue.length === 0) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setQueue(q => q.slice(1));
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [queue]);

  if (queue.length === 0) return null;

  const current = queue[0];

  return (
    <div className="ann-overlay" onClick={() => setQueue(q => q.slice(1))}>
      <div className="ann-box" onClick={e => e.stopPropagation()}>
        <div className="ann-icon">📢</div>
        <div className="ann-label">Admin Announcement</div>
        <div className="ann-text">{current.text}</div>
        {queue.length > 1 && (
          <div className="ann-more">+{queue.length - 1} more</div>
        )}
        <button className="ann-close" onClick={() => setQueue(q => q.slice(1))}>✕ Dismiss</button>
        <div className="ann-progress">
          <div className="ann-progress-bar" style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} />
        </div>
      </div>
    </div>
  );
}
