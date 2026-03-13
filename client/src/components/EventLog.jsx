import React, { useEffect, useRef } from 'react';
import './EventLog.css';

export default function EventLog({ log }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  return (
    <div className="event-log">
      <div className="log-header">📜 Game Log</div>
      <div className="log-entries">
        {log.map((entry, i) => (
          <div key={i} className="log-entry">
            <span className="log-dot">•</span>
            {entry}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
