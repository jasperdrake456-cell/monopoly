import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ChampionPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const CASINO_GAMES = [
  { slug: 'crash',        name: 'Crash' },
  { slug: 'plinko',       name: 'Plinko' },
  { slug: 'dice',         name: 'Dice' },
  { slug: 'roulette',     name: 'Roulette' },
  { slug: 'blackjack',    name: 'Blackjack' },
  { slug: 'baccarat',     name: 'Baccarat' },
  { slug: 'mines',        name: 'Mines' },
  { slug: 'ride-the-bus', name: 'Ride the Bus' },
  { slug: 'slots',        name: 'Slots' },
  { slug: 'chicken-cross',name: 'Chicken Cross' },
  { slug: 'texas-holdem', name: "Texas Hold'em" },
  { slug: 'hilo',         name: 'HiLo' },
  { slug: 'tower',        name: 'Tower' },
  { slug: 'wheel',        name: 'Wheel' },
  { slug: 'video-poker',  name: 'Video Poker' },
  { slug: 'keno',         name: 'Keno' },
  { slug: 'dragon-tiger', name: 'Dragon Tiger' },
];

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

  // GOTD override state
  const [gotdGame, setGotdGame] = useState('crash');

  // Airdrop state
  const [airdropUser,   setAirdropUser]   = useState('');
  const [airdropAmount, setAirdropAmount] = useState('');

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
      flash(true, '🎉 Happy hour started! All casino games now pay 1.5× for 30 minutes.');
      loadPanel();
    } else {
      flash(false, data.error || 'Happy hour failed.');
    }
  }

  async function sendGotd() {
    const data = await authFetch('/api/champion/gotd', token, {
      method: 'POST',
      body: JSON.stringify({ game: gotdGame }),
    });
    if (data.ok) {
      const name = CASINO_GAMES.find(g => g.slug === gotdGame)?.name || gotdGame;
      flash(true, `🎯 ${name} is now today's Game of the Day! Everyone on the homepage can see it.`);
      loadPanel();
    } else {
      flash(false, data.error || 'Failed to set Game of the Day.');
    }
  }

  async function sendAirdrop() {
    if (!airdropUser.trim()) return flash(false, 'Enter a username.');
    const amt = parseInt(airdropAmount, 10);
    if (!amt || amt < 1 || amt > 50000) return flash(false, 'Enter an amount between $1 and $50,000.');
    const data = await authFetch('/api/champion/airdrop', token, {
      method: 'POST',
      body: JSON.stringify({ username: airdropUser.trim(), amount: amt }),
    });
    if (data.ok) {
      const who = airdropUser.trim();
      setAirdropUser('');
      setAirdropAmount('');
      flash(true, `💸 Airdropped $${amt.toLocaleString()} to @${who}! It's announced in chat.`);
      loadPanel();
    } else {
      flash(false, data.error || 'Airdrop failed.');
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

  const { broadcasts, mutes, happyHour, champion, gotd, airdrop } = panel;

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
            Resets daily at midnight.
          </div>
          <div className="champ-uses">
            {Array.from({ length: broadcasts.limit }).map((_, i) => (
              <span key={i} className={`champ-pip ${i < broadcasts.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            ))}
            <span className="champ-uses-label">
              {broadcasts.limit - broadcasts.used} / {broadcasts.limit} left today
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
            <div className="champ-exhausted">All broadcasts used today — resets at midnight.</div>
          )}
        </div>

        {/* 🔇 Mute */}
        <div className="champ-card">
          <div className="champ-card-icon">🔇</div>
          <div className="champ-card-title">Mute a Player</div>
          <div className="champ-card-desc">
            Silence any player from chat for 1 hour.
            Resets daily at midnight.
          </div>
          <div className="champ-uses">
            {Array.from({ length: mutes.limit }).map((_, i) => (
              <span key={i} className={`champ-pip ${i < mutes.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            ))}
            <span className="champ-uses-label">
              {mutes.limit - mutes.used} / {mutes.limit} left today
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
            <div className="champ-exhausted">All mutes used today — resets at midnight.</div>
          )}
        </div>

        {/* 🎁 Happy Hour */}
        <div className="champ-card">
          <div className="champ-card-icon">🎁</div>
          <div className="champ-card-title">Happy Hour</div>
          <div className="champ-card-desc">
            Activate 1.5× payouts on all casino games for everyone — for 30 minutes.
            One use per day, resets at midnight.
          </div>
          {happyHour.active ? (
            <div className="champ-hh-active">
              🎉 Happy hour is LIVE!
              <div className="champ-hh-countdown">{hhCountdown}</div>
            </div>
          ) : happyHour.used ? (
            <div className="champ-exhausted">Happy hour already used today — resets at midnight.</div>
          ) : (
            <button className="champ-btn champ-btn--gold" onClick={startHappyHour}>
              🎁 Start Happy Hour
            </button>
          )}
        </div>

        {/* 🎯 Game of the Day Override */}
        <div className="champ-card">
          <div className="champ-card-icon">🎯</div>
          <div className="champ-card-title">Game of the Day</div>
          <div className="champ-card-desc">
            Override today's featured game on the homepage. Everyone sees it with bonus odds.
            One use per day, resets at midnight.
          </div>
          <div className="champ-uses">
            <span className={`champ-pip ${gotd?.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            <span className="champ-uses-label">
              {gotd?.used ? '0 / 1 left today' : '1 / 1 left today'}
            </span>
          </div>
          {gotd?.used ? (
            <div className="champ-exhausted">
              Game of the Day set to <strong>{CASINO_GAMES.find(g => g.slug === gotd.game)?.name || gotd.game || 'a game'}</strong> — resets at midnight.
            </div>
          ) : (
            <>
              <select
                className="champ-select"
                value={gotdGame}
                onChange={e => setGotdGame(e.target.value)}
              >
                {CASINO_GAMES.map(g => (
                  <option key={g.slug} value={g.slug}>{g.name}</option>
                ))}
              </select>
              <button className="champ-btn champ-btn--teal" onClick={sendGotd}>
                🎯 Set Game of the Day
              </button>
            </>
          )}
        </div>

        {/* 💸 Airdrop */}
        <div className="champ-card">
          <div className="champ-card-icon">💸</div>
          <div className="champ-card-title">Airdrop</div>
          <div className="champ-card-desc">
            Send up to $50,000 to any player. Announced publicly in chat — everyone
            will know who you chose. One use per day, resets at midnight.
          </div>
          <div className="champ-uses">
            <span className={`champ-pip ${airdrop?.used ? 'champ-pip--used' : 'champ-pip--free'}`} />
            <span className="champ-uses-label">
              {airdrop?.used ? '0 / 1 left today' : '1 / 1 left today'}
            </span>
          </div>
          {airdrop?.used ? (
            <div className="champ-exhausted">Airdrop already sent today — resets at midnight.</div>
          ) : (
            <>
              <input
                className="champ-input"
                type="text"
                placeholder="Username to airdrop"
                value={airdropUser}
                onChange={e => setAirdropUser(e.target.value)}
              />
              <input
                className="champ-input"
                type="number"
                placeholder="Amount (max $50,000)"
                min={1}
                max={50000}
                value={airdropAmount}
                onChange={e => setAirdropAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendAirdrop()}
              />
              <button className="champ-btn champ-btn--green" onClick={sendAirdrop}>
                💸 Send Airdrop
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
