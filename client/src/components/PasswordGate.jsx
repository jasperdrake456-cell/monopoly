import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './PasswordGate.css';

const DISABLED = true; // temporary: password gate off
const KEY = 'platform_auth';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function PasswordGate({ children }) {
  if (DISABLED) return children;
  const [authed, setAuthed]   = useState(() => sessionStorage.getItem(KEY) === 'ok');
  const [input, setInput]     = useState('');
  const [error, setError]     = useState(false);
  const [shake, setShake]     = useState(false);
  const [loading, setLoading] = useState(false);

  // Force logout when server rotates the password
  useEffect(() => {
    const socket = io(SERVER_URL, { autoConnect: true });
    socket.on('force-logout', () => {
      sessionStorage.removeItem(KEY);
      setAuthed(false);
    });
    return () => socket.disconnect();
  }, []);

  if (authed) return children;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        sessionStorage.setItem(KEY, 'ok');
        setAuthed(true);
      } else {
        throw new Error('wrong');
      }
    } catch {
      setError(true);
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pg-backdrop">
      <div className={`pg-card ${shake ? 'pg-shake' : ''}`}>
        <div className="pg-lock">🔒</div>
        <h1 className="pg-title">Game Vault</h1>
        <p className="pg-subtitle">Enter the password to continue</p>
        <form onSubmit={handleSubmit} className="pg-form">
          <input
            className={`pg-input ${error ? 'pg-input--error' : ''}`}
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="off"
            disabled={loading}
          />
          {error && <p className="pg-error">Incorrect password</p>}
          <button className="pg-btn" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
