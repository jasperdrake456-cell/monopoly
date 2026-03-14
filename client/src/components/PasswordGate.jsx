import React, { useState } from 'react';
import './PasswordGate.css';

const CORRECT = 'MrMoney';
const KEY = 'platform_auth';

export default function PasswordGate({ children }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(KEY) === 'ok');
  const [input, setInput]   = useState('');
  const [error, setError]   = useState(false);
  const [shake, setShake]   = useState(false);

  if (authed) return children;

  function handleSubmit(e) {
    e.preventDefault();
    if (input === CORRECT) {
      sessionStorage.setItem(KEY, 'ok');
      setAuthed(true);
    } else {
      setError(true);
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <div className="pg-backdrop">
      <div className={`pg-card ${shake ? 'pg-shake' : ''}`}>
        <div className="pg-lock">🔒</div>
        <h1 className="pg-title">Game Hub</h1>
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
          />
          {error && <p className="pg-error">Incorrect password</p>}
          <button className="pg-btn" type="submit">Enter</button>
        </form>
      </div>
    </div>
  );
}
