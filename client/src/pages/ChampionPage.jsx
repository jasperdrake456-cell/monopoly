import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ChampionPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authFetch(path, token, options = {}) {
  return fetch(SERVER_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(r => r.json());
}

export default function ChampionPage() {
  const { user, token, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [panel,   setPanel]   = useState(null);  // server panel state
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState(null);  // { ok, msg }

  // Broadcast power state
  const [bcText, setBcText] = useState('');

  // Mute power state
  const [muteUser, setMuteUser] = useState('');

  // Countdown for active happy hour
  const [hhCountdown, setHhCountdown] = useState('');

  // ── Load panel ──────────────────────────────────────────────────────────────
  const loadPanel = useCallback(async () => {
    if (!token) return;
    try {
      const data = await authFetch('/api/champion/panel', token);
      if (data.ok) {
        setPanel(data);
      } else {
        // Not champion → redirect home
        navigate('/');
      }
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/auth'); return; }
    loadPanel();
  }, [isLoggedIn, loadPanel, navigate]);

  // ── Happy hour countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!panel?.happyHour?.active || !panel?.happyHour?.endsAt) {
      setHhCountdown('');
      return;
    }
    function tick() {
      const ms = panel.happyHour.endsAt - Date.now();
      if (ms <= 0) { setHhCountdown('Ended'); return; }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setHhCountdown(`${m}m ${s.toString().padStart(2, '0')}s remaining`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [panel]);

  // ── Powers ──────────────────────────────────────────────────────────────────
  function flash(ok, msg) {
    setStatus({ ok, msg });
    setTimeout(() => setStatus(null), 5000);
  }

  async function sendBroadcast() {
    if (!bcText.trim()) return flash(false, 'Enter a message first.');
    const data = await authFetch('/api/champion/broadcast', token, {
      method: 'POST',
      body: JSON.stringify({ text: bcText.trim() }),
    });
    if (data.ok) {
      setBcText('');
      flash(true, `📣 Broadcast sent! ${data.broadcastsLeft} left this week.`);
      loadPanel();
    } else {
      flash(false, data.error || 'Broadcast failed.');
    }
  }

  async function sendMute() {
    if (!muteUser.trim()) return flash(false, 'Enter a username.');
    const data = await authFetch('/api/champion/mute', token, {
      method: 'POST',
      body: JSON.stringify({ username: muteUser.trim() }),
    });
    if (data.ok) {
      setMuteUser('');
      flash(true, `🔇 ${muteUser.trim()} muted for 1 hour. ${data.mutesLeft} mute(s) left.`);
      loadPanel();
    } else {
      flash(false, data.error || 'Mute failed.');
    }
  }

  async function startHappyHour() {
    const data = await authFetch('/api/champion/happy-hour', token, { method: 'POST' });
    if (data.ok) {
      flash(true, '🎉 Happy hour started! All casino games now pay 2× for 30 minutes.');
      loadPanel();
    } else {
      flash(false, data.error || 'Happy hour failed.');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="champ-page">
        <div className="champ-loading">Loading champion panel…</div>
      </div>
    );
  }

  if (!panel) return null;

  const { broadcasts, mutes, happyHour, champion } = panel;

  return (
    <div className="champ-page">
      {/* Header */}
      <div className="champ-header">
        <div className="champ-crown">👑</div>
        <div className="champ-title">Champion Panel</div>
        <div className="champ-subtitle">
          Welcome, <strong>{champion?.displayName || user?.displayName}</strong>!
          You're this week's Casino Champion.
        </div>
        <Link to="/" className="champ-back">← Back to Game Vault</Link>
      </div>

      {/* Global status toast */}
      {status && (
        <div className={`champ-status ${status.ok ? 'champ-status--ok' : 'champ-status--err'}`}>
          {status.msg}
        </div>
      )}

      {/* Powers grid */}
      <div className="champ-grid">

        {/* 📣 Broadcast */}
        <div className="champ-card">
          <div className="champ-card-icon">📣</div>
          <div className="champ-card-title">Site-Wide Broadcast</div>
          <div className="champ-card-desc">
            Send a message that pops up for every player on the site.
          </div>
          <div className="champ-uses">
            {Array.from({ length: broadcasts.limit }).map((_, i) => (
              <span key={i} className={`champ-pip ${i < broadcasts.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            ))}
            <span className="champ-uses-label">
              {broadcasts.limit - broadcasts.used} / {broadcasts.limit} left
            </span>
          </div>
          {broadcasts.used < broadcasts.limit ? (
            <>
              <textarea
                className="champ-textarea"
                placeholder="Your message to everyone…"
                maxLength={200}
                value={bcText}
                onChange={e => setBcText(e.target.value)}
              />
              <button className="champ-btn champ-btn--purple" onClick={sendBroadcast}>
                📣 Send Broadcast
              </button>
            </>
          ) : (
            <div className="champ-exhausted">All broadcasts used this week.</div>
          )}
        </div>

        {/* 🔇 Mute */}
        <div className="champ-card">
          <div className="champ-card-icon">🔇</div>
          <div className="champ-card-title">Mute a Player</div>
          <div className="champ-card-desc">
            Silence any player from chat for 1 hour.
          </div>
          <div className="champ-uses">
            {Array.from({ length: mutes.limit }).map((_, i) => (
              <span key={i} className={`champ-pip ${i < mutes.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            ))}
            <span className="champ-uses-label">
              {mutes.limit - mutes.used} / {mutes.limit} left
            </span>
          </div>
          {mutes.used < mutes.limit ? (
            <>
              <input
                className="champ-input"
                type="text"
                placeholder="Username to mute"
                value={muteUser}
                onChange={e => setMuteUser(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMute()}
              />
              <button className="champ-btn champ-btn--red" onClick={sendMute}>
                🔇 Mute for 1 Hour
              </button>
            </>
          ) : (
            <div className="champ-exhausted">All mutes used this week.</div>
          )}
        </div>

        {/* 🎁 Happy Hour */}
        <div className="champ-card champ-card--wide">
          <div className="champ-card-icon">🎁</div>
          <div className="champ-card-title">Happy Hour</div>
          <div className="champ-card-desc">
            Activate 2× payouts on all casino games for everyone — for 30 minutes.
            One use per week.
          </div>
          {happyHour.active ? (
            <div className="champ-hh-active">
              🎉 Happy hour is LIVE!
              <div className="champ-hh-countdown">{hhCountdown}</div>
            </div>
          ) : happyHour.used ? (
            <div className="champ-exhausted">Happy hour already used this week.</div>
          ) : (
            <button className="champ-btn champ-btn--gold" onClick={startHappyHour}>
              🎁 Start Happy Hour
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
