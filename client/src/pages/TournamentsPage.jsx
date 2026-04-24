import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './TournamentsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

function ms2clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m ${String(ss).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, '0')}s`;
  return `${ss}s`;
}

function StatusBadge({ status }) {
  const map = {
    scheduled: { label: '⏰ SCHEDULED', color: '#3b82f6' },
    active:    { label: '🔴 LIVE',      color: '#22c55e' },
    ended:     { label: '✔ ENDED',     color: '#94a3b8' },
    cancelled: { label: '🚫 CANCELLED', color: '#ef4444' },
  };
  const m = map[status] || map.scheduled;
  return <span className="tourn-badge" style={{ color: m.color, borderColor: m.color }}>{m.label}</span>;
}

export default function TournamentsPage() {
  const { token, user, isLoggedIn, isAdmin } = useAuth();
  const [data, setData] = useState({ active: [], upcoming: [], all: [] });
  const [selected, setSelected] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);
  const sockRef = useRef(null);

  // Admin form
  const [form, setForm] = useState({
    name: '', description: '', gameTag: '*',
    entryFee: 5000, hours: 1, split: '50,30,20', minEntries: 2,
  });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/tournaments`);
      const d = await r.json();
      if (d.ok) setData(d);
    } catch {}
  }, []);

  const loadDetails = useCallback(async (id) => {
    if (!id) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/tournaments/${id}`);
      const d = await r.json();
      if (d.ok) {
        setSelected(d.tournament);
        setLeaderboard(d.leaderboard);
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    const s = io(SERVER_URL + '/chat', { autoConnect: false });
    sockRef.current = s;
    s.connect();
    ['tournamentCreated','tournamentUpdate','tournamentStarted','tournamentEnded']
      .forEach(ev => s.on(ev, () => {
        refresh();
        if (selected) loadDetails(selected.id);
      }));
    return () => { clearInterval(id); s.disconnect(); };
  }, [refresh, loadDetails, selected]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (selected) {
      const id = setInterval(() => loadDetails(selected.id), 6000);
      return () => clearInterval(id);
    }
  }, [selected, loadDetails]);

  async function join(t) {
    setMsg('');
    if (!isLoggedIn) return setMsg('❌ Log in to join');
    if (getBalance() < t.entryFee) return setMsg('❌ Insufficient balance');
    try {
      const r = await fetch(`${SERVER_URL}/api/tournaments/${t.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setMsg(`✅ Joined "${t.name}"`);
        refresh();
        loadDetails(t.id);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
  }

  async function adminCreate() {
    const startsAt = Date.now() + 60_000; // starts in 1 min
    const endsAt   = startsAt + form.hours * 3_600_000;
    const split    = form.split.split(',').map(s => Number(s.trim())/100).filter(n => Number.isFinite(n) && n > 0);
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, entryFee: Math.floor(form.entryFee), startsAt, endsAt, split }),
      });
      const d = await r.json();
      if (d.ok) {
        refresh();
        setMsg(`✅ Created "${d.tournament.name}"`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
  }

  async function adminCancel(id) {
    if (!window.confirm('Cancel this tournament and refund all entries?')) return;
    try {
      await fetch(`${SERVER_URL}/api/admin/tournaments/${id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      refresh();
    } catch {}
  }

  const iAmIn = (t) => token && user && t.entries.some(e => e.username === user.username?.toLowerCase());

  function renderCard(t) {
    const starting = t.status === 'scheduled';
    const live     = t.status === 'active';
    const timeLabel = starting ? `Starts in ${ms2clock(Math.max(0, t.startsAt - Date.now()))}`
                    : live     ? `Ends in ${ms2clock(Math.max(0, t.endsAt - Date.now()))}`
                    : new Date(t.endsAt).toLocaleString();
    return (
      <div key={t.id} className={`tourn-card ${live ? 'tourn-card--live' : ''}`} onClick={() => { setSelected(t); loadDetails(t.id); }}>
        <div className="tourn-card-top">
          <div className="tourn-card-name">{t.name}</div>
          <StatusBadge status={t.status} />
        </div>
        {t.description && <div className="tourn-card-desc">{t.description}</div>}
        <div className="tourn-card-row">
          <span>🎮 Game</span>
          <b>{t.gameTag === '*' ? 'All Casino' : t.gameTag}</b>
        </div>
        <div className="tourn-card-row">
          <span>💰 Entry</span>
          <b>{t.entryFee > 0 ? fmt(t.entryFee) : 'FREE'}</b>
        </div>
        <div className="tourn-card-row">
          <span>🏆 Prize Pool</span>
          <b className="tourn-card-pool">{fmt(t.prizePool)}</b>
        </div>
        <div className="tourn-card-row">
          <span>👥 Entries</span>
          <b>{t.entries.length}</b>
        </div>
        <div className="tourn-card-time">{timeLabel}</div>
        {(starting || live) && (
          <div className="tourn-card-actions" onClick={e => e.stopPropagation()}>
            {isLoggedIn && !iAmIn(t) && (
              <button className="gv-btn gv-btn--gold" onClick={() => join(t)}>
                {t.entryFee > 0 ? `💎 Join for ${fmt(t.entryFee)}` : '💎 Join Free'}
              </button>
            )}
            {iAmIn(t) && <span className="tourn-joined-pill">✓ You're in</span>}
            {isAdmin && <button className="gv-btn gv-btn--ghost" onClick={() => adminCancel(t.id)}>Cancel</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tourn-page">
      <div className="tourn-header">
        <Link to="/" className="tourn-back">← Home</Link>
        <div className="tourn-title">🏆 Tournaments</div>
        {isLoggedIn && <div className="tourn-bal">Balance: <b>{fmt(getBalance())}</b></div>}
      </div>

      <div className="tourn-hero">
        <div className="tourn-hero-title">Compete. Climb. Cash out.</div>
        <div className="tourn-hero-sub">
          Pay the entry fee, play the game, biggest net profit wins the pot.
        </div>
      </div>

      {isAdmin && (
        <div className="tourn-admin">
          <div className="tourn-admin-label">⚙️ Create Tournament</div>
          <input className="gv-input" placeholder="Tournament name"
            value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <input className="gv-input" placeholder="Description"
            value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
          <div className="tourn-admin-row">
            <label>Game <select className="gv-input" value={form.gameTag} onChange={e => setForm({...form, gameTag: e.target.value})}>
              <option value="*">All Casino</option>
              <option value="crash">Crash</option>
              <option value="slots">Slots</option>
              <option value="roulette">Roulette</option>
              <option value="mines">Mines</option>
              <option value="dice">Dice</option>
              <option value="blackjack">Blackjack</option>
              <option value="plinko">Plinko</option>
              <option value="wheel">Wheel</option>
              <option value="limbo">Limbo</option>
              <option value="keno">Keno</option>
              <option value="hilo">HiLo</option>
              <option value="tower">Tower</option>
            </select></label>
            <label>Entry fee <input className="gv-input" type="number" min={0} step={1000}
              value={form.entryFee} onChange={e => setForm({...form, entryFee: Number(e.target.value)})} /></label>
            <label>Hours <input className="gv-input" type="number" min={0.5} step={0.5}
              value={form.hours} onChange={e => setForm({...form, hours: Number(e.target.value)})} /></label>
            <label>Min entries <input className="gv-input" type="number" min={1} max={50}
              value={form.minEntries} onChange={e => setForm({...form, minEntries: Number(e.target.value)})} /></label>
          </div>
          <label>Prize split (%, comma-separated) <input className="gv-input"
            value={form.split} onChange={e => setForm({...form, split: e.target.value})} placeholder="50,30,20" /></label>
          <button className="gv-btn gv-btn--gold" onClick={adminCreate}>🚀 Create (starts in 1 min)</button>
        </div>
      )}

      {msg && <div className="tourn-msg">{msg}</div>}

      {data.active.length > 0 && (
        <>
          <h2 className="tourn-section">🔴 Live Now</h2>
          <div className="tourn-grid">{data.active.map(renderCard)}</div>
        </>
      )}

      {data.upcoming.length > 0 && (
        <>
          <h2 className="tourn-section">⏰ Upcoming</h2>
          <div className="tourn-grid">{data.upcoming.map(renderCard)}</div>
        </>
      )}

      <h2 className="tourn-section">📜 History</h2>
      {data.all.length === 0 ? (
        <div className="tourn-empty">No tournaments yet.</div>
      ) : (
        <div className="tourn-grid">{data.all.filter(t => t.status === 'ended' || t.status === 'cancelled').slice(0, 8).map(renderCard)}</div>
      )}

      {selected && (
        <div className="tourn-modal" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className="tourn-modal-box">
            <div className="tourn-modal-top">
              <h2>{selected.name}</h2>
              <button className="gv-btn gv-btn--ghost" onClick={() => setSelected(null)}>✖</button>
            </div>
            <div className="tourn-modal-meta">
              <StatusBadge status={selected.status} />
              <span>🏆 {fmt(selected.prizePool)} prize pool · {selected.entries.length} entries</span>
            </div>
            <h3>Leaderboard</h3>
            {leaderboard.length === 0 ? (
              <div className="tourn-empty">No entries yet.</div>
            ) : (
              <table className="tourn-lb">
                <thead>
                  <tr><th>#</th><th>Player</th><th>Net Profit</th><th>Wagered</th><th>Bets</th></tr>
                </thead>
                <tbody>
                  {leaderboard.map((e, i) => (
                    <tr key={e.username} className={user?.username?.toLowerCase() === e.username ? 'tourn-lb-me' : ''}>
                      <td>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</td>
                      <td>{e.username}</td>
                      <td className={e.netProfit >= 0 ? 'tourn-lb-pos' : 'tourn-lb-neg'}>
                        {e.netProfit >= 0 ? '+' : ''}{fmt(e.netProfit)}
                      </td>
                      <td>{fmt(e.wagered)}</td>
                      <td>{e.bets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {selected.winners && selected.winners.length > 0 && (
              <>
                <h3>🏆 Winners</h3>
                <ul className="tourn-winners">
                  {selected.winners.map(w => (
                    <li key={w.username}>#{w.rank} <b>{w.username}</b> — {fmt(w.prize)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
