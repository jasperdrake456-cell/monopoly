import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function AuthPage() {
  const { login } = useAuth();
  const navigate   = useNavigate();

  const [tab,       setTab]       = useState('login');  // 'login' | 'register'
  const [username,  setUsername]  = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Fill in all fields'); return; }
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.ok) navigate('/');
      else setError(result.error || 'Invalid username or password');
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Fill in all fields'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/accounts/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await res.json();
      if (d.ok) {
        // Auto-login after registration
        const loginResult = await login(username, password);
        if (loginResult.ok) navigate('/');
        else { setError('Registered! Please sign in.'); setTab('login'); }
      } else {
        setError(d.error || 'Registration failed');
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🎮 Game Vault</div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => { setTab('login'); setError(''); }}
          >Sign In</button>
          <button
            className={`auth-tab${tab === 'register' ? ' auth-tab--active' : ''}`}
            onClick={() => { setTab('register'); setError(''); }}
          >Create Account</button>
        </div>

        {tab === 'login' ? (
          <>
            <div className="auth-subtitle">Welcome back!</div>
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-label">
                Username
                <input
                  className="auth-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Your username"
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <label className="auth-label">
                Password
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? '…' : 'Sign In'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="auth-subtitle">Join for free — start with $2,000!</div>
            <form className="auth-form" onSubmit={handleRegister}>
              <label className="auth-label">
                Username
                <input
                  className="auth-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="3–20 characters (a–z, 0–9, _ -)"
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <label className="auth-label">
                Password
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 4 characters"
                />
              </label>
              <label className="auth-label">
                Confirm Password
                <input
                  className="auth-input"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                />
              </label>
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit auth-submit--register" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : '🎮 Create Account'}
              </button>
              <div className="auth-note">
                You'll start with <strong>$2,000</strong> in play money. No real money involved.
              </div>
            </form>
          </>
        )}

        <Link to="/" className="auth-back">← Back to Game Vault</Link>
      </div>
    </div>
  );
}
