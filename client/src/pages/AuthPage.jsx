import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthPage.css';

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Fill in all fields'); return; }

    setLoading(true);
    try {
      const result = await login(username, password);
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
        <div className="auth-subtitle">Sign in to your account</div>

        <form className="auth-form" onSubmit={handleSubmit}>
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

        <div className="auth-no-account">
          Don't have an account? Contact the admin to get one.
        </div>

        <Link to="/" className="auth-back">← Back to Game Vault</Link>
      </div>
    </div>
  );
}
