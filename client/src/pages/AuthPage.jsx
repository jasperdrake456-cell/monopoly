import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]         = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Fill in all fields'); return; }
    if (mode === 'register' && password !== confirm) { setError("Passwords don't match"); return; }

    setLoading(true);
    try {
      const result = mode === 'login'
        ? await login(username, password)
        : await register(username, password);

      if (result.ok) {
        navigate('/');
      } else {
        setError(result.error || 'Something went wrong');
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
        {/* Logo */}
        <div className="auth-logo">🎮 Game Vault</div>
        <div className="auth-subtitle">
          {mode === 'login' ? 'Sign in to save your progress' : 'Create an account'}
        </div>

        {/* Toggle tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >Sign In</button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >Create Account</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            Username
            <input
              className="auth-input"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="letters, numbers, _ -"
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
              placeholder="4+ characters"
            />
          </label>

          {mode === 'register' && (
            <label className="auth-label">
              Confirm Password
              <input
                className="auth-input"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'register' && (
          <div className="auth-perks">
            <div className="auth-perk">💰 Start with <strong>$500</strong> casino balance</div>
            <div className="auth-perk">🎁 <strong>$250 daily</strong> reward at 8am</div>
            <div className="auth-perk">💸 Transfer money to friends</div>
            <div className="auth-perk">📈 Progress saved across devices</div>
          </div>
        )}

        <Link to="/" className="auth-back">← Back to Game Vault</Link>
      </div>
    </div>
  );
}
