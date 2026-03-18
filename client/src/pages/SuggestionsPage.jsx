import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SuggestionsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const MAX_LENGTH = 500;

const STATUS_LABELS = {
  pending:  { label: '⏳ Pending Review', cls: 'suggestions-badge--pending' },
  accepted: { label: '✅ Accepted',       cls: 'suggestions-badge--accepted' },
  denied:   { label: '❌ Denied',         cls: 'suggestions-badge--denied' },
};

export default function SuggestionsPage() {
  const { token, isLoggedIn } = useAuth();

  const [loading, setLoading]           = useState(true);
  const [existing, setExisting]         = useState(null); // { text, status } or null
  const [text, setText]                 = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState('');
  const [showForm, setShowForm]         = useState(false);

  // Fetch existing suggestion on mount (if logged in)
  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    fetch(`${SERVER_URL}/api/suggestions/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        // API returns { suggestion: { text, status } } or { suggestion: null }
        setExisting(data.suggestion || null);
      })
      .catch(() => setExisting(null))
      .finally(() => setLoading(false));
  }, [isLoggedIn, token]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_LENGTH) return;

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit suggestion.');
      } else {
        setExisting(data.suggestion || { text: trimmed, status: 'pending' });
        setText('');
        setShowForm(false);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Determine if the user can submit a new suggestion
  // They can submit when: no existing suggestion, or existing was accepted/denied
  const canSubmitNew = !existing || existing.status === 'accepted' || existing.status === 'denied';
  const isOver = text.length > MAX_LENGTH;

  return (
    <div className="suggestions-page">
      <div className="suggestions-header">
        <h1>💡 Suggestions</h1>
        <p>Got an idea for a new game or feature? Let us know!</p>
      </div>

      <div className="suggestions-card">
        {/* Not logged in */}
        {!isLoggedIn && (
          <div className="suggestions-login-prompt">
            <p>You need to be logged in to submit a suggestion.</p>
            <Link to="/auth" className="suggestions-login-link">Log In / Sign Up</Link>
          </div>
        )}

        {/* Loading */}
        {isLoggedIn && loading && (
          <div className="suggestions-loading">Loading…</div>
        )}

        {/* Logged in, loaded */}
        {isLoggedIn && !loading && (
          <>
            {/* Has an existing suggestion */}
            {existing && !showForm && (
              <div className="suggestions-status-block">
                <p className="suggestions-status-text">Your current suggestion:</p>
                <div className="suggestion-bubble">{existing.text}</div>
                {existing.status && (
                  <span className={`suggestions-badge ${STATUS_LABELS[existing.status]?.cls || ''}`}>
                    {STATUS_LABELS[existing.status]?.label || existing.status}
                  </span>
                )}
                {canSubmitNew && (
                  <button
                    className="suggestions-new-btn"
                    onClick={() => { setShowForm(true); setError(''); setText(''); }}
                  >
                    + Submit a new suggestion
                  </button>
                )}
              </div>
            )}

            {/* No existing suggestion, or user clicked "new suggestion" */}
            {(!existing || showForm) && (
              <form className="suggestions-form" onSubmit={handleSubmit}>
                <label htmlFor="suggestion-text">Your suggestion</label>
                <textarea
                  id="suggestion-text"
                  className="suggestions-textarea"
                  placeholder="e.g. Add a Poker game, or show a daily bonus wheel…"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  disabled={submitting}
                />
                <div className={`suggestions-char-count${isOver ? ' over' : ''}`}>
                  {text.length} / {MAX_LENGTH}
                </div>
                {error && <p className="suggestions-error">{error}</p>}
                <button
                  type="submit"
                  className="suggestions-submit-btn"
                  disabled={submitting || !text.trim() || isOver}
                >
                  {submitting ? 'Submitting…' : 'Submit Suggestion'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
