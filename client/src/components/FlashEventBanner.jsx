import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function FlashEventBanner() {
  const [event, setEvent] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    // Fetch current on mount
    fetch(`${SERVER_URL}/api/flash-events/current`)
      .then(r => r.json())
      .then(d => { if (d.ok && d.event) setEvent(d.event); })
      .catch(() => {});

    const sock = io(SERVER_URL + '/chat', { autoConnect: false });
    socketRef.current = sock;
    sock.connect();
    sock.on('flashEventStart', (ev) => setEvent(ev));
    return () => sock.disconnect();
  }, []);

  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => {
      const left = Math.max(0, event.endsAt - Date.now());
      setRemaining(left);
      if (left <= 0) setEvent(null);
    }, 250);
    return () => clearInterval(id);
  }, [event]);

  if (!event) return null;

  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="flash-event-banner" style={{ color: event.info.color }}>
      <span className="flash-event-banner-emoji">{event.info.emoji}</span>
      <div>
        <div className="flash-event-banner-name" style={{ color: event.info.color }}>
          {event.info.name}
        </div>
        <div className="flash-event-banner-desc">{event.info.desc}</div>
      </div>
      <span className="flash-event-banner-timer">⏱ {seconds}s</span>
    </div>
  );
}
