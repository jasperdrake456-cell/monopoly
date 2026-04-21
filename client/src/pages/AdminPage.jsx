import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import { GAME_LIST } from '../utils/gameList';
import ChatLogModal from '../components/ChatLogModal';
import './AdminPage.css';

// ── Username moderation helpers ───────────────────────────────────────────────
const BAD_WORDS = [
  'fuck','shit','ass','bitch','cunt','dick','cock','pussy','bastard',
  'retard','piss','wank','prick','arse','twat','slag','whore','slut','skank',
  'nigger','nigga','chink','spic','kike','cracker','wetback','gook','beaner',
  'coon','jigaboo','sambo','zipperhead','redskin','injun','squaw',
  'raghead','towelhead','sandnigger','heeb','yid','hymie','greaseball',
  'dago','wop','guinea','polack','kraut','mick','paddy','paki','coolie','spaz',
  'jewboy','ihatejews','jewscum','gassthejews','killalljews','hitlerdidnothingwrong',
  'goatfucker','faggot','fag','dyke','tranny','shemale',
  'rape','lynch','nazi','hitler','kkk','heil','1488','rahowa','whitepride',
];
function normUsername(s) {
  return s.toLowerCase().replace(/[4@]/g,'a').replace(/3/g,'e').replace(/[1!|]/g,'i')
    .replace(/0/g,'o').replace(/[5$]/g,'s').replace(/7/g,'t').replace(/[^a-z0-9]/g,'');
}
function isSuspectUsername(username) {
  const n = normUsername(username);
  return BAD_WORDS.some(w => n.includes(normUsername(w)));
}

// Balance thresholds for flagging
const BAL_HIGH      = 100_000;
const BAL_VERY_HIGH = 1_000_000;

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authFetch(path, token, options = {}) {
  return fetch(SERVER_URL + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers },
    ...options,
  }).then(r => r.json());
}

// ── Audit log helpers (defined outside component to avoid re-creation) ────────
const AUDIT_LABELS = {
  give_money:              '💰 Give Money',
  set_balance:             '✏️ Set Balance',
  delete_user:             '🗑 Delete User',
  kick_user:               '👢 Kick User',
  ban_ip:                  '🚫 Ban IP',
  unban_ip:                '✅ Unban IP',
  ban_user:                '🚫 Ban User',
  unban_user:              '✅ Unban User',
  broadcast:               '📢 Broadcast',
  clear_leaderboard:       '🏆 Clear Leaderboard',
  danger_clear_violations: '⚠️ Clear All Violations',
  danger_unban_all_ips:    '⚠️ Unban All IPs',
  danger_unban_all_users:  '⚠️ Unban All Users',
  danger_kick_all:         '⚠️ Kick Everyone',
};

function formatAuditDetails(action, d) {
  if (!d) return '';
  switch (action) {
    case 'give_money':    return `$${Number(d.amount || 0).toLocaleString()} → @${d.target}`;
    case 'set_balance':   return `@${d.target} → $${Number(d.amount || 0).toLocaleString()}`;
    case 'delete_user':   return `@${d.target}`;
    case 'kick_user':     return `@${d.target} (${d.sessionsKilled} session${d.sessionsKilled !== 1 ? 's' : ''})`;
    case 'ban_ip':        return `${d.ip}${d.reason ? ` — "${d.reason}"` : ''}${d.durationMs ? ` (${msToHuman(d.durationMs)})` : ' (permanent)'}`;
    case 'unban_ip':      return d.ip;
    case 'ban_user':      return `@${d.target} from ${Array.isArray(d.games) ? (d.games.includes('*') ? 'all' : d.games.join(', ')) : d.games}${d.reason ? ` — "${d.reason}"` : ''}`;
    case 'unban_user':    return `@${d.target}`;
    case 'broadcast':     return `"${d.text}"`;
    case 'clear_leaderboard': return d.gameId;
    case 'danger_clear_violations': return `${d.count} user(s)`;
    case 'danger_unban_all_ips':    return `${d.count} IP(s)`;
    case 'danger_unban_all_users':  return `${d.count} user(s)`;
    case 'danger_kick_all':         return `${d.sessionsKilled} session(s)`;
    default: return JSON.stringify(d);
  }
}

const GAME_DISPLAY_NAMES = {
  'crash':       '💥 Crash',
  'plinko':      '🔴 Plinko',
  'dice':        '🎲 Dice',
  'roulette':    '🎡 Roulette',
  'blackjack':   '♠️ Blackjack',
  'baccarat':    '🃏 Baccarat',
  'mines':       '💣 Mines',
  'ride-the-bus':'🚌 Ride the Bus',
  'slots':       '🎰 Slots',
  'chicken-cross':'🐔 Chicken Cross',
  'texas-holdem':'🤠 Texas Hold\'em',
  'hilo':        '🃏 HiLo',
  'tower':       '🏰 Tower',
  'wheel':       '🎡 Wheel',
  'video-poker': '🃏 Video Poker',
  'keno':        '🎱 Keno',
  'dragon-tiger':'🐉 Dragon Tiger',
};

function msToHuman(ms) {
  if (!ms) return 'permanent';
  const h = Math.round(ms / 3600000);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// ── Jackpot Admin Card ────────────────────────────────────────────────────────
function JackpotAdminCard({ token, authFetch }) {
  const [amount, setAmount]   = React.useState(null);
  const [status, setStatus]   = React.useState('');
  const [custom, setCustom]   = React.useState('');

  React.useEffect(() => {
    authFetch('/api/jackpot', token).then(d => { if (d.ok) setAmount(d.amount); });
  }, []);

  async function resetJackpot(val) {
    const res = await authFetch('/api/admin/jackpot/reset', token, {
      method: 'POST',
      body: JSON.stringify({ amount: val }),
    });
    if (res.ok) { setAmount(res.amount); setStatus(`✓ Jackpot reset to $${res.amount.toLocaleString()}`); }
    else setStatus(res.error || 'Failed');
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🎰 Slots Jackpot</div>
      <div className="admin-site-card-sub">
        Current pool: <strong style={{ color: '#f59e0b' }}>${amount != null ? amount.toLocaleString() : '…'}</strong>
      </div>
      {status && <div style={{ color: '#86efac', fontSize: '0.82rem', marginBottom: 8 }}>{status}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => resetJackpot(10000)}>Reset to $10k</button>
        <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => resetJackpot(50000)}>Reset to $50k</button>
        <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => resetJackpot(100000)}>Reset to $100k</button>
        <input className="admin-input" style={{ width: 100 }} type="number" placeholder="Custom $" value={custom}
          onChange={e => setCustom(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={!custom || isNaN(Number(custom))}
          onClick={() => { resetJackpot(Number(custom)); setCustom(''); }}>Set</button>
      </div>
    </div>
  );
}

// ── Lottery Admin Card ────────────────────────────────────────────────────────
function LotteryAdminCard({ token, authFetch }) {
  const [info,    setInfo]    = React.useState(null);
  const [status,  setStatus]  = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    authFetch('/api/lottery', token).then(d => { if (d.ok) setInfo(d); });
  }, []);

  async function handleDraw() {
    if (!window.confirm('Draw the lottery winner now? This cannot be undone.')) return;
    setLoading(true); setStatus('');
    const d = await authFetch('/api/admin/lottery/draw', token, { method: 'POST' });
    if (d.ok) {
      setStatus(d.winner ? `✓ Winner: ${d.winner} won $${d.jackpot?.toLocaleString()}` : '✓ No tickets — no winner drawn');
      authFetch('/api/lottery', token).then(r => { if (r.ok) setInfo(r); });
    } else setStatus(`✗ ${d.error || 'Failed'}`);
    setLoading(false);
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🎟️ Weekly Lottery</div>
      <div className="admin-site-card-sub">
        Jackpot: <strong style={{ color: '#a78bfa' }}>${info?.jackpot?.toLocaleString() ?? '…'}</strong>
        {' · '}{info?.tickets ?? '…'} tickets sold
        {info?.drawn && <span style={{ color: '#22c55e', marginLeft: 8 }}>✓ Already drawn</span>}
      </div>
      {status && <div style={{ fontSize: '0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5', marginBottom: 8 }}>{status}</div>}
      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleDraw} disabled={loading || info?.drawn}>
        {loading ? '…' : info?.drawn ? 'Already Drawn' : '🎲 Draw Winner Now'}
      </button>
    </div>
  );
}

// ── Wager Race Admin Card ─────────────────────────────────────────────────────
function WagerRaceAdminCard({ token, authFetch }) {
  const [info,    setInfo]    = React.useState(null);
  const [status,  setStatus]  = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    authFetch('/api/wager-race', token).then(d => { if (d.ok) setInfo(d); });
  }, []);

  async function handlePayout() {
    if (!window.confirm('Pay out wager race prizes and reset leaderboard now?')) return;
    setLoading(true); setStatus('');
    const d = await authFetch('/api/admin/wager-race/payout', token, { method: 'POST' });
    if (d.ok) {
      const names = (d.payouts || []).map(p => `${p.username} $${p.prize?.toLocaleString()}`).join(', ');
      setStatus(names ? `✓ Paid out: ${names}` : '✓ No leaders to pay out');
      authFetch('/api/wager-race', token).then(r => { if (r.ok) setInfo(r); });
    } else setStatus(`✗ ${d.error || 'Failed'}`);
    setLoading(false);
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🏁 Wager Race</div>
      <div className="admin-site-card-sub">
        Prize pool: <strong style={{ color: '#f59e0b' }}>${info?.prizePool?.toLocaleString() ?? '…'}</strong>
        {' · '}{info?.leaderboard?.length ?? 0} players racing · Week of {info?.week ?? '…'}
      </div>
      {status && <div style={{ fontSize: '0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5', marginBottom: 8 }}>{status}</div>}
      <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={handlePayout} disabled={loading}>
        {loading ? '…' : '🏆 Pay Out & Reset Race'}
      </button>
    </div>
  );
}

// ── Gift Code Admin Card ──────────────────────────────────────────────────────
function SecondaryAdminsCard({ token, authFetch }) {
  const [admins,  setAdmins]  = React.useState([]);
  const [newUser, setNewUser] = React.useState('');
  const [status,  setStatus]  = React.useState('');

  React.useEffect(() => {
    authFetch('/api/admin/secondary-admins', token).then(d => { if (d.ok) setAdmins(d.admins || []); });
  }, []);

  async function handleGrant() {
    if (!newUser.trim()) return;
    const d = await authFetch('/api/admin/secondary-admins', token, { method: 'POST', body: JSON.stringify({ username: newUser.trim() }) });
    if (d.ok) { setAdmins(prev => [...prev, newUser.trim().toLowerCase()]); setNewUser(''); setStatus('✓ Admin granted'); }
    else setStatus(`✗ ${d.error}`);
  }

  async function handleRevoke(u) {
    const d = await authFetch(`/api/admin/secondary-admins/${u}`, token, { method: 'DELETE' });
    if (d.ok) setAdmins(prev => prev.filter(x => x !== u));
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🛡️ Admin Management</div>
      <div className="admin-site-card-sub">Only you (owner) can grant or revoke admin access</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input className="admin-input" style={{ width: 180 }} placeholder="Username to grant admin" value={newUser} onChange={e => setNewUser(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleGrant} disabled={!newUser.trim()}>Grant Admin</button>
      </div>
      {status && <div style={{ fontSize: '0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5', marginBottom: 8 }}>{status}</div>}
      {admins.length === 0 ? (
        <div style={{ fontSize: '0.82rem', color: '#475569' }}>No secondary admins yet</div>
      ) : admins.map(u => (
        <div key={u} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ color: '#c084fc', fontWeight: 700 }}>{u}</span>
          <button className="admin-btn admin-btn--warn admin-btn--sm" style={{ padding: '2px 10px' }} onClick={() => handleRevoke(u)}>Revoke</button>
        </div>
      ))}
    </div>
  );
}

function CoinRainAdminCard({ token, authFetch }) {
  const [amount,  setAmount]  = React.useState('1000');
  const [message, setMessage] = React.useState('🌧️ Coin Rain!');
  const [status,  setStatus]  = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function handleRain() {
    if (loading) return;
    setLoading(true); setStatus('');
    const d = await authFetch('/api/admin/coin-rain', token, {
      method: 'POST',
      body: JSON.stringify({ amount: Number(amount), message }),
    });
    setStatus(d.ok ? `✓ Rained $${Number(amount).toLocaleString()} on ${d.credited} users` : `✗ ${d.error || 'Failed'}`);
    setLoading(false);
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🌧️ Coin Rain</div>
      <div className="admin-site-card-sub">Drop free coins on all online players at once</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="admin-input" style={{ width: 120 }} type="number" placeholder="Amount per player" value={amount} onChange={e => setAmount(e.target.value)} />
        <input className="admin-input" style={{ width: 200 }} placeholder="Message" value={message} onChange={e => setMessage(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleRain} disabled={loading || !amount}>
          {loading ? '…' : '🌧️ Rain Coins'}
        </button>
      </div>
      {status && <div style={{ fontSize: '0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{status}</div>}
    </div>
  );
}

function NewsAdminCard({ token, authFetch }) {
  const [items,   setItems]   = React.useState([]);
  const [title,   setTitle]   = React.useState('');
  const [body,    setBody]    = React.useState('');
  const [type,    setType]    = React.useState('info');
  const [pinned,  setPinned]  = React.useState(false);
  const [status,  setStatus]  = React.useState('');
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch('/api/news').then(r => r.json()).then(d => { if (d.ok) setItems(d.news); }).catch(() => {});
  }, []);

  async function post() {
    if (!title.trim() || loading) return;
    setLoading(true); setStatus('');
    const d = await authFetch('/api/admin/news', token, {
      method: 'POST',
      body: JSON.stringify({ title, body, type, pinned }),
    });
    if (d.ok) {
      setItems(prev => [d.item, ...prev]);
      setTitle(''); setBody('');
      setStatus('✓ Posted!');
    } else setStatus(`✗ ${d.error}`);
    setLoading(false);
  }

  async function deleteItem(id) {
    await authFetch(`/api/admin/news/${id}`, token, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">📢 Site News & Announcements</div>
      <div className="admin-site-card-sub">Post announcements shown on the homepage for all players</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
        <input className="admin-input" style={{ flex:2, minWidth:160 }} placeholder="Title*" value={title} onChange={e => setTitle(e.target.value)} />
        <select className="admin-input" value={type} onChange={e => setType(e.target.value)} style={{ width:100 }}>
          <option value="info">📢 Info</option>
          <option value="event">🎉 Event</option>
          <option value="update">🆕 Update</option>
          <option value="warning">⚠️ Warning</option>
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:4, color:'#94a3b8', fontSize:'0.82rem' }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin
        </label>
      </div>
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        <input className="admin-input" style={{ flex:1 }} placeholder="Body (optional)" value={body} onChange={e => setBody(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={post} disabled={loading || !title.trim()}>
          {loading ? '…' : 'Post'}
        </button>
      </div>
      {status && <div style={{ fontSize:'0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5', marginBottom:8 }}>{status}</div>}
      {items.slice(0, 5).map(n => (
        <div key={n.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderTop:'1px solid #1e293b', fontSize:'0.82rem' }}>
          <span style={{ flex:1 }}>{n.pinned ? '📌 ' : ''}{n.title}</span>
          <button onClick={() => deleteItem(n.id)} style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'0.8rem' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function BoostAdminCard({ token, authFetch }) {
  const [username, setUsername] = React.useState('');
  const [count,    setCount]    = React.useState('1');
  const [status,   setStatus]   = React.useState('');
  const [loading,  setLoading]  = React.useState(false);

  async function award() {
    if (!username.trim() || loading) return;
    setLoading(true); setStatus('');
    const d = await authFetch('/api/admin/boost/award', token, {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), count: Number(count) }),
    });
    setStatus(d.ok ? `✓ Awarded ${count} boost token(s) to ${username}` : `✗ ${d.error || 'Failed'}`);
    setLoading(false);
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🚀 Award Boost Tokens</div>
      <div className="admin-site-card-sub">Give a player boost tokens (2× wins for 30 min each)</div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
        <input className="admin-input" style={{ flex:2, minWidth:140 }} placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
        <input className="admin-input" style={{ width:70 }} type="number" min="1" max="10" value={count} onChange={e => setCount(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={award} disabled={loading || !username.trim()}>
          {loading ? '…' : '🚀 Award'}
        </button>
      </div>
      {status && <div style={{ fontSize:'0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{status}</div>}
    </div>
  );
}

function JackpotRushAdminCard({ token, authFetch }) {
  const [status,  setStatus]  = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    authFetch('/api/jackpot-rush', token).then(d => { if (d.ok) setStatus(d); }).catch(() => {});
  }, []);

  async function forceStart() {
    setLoading(true);
    const d = await authFetch('/api/admin/jackpot-rush/start', token, { method: 'POST' });
    if (d.ok) setStatus(d);
    setLoading(false);
  }

  const active    = status?.active;
  const remaining = status?.remaining ? Math.ceil(status.remaining / 60000) : 0;

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">⚡ Jackpot Rush</div>
      <div className="admin-site-card-sub">Force-start a 1-hour double jackpot period for slots</div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <span style={{ fontSize:'0.85rem', color: active ? '#22c55e' : '#64748b' }}>
          {active ? `🟢 ACTIVE — ${remaining}m remaining` : '⚫ Inactive'}
        </span>
        <button
          className="admin-btn admin-btn--primary admin-btn--sm"
          onClick={forceStart}
          disabled={loading || active}
          style={{ marginLeft:'auto' }}
        >
          {loading ? '…' : active ? '⚡ Active' : '⚡ Start Rush'}
        </button>
      </div>
    </div>
  );
}

function GiftCodeAdminCard({ token, authFetch }) {
  const [codes,    setCodes]    = React.useState([]);
  const [newCode,  setNewCode]  = React.useState('');
  const [newAmt,   setNewAmt]   = React.useState('');
  const [maxUses,  setMaxUses]  = React.useState('1');
  const [note,     setNote]     = React.useState('');
  const [status,   setStatus]   = React.useState('');

  React.useEffect(() => { loadCodes(); }, []);

  async function loadCodes() {
    const d = await authFetch('/api/admin/gift-codes', token);
    if (d.ok) setCodes(d.codes || []);
  }

  async function handleCreate() {
    if (!newCode.trim() || !newAmt) return;
    const d = await authFetch('/api/admin/gift-codes', token, {
      method: 'POST',
      body: JSON.stringify({ code: newCode.trim(), amount: Number(newAmt), maxUses: Number(maxUses) || 1, note }),
    });
    if (d.ok) {
      setStatus(`✓ Code ${d.entry.code} created`);
      setNewCode(''); setNewAmt(''); setNote(''); setMaxUses('1');
      loadCodes();
    } else {
      setStatus(`✗ ${d.error}`);
    }
  }

  async function handleDelete(code) {
    await authFetch(`/api/admin/gift-codes/${code}`, token, { method: 'DELETE' });
    setCodes(c => c.filter(x => x.code !== code));
  }

  return (
    <div className="admin-site-card">
      <div className="admin-site-card-title">🎁 Gift Codes</div>
      <div className="admin-site-card-sub">Create codes players can redeem for coins (via account menu)</div>

      {/* Create form */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="admin-input" style={{ width: 110 }} placeholder="CODE" value={newCode}
          onChange={e => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <input className="admin-input" style={{ width: 90 }} type="number" placeholder="$Amount" value={newAmt}
          onChange={e => setNewAmt(e.target.value)} />
        <input className="admin-input" style={{ width: 70 }} type="number" placeholder="Max uses" value={maxUses}
          onChange={e => setMaxUses(e.target.value)} title="0 = unlimited" />
        <input className="admin-input" style={{ width: 130 }} placeholder="Note (optional)" value={note}
          onChange={e => setNote(e.target.value)} />
        <button className="admin-btn admin-btn--primary admin-btn--sm"
          disabled={!newCode.trim() || !newAmt}
          onClick={handleCreate}>Create</button>
      </div>

      {status && <div style={{ fontSize: '0.82rem', color: status.startsWith('✓') ? '#86efac' : '#fca5a5', marginBottom: 8 }}>{status}</div>}

      {/* Code list */}
      {codes.length === 0 ? (
        <div style={{ color: '#475569', fontSize: '0.82rem' }}>No codes yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {codes.map(c => (
            <div key={c.code} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6 }}>
              <code style={{ color: '#c084fc', fontWeight: 700, minWidth: 110 }}>{c.code}</code>
              <span style={{ color: '#f59e0b', minWidth: 70 }}>${c.amount.toLocaleString()}</span>
              <span style={{ color: '#64748b', fontSize: '0.8rem', flex: 1 }}>
                {c.uses}/{c.maxUses === 0 ? '∞' : c.maxUses} uses{c.note ? ` · ${c.note}` : ''}
              </span>
              <button className="admin-btn admin-btn--warn admin-btn--sm" style={{ padding: '2px 10px' }}
                onClick={() => handleDelete(c.code)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user, token, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  // 5 top-level tabs: overview | users | games | moderation | settings
  const [tab, setTab] = useState('overview');

  // ── Core data ──────────────────────────────────────────────────────────────
  const [reports, setReports]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [bigWins, setBigWins]   = useState([]);
  const [status, setStatus]     = useState('');

  // ── User editing ───────────────────────────────────────────────────────────
  const [editingBal, setEditingBal] = useState(null);

  // ── Give money form ────────────────────────────────────────────────────────
  const [giveTarget, setGiveTarget] = useState('');
  const [giveAmount, setGiveAmount] = useState('');

  // ── Create Account ──────────────────────────────────────────────────────────
  const [newUser, setNewUser]   = useState('');
  const [newPass, setNewPass]   = useState('');

  // ── Dismissed flags ────────────────────────────────────────────────────────
  const [dismissedUsernames, setDismissedUsernames] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('admin_dismissed_usernames') || '[]')); }
    catch { return new Set(); }
  });
  const [dismissedBalances, setDismissedBalances] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('admin_dismissed_balances') || '[]')); }
    catch { return new Set(); }
  });

  function dismissUsername(username) {
    const next = new Set([...dismissedUsernames, username]);
    setDismissedUsernames(next);
    localStorage.setItem('admin_dismissed_usernames', JSON.stringify([...next]));
  }
  function dismissBalance(username) {
    const next = new Set([...dismissedBalances, username]);
    setDismissedBalances(next);
    localStorage.setItem('admin_dismissed_balances', JSON.stringify([...next]));
  }

  // ── Bans state ─────────────────────────────────────────────────────────────
  const [ipBans, setIpBans]           = useState([]);
  const [userBans, setUserBans]       = useState([]);
  const [banIP, setBanIP]             = useState('');
  const [banIPReason, setBanIPReason] = useState('');
  const [banIPDur, setBanIPDur]       = useState('permanent');
  const [banUser_, setBanUser_]       = useState('');
  const [banUserReason, setBanUserReason] = useState('');
  const [banUserDur, setBanUserDur]   = useState('permanent');
  const [banUserGames, setBanUserGames] = useState('all');
  const [activity, setActivity]       = useState({});

  // ── Bans inner section toggle ──────────────────────────────────────────────
  const [bansOpen, setBansOpen] = useState(null); // 'ip' | 'user' | null

  // ── Site config ────────────────────────────────────────────────────────────
  const { closedGames, testingGames, approvedTesters, refreshConfig } = useSiteConfig();
  const [testerInput, setTesterInput] = useState('');
  const [siteStatus, setSiteStatus]   = useState('');

  // ── Chat mod ───────────────────────────────────────────────────────────────
  const [chatMessages,   setChatMessages]   = useState([]);
  const [chatBans,       setChatBans]       = useState([]);
  const [chatViolations, setChatViolations] = useState([]);
  const [chatMuted,      setChatMuted]      = useState([]);
  const [chatSettings,   setChatSettings]   = useState(null);
  const [chatLogOpen,    setChatLogOpen]    = useState(false);
  const [chatBanUser,    setChatBanUser]    = useState('');
  const [chatBanReason,  setChatBanReason]  = useState('');
  const [chatBanDur,     setChatBanDur]     = useState('permanent');
  const [chatStatus,     setChatStatus]     = useState('');
  const [broadcastText,  setBroadcastText]  = useState('');

  // ── Stats / Overview ───────────────────────────────────────────────────────
  const [platformStats, setPlatformStats] = useState(null);

  // ── User search & sort ─────────────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort]     = useState('balance');

  // ── Leaderboards ───────────────────────────────────────────────────────────
  const [leaderboards, setLeaderboards] = useState({});
  const [lbGame, setLbGame]             = useState(null);

  // ── Audit log ──────────────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState([]);

  // ── Suggestions / Rigged Users / Game Odds ─────────────────────────────────
  const [suggestions, setSuggestions]   = useState([]);
  const [riggedUsers, setRiggedUsers]   = useState([]);
  const [gameOddsData, setGameOddsData] = useState(null);
  const [gameBoostEdits, setGameBoostEdits] = useState({}); // slug → string input value
  const [rigTarget, setRigTarget]       = useState('');
  const [weeklyResetAmt, setWeeklyResetAmt] = useState('5000');
  const [currentChampion, setCurrentChampion] = useState(null); // username string or null

  const ALL_GAMES = [
    'crash','plinko','dice','roulette','blackjack','baccarat',
    'mines','ride-the-bus','slots','chicken-cross','texas-holdem',
    'hilo','tower','wheel','video-poker','keno','dragon-tiger',
  ];

  const isAdmin = !!user;  // requireAdmin on server handles actual auth
  const isOwner = user?.username?.toLowerCase() === 'jasper';

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) navigate('/');
  }, [isLoggedIn, isAdmin, navigate]);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadReports = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/reports', token).then(d => { if (d.ok) setReports(d.reports); }).catch(() => {});
  }, [token]);

  const loadUsers = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/users', token).then(d => { if (d.ok) setUsers(d.users); }).catch(() => {});
  }, [token]);

  const loadIPBans = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/bans/ips', token).then(d => { if (d.ok) setIpBans(d.bans); }).catch(() => {});
  }, [token]);

  const loadUserBans = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/bans/users', token).then(d => { if (d.ok) setUserBans(d.bans); }).catch(() => {});
  }, [token]);

  const loadActivity = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/activity', token).then(d => {
      if (d.ok) {
        const map = {};
        for (const a of d.activity) map[a.username] = a.gameSlug;
        setActivity(map);
      }
    }).catch(() => {});
  }, [token]);

  const loadBigWins = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/wins', token).then(d => { if (d.ok) setBigWins(d.wins); }).catch(() => {});
  }, [token]);

  const loadStats = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/stats', token).then(d => { if (d.ok) setPlatformStats(d.stats); }).catch(() => {});
  }, [token]);

  const loadLeaderboards = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/leaderboards', token).then(d => { if (d.ok) setLeaderboards(d.boards); }).catch(() => {});
  }, [token]);

  const loadAuditLog = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/audit-log', token).then(d => { if (d.ok) setAuditLogs(d.logs); }).catch(() => {});
  }, [token]);

  const loadSuggestions = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/suggestions', token).then(d => { if (d.ok) setSuggestions(d.suggestions); }).catch(() => {});
  }, [token]);

  const loadRiggedUsers = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/rigged', token).then(d => { if (d.ok) setRiggedUsers(d.users); }).catch(() => {});
  }, [token]);

  const loadChampion = useCallback(() => {
    fetch((import.meta.env.VITE_SERVER_URL || '') + '/api/champion')
      .then(r => r.json())
      .then(d => { if (d.ok) setCurrentChampion(d.champion?.username || null); })
      .catch(() => {});
  }, []);

  const loadGameOdds = useCallback(() => {
    authFetch('/api/game-config', token).then(d => {
      if (d.ok) {
        setGameOddsData(d);
        // Sync edit inputs to saved values
        const edits = {};
        for (const slug of [
          'crash','plinko','dice','roulette','blackjack','baccarat',
          'mines','ride-the-bus','slots','chicken-cross','texas-holdem',
          'hilo','tower','wheel','video-poker','keno','dragon-tiger',
        ]) {
          edits[slug] = String(d.overrides?.[slug] ?? 1.0);
        }
        setGameBoostEdits(edits);
      }
    }).catch(() => {});
  }, [token]);

  const loadChat = useCallback(() => {
    if (!token) return;
    Promise.all([
      authFetch('/api/admin/chat/messages',  token),
      authFetch('/api/admin/chat/bans',      token),
      authFetch('/api/admin/chat/violations',token),
      authFetch('/api/admin/chat/muted',     token),
      authFetch('/api/admin/chat/settings',  token),
    ]).then(([msgs, bans, viols, muted, settings]) => {
      if (msgs.ok)     setChatMessages([...msgs.messages].reverse());
      if (bans.ok)     setChatBans(bans.bans);
      if (viols.ok)    setChatViolations(viols.violations);
      if (muted.ok)    setChatMuted(muted.muted);
      if (settings.ok) setChatSettings(settings.settings);
    }).catch(() => {});
  }, [token]);

  // Load data when tab changes
  useEffect(() => {
    if (tab === 'overview')    { loadStats(); loadUsers(); loadAuditLog(); }
    if (tab === 'users')       { loadUsers(); loadActivity(); loadIPBans(); loadUserBans(); loadRiggedUsers(); loadChampion(); }
    if (tab === 'games')       { loadBigWins(); loadLeaderboards(); loadGameOdds(); loadSuggestions(); }
    if (tab === 'moderation')  { loadReports(); loadUsers(); loadChat(); }
    if (tab === 'settings')    { refreshConfig(); }
  }, [tab, loadStats, loadUsers, loadAuditLog, loadActivity, loadIPBans, loadUserBans, loadBigWins, loadLeaderboards, loadReports, loadChat, refreshConfig, loadSuggestions, loadRiggedUsers, loadGameOdds, loadChampion]);

  // Poll activity every 10s on users tab
  useEffect(() => {
    if (tab !== 'users') return;
    const id = setInterval(loadActivity, 10_000);
    return () => clearInterval(id);
  }, [tab, loadActivity]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function dismissReport(id) {
    await authFetch(`/api/admin/reports/${id}/dismiss`, token, { method: 'POST' });
    loadReports();
  }
  async function deleteReport(id) {
    await authFetch(`/api/admin/reports/${id}`, token, { method: 'DELETE' });
    loadReports();
  }
  async function removeEntry(gameId, name) {
    await authFetch(`/api/admin/leaderboard/${gameId}/${encodeURIComponent(name)}`, token, { method: 'DELETE' });
    setStatus(`Removed "${name}" from ${gameId} leaderboard`);
    loadReports();
  }
  async function saveBalance(username) {
    const amt = parseInt(editingBal.value, 10);
    if (isNaN(amt) || amt < 0) return setStatus('Enter a valid balance.');
    const d = await authFetch(`/api/admin/users/${username}/balance`, token, {
      method: 'PUT', body: JSON.stringify({ amount: amt }),
    });
    setStatus(d.ok ? `Set ${username}'s balance to $${d.balance?.toLocaleString()}` : d.error);
    setEditingBal(null);
    loadUsers();
  }
  async function deleteUser(username) {
    if (!window.confirm(`Delete account "${username}"? This cannot be undone.`)) return;
    const d = await authFetch(`/api/admin/users/${username}`, token, { method: 'DELETE' });
    setStatus(d.ok ? `Deleted user ${username}` : d.error);
    loadUsers();
  }
  async function createUser() {
    if (!newUser.trim() || !newPass.trim()) return setStatus('Enter a username and password.');
    const d = await authFetch('/api/admin/users/create', token, {
      method: 'POST', body: JSON.stringify({ username: newUser.trim().toLowerCase(), password: newPass.trim() }),
    });
    if (d.ok) {
      setStatus(`✅ Account "${d.username}" created successfully!`);
      setNewUser(''); setNewPass('');
      loadUsers();
    } else {
      setStatus(d.error || 'Failed to create account.');
    }
  }
  async function kickUser(username) {
    const d = await authFetch(`/api/admin/kick/${encodeURIComponent(username)}`, token, { method: 'POST' });
    setStatus(d.ok ? `Kicked @${username} — ${d.sessionsKilled} session(s) destroyed` : (d.error || 'Kick failed'));
  }
  async function resetBalance(username) {
    const d = await authFetch(`/api/admin/users/${username}/balance`, token, {
      method: 'PUT', body: JSON.stringify({ amount: 2000 }),
    });
    setStatus(d.ok ? `Reset ${username}'s balance to $2,000` : (d.error || 'Reset failed'));
    loadUsers();
  }
  function parseDuration(durStr) {
    if (durStr === 'permanent') return null;
    const map = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
    return map[durStr] || null;
  }
  async function submitIPBan() {
    if (!banIP.trim()) return setStatus('Enter an IP address.');
    const d = await authFetch('/api/admin/bans/ip', token, {
      method: 'POST', body: JSON.stringify({ ip: banIP.trim(), reason: banIPReason, durationMs: parseDuration(banIPDur) }),
    });
    setStatus(d.ok ? `Banned IP ${banIP}` : d.error);
    setBanIP(''); setBanIPReason(''); setBanIPDur('permanent');
    loadIPBans();
  }
  async function removeIPBan(ip) {
    await authFetch(`/api/admin/bans/ip/${encodeURIComponent(ip)}`, token, { method: 'DELETE' });
    setStatus(`Unbanned IP ${ip}`);
    loadIPBans();
  }

  const CASINO_GAMES = [
    'crash','plinko','dice','roulette','blackjack','baccarat',
    'mines','ride-the-bus','slots','chicken-cross','texas-holdem',
    'hilo','tower','wheel','video-poker','keno','dragon-tiger',
  ];

  async function submitUserBan() {
    if (!banUser_.trim()) return setStatus('Enter a username.');
    const games = banUserGames === 'all' ? ['*'] : banUserGames === 'casino' ? CASINO_GAMES : [banUserGames];
    const d = await authFetch('/api/admin/bans/user', token, {
      method: 'POST', body: JSON.stringify({ username: banUser_.trim(), games, reason: banUserReason, durationMs: parseDuration(banUserDur) }),
    });
    setStatus(d.ok ? `Banned ${banUser_} from ${banUserGames === 'all' ? 'all games' : banUserGames}` : d.error);
    setBanUser_(''); setBanUserReason(''); setBanUserDur('permanent'); setBanUserGames('all');
    loadUserBans();
  }
  async function removeUserBan(username) {
    await authFetch(`/api/admin/bans/user/${encodeURIComponent(username)}`, token, { method: 'DELETE' });
    setStatus(`Unbanned ${username}`);
    loadUserBans();
  }
  async function giveMoney() {
    const amt = parseInt(giveAmount, 10);
    if (!giveTarget.trim() || !amt || amt < 1) return setStatus('Enter a valid username and amount.');
    const d = await authFetch('/api/admin/give-money', token, {
      method: 'POST', body: JSON.stringify({ username: giveTarget.trim().toLowerCase(), amount: amt }),
    });
    setStatus(d.ok ? `Gave $${amt.toLocaleString()} to ${giveTarget}. New balance: $${d.balance?.toLocaleString()}` : (d.error || 'Failed'));
    if (d.ok) { setGiveTarget(''); setGiveAmount(''); }
  }

  // ── Derived / memos ────────────────────────────────────────────────────────
  const flaggedUsernames = useMemo(() => users.filter(u => isSuspectUsername(u.username) && u.username !== 'jasper'), [users]);
  const flaggedBalances  = useMemo(() => users.filter(u => (u.balance || 0) >= BAL_HIGH && u.username !== 'jasper'), [users]);
  const visibleFlaggedUsernames = useMemo(() => flaggedUsernames.filter(u => !dismissedUsernames.has(u.username)), [flaggedUsernames, dismissedUsernames]);
  const visibleFlaggedBalances  = useMemo(() => flaggedBalances.filter(u => !dismissedBalances.has(u.username)),   [flaggedBalances, dismissedBalances]);

  const sortedUsers = useMemo(() => {
    const base = [...users].filter(u => u.username !== 'jasper');
    if (userSort === 'balance')  return base.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    if (userSort === 'newest')   return base.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (userSort === 'oldest')   return base.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (userSort === 'lastSeen') return base.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    return base;
  }, [users, userSort]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter(u =>
      u.username.includes(q) || (u.displayName || '').toLowerCase().includes(q) || (u.lastIP || '').includes(q)
    );
  }, [sortedUsers, userSearch]);

  const unreviewedReports = useMemo(() => reports.filter(r => !r.reviewed).length, [reports]);
  const onlineCount       = useMemo(() => Object.keys(activity).length, [activity]);

  // ── Refresh helper ─────────────────────────────────────────────────────────
  function reloadTab() {
    setStatus('↻ Refreshed');
    if (tab === 'overview')   { loadStats(); loadUsers(); loadAuditLog(); }
    if (tab === 'users')      { loadUsers(); loadActivity(); loadIPBans(); loadUserBans(); loadRiggedUsers(); loadChampion(); }
    if (tab === 'games')      { loadBigWins(); loadLeaderboards(); loadGameOdds(); loadSuggestions(); }
    if (tab === 'moderation') { loadReports(); loadUsers(); loadChat(); }
    if (tab === 'settings')   { refreshConfig(); setSiteStatus('↻ Refreshed'); }
  }

  if (!isAdmin) return null;

  // ── Tabs config ─────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview',    label: '📊 Overview' },
    { id: 'users',       label: `👥 Users${onlineCount > 0 ? ` · ${onlineCount} 🟢` : ''}` },
    { id: 'games',       label: '🎮 Games' },
    { id: 'moderation',  label: `🚨 Moderation${unreviewedReports > 0 ? ` · ${unreviewedReports}` : ''}` },
    { id: 'settings',    label: '⚙️ Settings' },
  ];

  return (
    <div className="admin-page">

      {/* ── Header ── */}
      <div className="admin-header">
        <Link to="/" className="admin-back">← Game Vault</Link>
        <div className="admin-title">🛡️ Admin Panel</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={reloadTab}>↻ Reload</button>
          <div className="admin-user">Logged in as <strong>jasper</strong></div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="admin-tabs">
        {TABS.map(({ id, label }) => (
          <button key={id} className={`admin-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {status && <div className="admin-status" onClick={() => setStatus('')}>{status} ✕</div>}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── OVERVIEW ── stats + recent signups + audit log ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="admin-section">

          {/* Quick Actions */}
          <div className="admin-section-title">⚡ Quick Actions</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
            <CoinRainAdminCard token={token} authFetch={authFetch} />
          </div>

          {/* Admin Management — owner only */}
          {isOwner && (
            <>
              <div className="admin-section-title">🛡️ Admin Management <span style={{ fontSize:'0.72rem', color:'#64748b', fontWeight:400 }}>(only you can see this)</span></div>
              <SecondaryAdminsCard token={token} authFetch={authFetch} />
              <div style={{ marginBottom: 24 }} />
            </>
          )}

          {/* Stats grid */}
          <div className="admin-section-title">📊 Platform Statistics</div>
          {!platformStats ? (
            <div className="admin-empty">Loading stats…</div>
          ) : (
            <>
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Total Users</div>
                  <div className="admin-stat-value">{platformStats.totalUsers.toLocaleString()}</div>
                </div>
                <div className="admin-stat-card admin-stat-card--green">
                  <div className="admin-stat-label">New Today</div>
                  <div className="admin-stat-value">{platformStats.newToday}</div>
                </div>
                <div className="admin-stat-card admin-stat-card--blue">
                  <div className="admin-stat-label">New This Week</div>
                  <div className="admin-stat-value">{platformStats.newThisWeek}</div>
                </div>
                <div className="admin-stat-card admin-stat-card--purple">
                  <div className="admin-stat-label">Online Now</div>
                  <div className="admin-stat-sub">(active ≤15 min)</div>
                  <div className="admin-stat-value">{platformStats.onlineNow}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Chips in Circulation</div>
                  <div className="admin-stat-value">${platformStats.totalBalance.toLocaleString()}</div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Average Balance</div>
                  <div className="admin-stat-value">${platformStats.avgBalance.toLocaleString()}</div>
                </div>
                <div className="admin-stat-card admin-stat-card--yellow">
                  <div className="admin-stat-label">Near-Broke (≤$100)</div>
                  <div className="admin-stat-value">{platformStats.broke}</div>
                </div>
                {platformStats.richest && (
                  <div className="admin-stat-card admin-stat-card--gold">
                    <div className="admin-stat-label">Richest Player</div>
                    <div className="admin-stat-value admin-stat-value--sm">@{platformStats.richest.username}</div>
                    <div className="admin-stat-sub">${platformStats.richest.balance.toLocaleString()}</div>
                  </div>
                )}
              </div>

              {/* Two-column: top balances + recent signups */}
              <div className="admin-overview-cols">
                <div>
                  <div className="admin-section-title" style={{ marginTop:28 }}>💰 Top 10 Balances</div>
                  <div className="admin-user-list">
                    {sortedUsers.slice(0, 10).map((u, i) => (
                      <div key={u.username} className="admin-user-row">
                        <div className="admin-user-info">
                          <span className="admin-stat-rank">#{i + 1}</span>
                          <span className="admin-user-name">{u.displayName}</span>
                          <span className="admin-user-handle">@{u.username}</span>
                          <span className="admin-user-bal">${(u.balance || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="admin-section-title" style={{ marginTop:28 }}>🆕 Recent Signups</div>
                  <div className="admin-user-list">
                    {[...users]
                      .filter(u => u.username !== 'jasper' && u.createdAt)
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .slice(0, 10)
                      .map(u => (
                        <div key={u.username} className="admin-user-row">
                          <div className="admin-user-info">
                            <span className="admin-user-name">{u.displayName}</span>
                            <span className="admin-user-handle">@{u.username}</span>
                            <span className="admin-user-ip" style={{ fontSize:'0.75rem', color:'#6b7280' }}>
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Audit log */}
          <div className="admin-section-title-row" style={{ marginTop:36 }}>
            <div className="admin-section-title">📜 Audit Log ({auditLogs.length})</div>
            {auditLogs.length > 0 && (
              <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                if (!window.confirm('Clear the audit log?')) return;
                await authFetch('/api/admin/audit-log', token, { method: 'DELETE' });
                setAuditLogs([]);
                setStatus('Audit log cleared.');
              }}>🗑 Clear</button>
            )}
          </div>
          <div className="admin-site-card-sub" style={{ marginBottom:10 }}>
            Tracks admin actions automatically. Most recent first.
          </div>
          {auditLogs.length === 0 && (
            <div className="admin-empty">No actions logged yet. Banning, giving money, kicking, etc. will appear here.</div>
          )}
          <div className="admin-audit-list">
            {auditLogs.map(entry => (
              <div key={entry.id} className="admin-audit-row">
                <span className="admin-audit-action">{AUDIT_LABELS[entry.action] || entry.action}</span>
                <span className="admin-audit-details">{formatAuditDetails(entry.action, entry.details)}</span>
                <span className="admin-audit-time">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── USERS ── list + give money + bans ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'users' && (
        <div className="admin-section">

          {/* ── Create Account ────────────────────────────────────────────── */}
          <div className="admin-site-card admin-give-card">
            <div className="admin-site-card-title">➕ Create Account</div>
            <div className="admin-give-form">
              <input className="admin-input" placeholder="Username" value={newUser}
                onChange={e => setNewUser(e.target.value)} autoCapitalize="none" autoCorrect="off" />
              <input className="admin-input" type="password" placeholder="Password" value={newPass}
                onChange={e => setNewPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createUser()} />
              <button className="admin-btn admin-btn--primary" onClick={createUser}>➕ Create</button>
            </div>
          </div>

          {/* ── Give Money ────────────────────────────────────────────────── */}
          <div className="admin-site-card admin-give-card">
            <div className="admin-site-card-title">💰 Give Casino Chips</div>
            <div className="admin-give-form">
              <input className="admin-input" placeholder="Username" value={giveTarget}
                onChange={e => setGiveTarget(e.target.value)} />
              <input className="admin-input" type="number" placeholder="Amount ($)" value={giveAmount}
                onChange={e => setGiveAmount(e.target.value)} min={1} />
              <button className="admin-btn admin-btn--primary" onClick={giveMoney}>💰 Give</button>
            </div>
          </div>

          {/* ── User List ─────────────────────────────────────────────────── */}
          <div className="admin-section-title-row">
            <div className="admin-section-title">All Accounts ({filteredUsers.length}{userSearch ? ` of ${sortedUsers.length}` : ''})</div>
          </div>
          <div className="admin-user-search-row">
            <input className="admin-input admin-user-search"
              placeholder="🔍 Search by username, display name, or IP…"
              value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            {userSearch && (
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setUserSearch('')}>✕ Clear</button>
            )}
            <div className="admin-sort-pills">
              {[['balance','💰 Richest'],['newest','🆕 Newest'],['oldest','🕰 Oldest'],['lastSeen','🟢 Active']].map(([k, label]) => (
                <button key={k} className={`admin-sort-pill${userSort === k ? ' active' : ''}`} onClick={() => setUserSort(k)}>{label}</button>
              ))}
            </div>
          </div>
          {filteredUsers.length === 0 && <div className="admin-empty">{userSearch ? 'No users match.' : 'No users found.'}</div>}
          <div className="admin-user-list">
            {filteredUsers.map(u => (
              <div key={u.username} className="admin-user-row admin-user-row--expanded">
                <div className="admin-user-info">
                  <span className="admin-user-name">{u.displayName}</span>
                  <span className="admin-user-handle">@{u.username}</span>
                  {(u.balance || 0) >= BAL_VERY_HIGH && <span className="admin-user-flag admin-user-flag--red" title="Very high balance">🔴</span>}
                  {(u.balance || 0) >= BAL_HIGH && (u.balance || 0) < BAL_VERY_HIGH && <span className="admin-user-flag admin-user-flag--yellow" title="High balance">🟡</span>}
                  {isSuspectUsername(u.username) && <span className="admin-user-flag" title="Suspicious username">🚩</span>}
                  {riggedUsers.includes(u.username) && <span className="admin-user-flag" title="Rigged — always loses" style={{color:'#f87171'}}>🎲 RIGGED</span>}
                  {currentChampion === u.username && <span className="admin-user-flag" title="Weekly Champion" style={{color:'#FFD700'}}>👑 CHAMPION</span>}
                  {editingBal?.username === u.username ? (
                    <span className="admin-user-bal-edit">
                      <span className="admin-bal-dollar">$</span>
                      <input className="admin-bal-input" type="number" min={0} value={editingBal.value}
                        onChange={e => setEditingBal({ username: u.username, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveBalance(u.username); if (e.key === 'Escape') setEditingBal(null); }}
                        autoFocus />
                      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveBalance(u.username)}>✓</button>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingBal(null)}>✕</button>
                    </span>
                  ) : (
                    <span className="admin-user-bal admin-user-bal--clickable" title="Click to edit balance"
                      onClick={() => setEditingBal({ username: u.username, value: String(u.balance || 0) })}>
                      ${(u.balance || 0).toLocaleString()} ✏️
                    </span>
                  )}
                  {u.lastIP && (
                    <span className="admin-user-ip" title={`Last seen ${u.lastSeen ? new Date(u.lastSeen).toLocaleString() : 'unknown'}`}>
                      🌐 {u.lastIP}
                    </span>
                  )}
                  {!u.lastIP && <span className="admin-user-ip admin-user-ip--unknown">🌐 No IP</span>}
                  {activity[u.username]
                    ? <span className="admin-user-online" title="Currently online">🟢 {activity[u.username]}</span>
                    : <span className="admin-user-offline">⚫ offline</span>}
                </div>
                {u.username !== 'jasper' && (
                  <div className="admin-user-actions">
                    {activity[u.username] && (
                      <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                        setBanUser_(u.username); setBanUserGames(activity[u.username]); setBanUserDur('permanent');
                        setBanUserReason(''); setBansOpen('user');
                        setStatus(`Pre-filled ban from ${activity[u.username]} for @${u.username}`);
                      }}>🎯 Ban from {activity[u.username]}</button>
                    )}
                    <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('permanent');
                      setBanUserReason(''); setBansOpen('user');
                      setStatus(`Pre-filled ban form for @${u.username}`);
                    }}>🚫 Perma Ban</button>
                    <button className="admin-btn admin-btn--casino admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('casino'); setBanUserDur('permanent');
                      setBanUserReason(''); setBansOpen('user');
                      setStatus(`Pre-filled casino ban for @${u.username}`);
                    }}>🎰 Casino Ban</button>
                    <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('24h');
                      setBanUserReason(''); setBansOpen('user');
                      setStatus(`Pre-filled 24h ban for @${u.username}`);
                    }}>⏱ Temp Ban</button>
                    {u.lastIP && (
                      <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                        setBanIP(u.lastIP); setBanIPDur('permanent'); setBanIPReason('');
                        setBansOpen('ip');
                        setStatus(`Pre-filled IP ban for ${u.lastIP} (@${u.username})`);
                      }}>🌐 Ban IP</button>
                    )}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => resetBalance(u.username)} title="Reset to $2,000">
                      ↩ Reset $2k
                    </button>
                    <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => kickUser(u.username)}>👢 Kick</button>
                    {riggedUsers.includes(u.username) ? (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{borderColor:'#f87171',color:'#f87171'}} onClick={async () => {
                        await authFetch(`/api/admin/rigged/${encodeURIComponent(u.username)}`, token, { method: 'DELETE' });
                        setStatus(`✓ @${u.username} unrigged.`);
                        loadRiggedUsers();
                      }}>🎲 Unrig</button>
                    ) : (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{borderColor:'#a855f7',color:'#a855f7'}} onClick={async () => {
                        const d = await authFetch('/api/admin/rigged', token, {
                          method: 'POST', body: JSON.stringify({ username: u.username }),
                        });
                        setStatus(d.ok ? `🎲 @${u.username} is now rigged — they'll always lose.` : (d.error || 'Failed'));
                        if (d.ok) loadRiggedUsers();
                      }}>🎲 Rig</button>
                    )}
                    {currentChampion === u.username ? (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{borderColor:'#ef4444',color:'#ef4444'}} onClick={async () => {
                        const d = await authFetch('/api/admin/champion', token, { method: 'DELETE' });
                        setStatus(d.ok ? `👑 Champion removed.` : (d.error || 'Failed'));
                        if (d.ok) loadChampion();
                      }}>✖ Remove Champion</button>
                    ) : (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" style={{borderColor:'#b45309',color:'#d97706'}} onClick={async () => {
                        const d = await authFetch('/api/admin/champion', token, {
                          method: 'POST', body: JSON.stringify({ username: u.username }),
                        });
                        setStatus(d.ok ? `👑 @${u.username} is now the weekly champion.` : (d.error || 'Failed'));
                        if (d.ok) loadChampion();
                      }}>👑 Crown</button>
                    )}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => deleteUser(u.username)}>🗑 Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── IP Bans ───────────────────────────────────────────────────── */}
          <div className="admin-collapsible" style={{ marginTop:28 }}>
            <button className="admin-collapsible-header" onClick={() => setBansOpen(bansOpen === 'ip' ? null : 'ip')}>
              <span>🌐 IP Bans <span className="admin-collapsible-count">({ipBans.length})</span></span>
              <span>{bansOpen === 'ip' ? '▲' : '▼'}</span>
            </button>
            {bansOpen === 'ip' && (
              <div className="admin-collapsible-body">
                <div className="admin-ban-form">
                  <input className="admin-input" placeholder="IP address (e.g. 1.2.3.4)" value={banIP} onChange={e => setBanIP(e.target.value)} />
                  <input className="admin-input" placeholder="Reason (optional)" value={banIPReason} onChange={e => setBanIPReason(e.target.value)} />
                  <select className="admin-input admin-select" value={banIPDur} onChange={e => setBanIPDur(e.target.value)}>
                    <option value="1h">1 hour</option><option value="6h">6 hours</option>
                    <option value="24h">24 hours</option><option value="7d">7 days</option>
                    <option value="30d">30 days</option><option value="permanent">Permanent</option>
                  </select>
                  <button className="admin-btn admin-btn--danger" onClick={submitIPBan}>🚫 Ban IP</button>
                </div>
                {ipBans.length === 0 && <div className="admin-empty">No IP bans active.</div>}
                {ipBans.map(b => (
                  <div key={b.ip} className="admin-ban-row">
                    <div className="admin-ban-info">
                      <span className="admin-ban-target">{b.ip}</span>
                      {b.reason && <span className="admin-ban-reason">"{b.reason}"</span>}
                      <span className="admin-ban-expiry">{b.expiresAt ? `Expires ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'}</span>
                    </div>
                    <button className="admin-btn admin-btn--ghost" onClick={() => removeIPBan(b.ip)}>Unban</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── User Game Bans ────────────────────────────────────────────── */}
          <div className="admin-collapsible" style={{ marginTop:12 }}>
            <button className="admin-collapsible-header" onClick={() => setBansOpen(bansOpen === 'user' ? null : 'user')}>
              <span>👤 User Game Bans <span className="admin-collapsible-count">({userBans.length})</span></span>
              <span>{bansOpen === 'user' ? '▲' : '▼'}</span>
            </button>
            {bansOpen === 'user' && (
              <div className="admin-collapsible-body">
                <div className="admin-ban-form">
                  <input className="admin-input" placeholder="Username" value={banUser_} onChange={e => setBanUser_(e.target.value)} />
                  <input className="admin-input" placeholder="Reason (optional)" value={banUserReason} onChange={e => setBanUserReason(e.target.value)} />
                  <select className="admin-input admin-select" value={banUserGames} onChange={e => setBanUserGames(e.target.value)}>
                    <option value="all">Everything (all games)</option>
                    <option value="casino">Casino games only</option>
                    {ALL_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className="admin-input admin-select" value={banUserDur} onChange={e => setBanUserDur(e.target.value)}>
                    <option value="1h">1 hour</option><option value="6h">6 hours</option>
                    <option value="24h">24 hours</option><option value="7d">7 days</option>
                    <option value="30d">30 days</option><option value="permanent">Permanent</option>
                  </select>
                  <button className="admin-btn admin-btn--danger" onClick={submitUserBan}>🚫 Ban User</button>
                </div>
                {userBans.length === 0 && <div className="admin-empty">No user game bans active.</div>}
                {userBans.map(b => (
                  <div key={b.username} className="admin-ban-row">
                    <div className="admin-ban-info">
                      <span className="admin-ban-target">@{b.username}</span>
                      <span className="admin-ban-games">{b.games.includes('*') ? 'All games' : b.games.join(', ')}</span>
                      {b.reason && <span className="admin-ban-reason">"{b.reason}"</span>}
                      <span className="admin-ban-expiry">{b.expiresAt ? `Expires ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'}</span>
                    </div>
                    <button className="admin-btn admin-btn--ghost" onClick={() => removeUserBan(b.username)}>Unban</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Rigged Users ──────────────────────────────────────────────── */}
          <div className="admin-collapsible" style={{ marginTop:12 }}>
            <button className="admin-collapsible-header" onClick={() => setBansOpen(bansOpen === 'rigged' ? null : 'rigged')}>
              <span>🎲 Rigged Users <span className="admin-collapsible-count">({riggedUsers.length})</span></span>
              <span>{bansOpen === 'rigged' ? '▲' : '▼'}</span>
            </button>
            {bansOpen === 'rigged' && (
              <div className="admin-collapsible-body">
                <div className="admin-site-card-sub" style={{ marginBottom:10 }}>
                  Users on this list will always lose casino games. They won't know they're rigged.
                </div>
                <div className="admin-ban-form">
                  <input className="admin-input" placeholder="Username to rig" value={rigTarget}
                    onChange={e => setRigTarget(e.target.value)} />
                  <button className="admin-btn admin-btn--danger" onClick={async () => {
                    if (!rigTarget.trim()) return setStatus('Enter a username.');
                    const d = await authFetch('/api/admin/rigged', token, {
                      method: 'POST', body: JSON.stringify({ username: rigTarget.trim().toLowerCase() }),
                    });
                    setStatus(d.ok ? `🎲 @${rigTarget.trim()} is now rigged.` : (d.error || 'Failed'));
                    if (d.ok) { setRigTarget(''); loadRiggedUsers(); }
                  }}>🎲 Rig User</button>
                </div>
                {riggedUsers.length === 0 && <div className="admin-empty">No rigged users.</div>}
                {riggedUsers.map(u => (
                  <div key={u} className="admin-ban-row">
                    <div className="admin-ban-info">
                      <span className="admin-ban-target">@{u}</span>
                      <span className="admin-ban-reason" style={{ color:'#f87171' }}>Always loses</span>
                    </div>
                    <button className="admin-btn admin-btn--ghost" onClick={async () => {
                      await authFetch(`/api/admin/rigged/${encodeURIComponent(u)}`, token, { method: 'DELETE' });
                      setStatus(`✓ @${u} unrigged.`);
                      loadRiggedUsers();
                    }}>Unrig</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── GAMES ── big wins + leaderboards ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'games' && (
        <div className="admin-section">

          {/* ── Big Wins ──────────────────────────────────────────────────── */}
          <div className="admin-wins-header">
            <div className="admin-section-title">🏆 Big Wins ({bigWins.length})</div>
            <div className="admin-wins-header-actions">
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={loadBigWins}>↻ Refresh</button>
              {bigWins.length > 0 && (
                <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Clear all big win logs?')) return;
                  await authFetch('/api/admin/wins', token, { method: 'DELETE' });
                  setBigWins([]); setStatus('Win log cleared.');
                }}>🗑 Clear</button>
              )}
            </div>
          </div>
          {bigWins.length > 0 && (
            <div className="admin-wins-summary">
              Total profit logged: <strong>${bigWins.reduce((s, w) => s + (w.profit || 0), 0).toLocaleString()}</strong>
              &nbsp;·&nbsp;Biggest: <strong>${Math.max(...bigWins.map(w => w.profit || 0)).toLocaleString()}</strong>
            </div>
          )}
          <div className="admin-wins-subtext">Logs wins where profit exceeds $50,000 in a single round.</div>
          {bigWins.length === 0 && <div className="admin-empty">No big wins recorded yet.</div>}
          {bigWins.map((w, i) => (
            <div key={w.id || i} className="admin-win-row">
              <div className="admin-win-top">
                <span className="admin-win-game">{w.game}</span>
                <span className="admin-win-user">@{w.username}</span>
                <span className="admin-win-profit">+${(w.profit || 0).toLocaleString()}</span>
                {w.multiplier != null && <span className="admin-win-mult">{w.multiplier}×</span>}
                <span className="admin-win-time">{new Date(w.timestamp).toLocaleString()}</span>
                <button className="admin-btn admin-btn--ghost admin-btn--sm admin-win-delete" title="Remove entry"
                  onClick={async () => {
                    if (w.id) await authFetch(`/api/admin/wins/${encodeURIComponent(w.id)}`, token, { method: 'DELETE' });
                    setBigWins(prev => prev.filter((_, idx) => idx !== i));
                  }}>✕</button>
              </div>
              <div className="admin-win-meta">
                <span className="admin-win-bet">Bet: ${(w.bet || 0).toLocaleString()}</span>
                <span className="admin-win-payout">Payout: ${(w.payout || 0).toLocaleString()}</span>
                {w.details && <span className="admin-win-details">{w.details}</span>}
              </div>
            </div>
          ))}

          {/* ── Leaderboards ──────────────────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:36 }}>
            🎖 Game Leaderboards
            {Object.keys(leaderboards).length > 0 && (
              <span style={{ fontWeight:400, fontSize:'0.78rem', color:'#6b7280', marginLeft:8 }}>
                {Object.values(leaderboards).reduce((s, e) => s + e.length, 0)} total entries
              </span>
            )}
          </div>
          {Object.keys(leaderboards).length === 0 && <div className="admin-empty">No leaderboard entries yet.</div>}
          {Object.entries(leaderboards).map(([gameId, entries]) => (
            <div key={gameId} className="admin-lb-board">
              <div className="admin-lb-header" onClick={() => setLbGame(lbGame === gameId ? null : gameId)}>
                <span className="admin-lb-game">{gameId}</span>
                <span className="admin-lb-count">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</span>
                <span className="admin-lb-chevron">{lbGame === gameId ? '▲' : '▼'}</span>
                <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async e => {
                  e.stopPropagation();
                  if (!window.confirm(`Clear all scores for "${gameId}"?`)) return;
                  await authFetch(`/api/admin/leaderboards/${gameId}`, token, { method: 'DELETE' });
                  setStatus(`Cleared leaderboard for ${gameId}`);
                  loadLeaderboards();
                }}>🗑 Clear</button>
              </div>
              {lbGame === gameId && (
                <div className="admin-lb-entries">
                  {entries.map((e, i) => (
                    <div key={i} className="admin-lb-entry">
                      <span className="admin-lb-rank">#{i + 1}</span>
                      <span className="admin-lb-name">{e.name}</span>
                      <span className="admin-lb-score">{e.score?.toLocaleString()}</span>
                      <span className="admin-lb-date">{e.date ? new Date(e.date).toLocaleDateString() : ''}</span>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                        await authFetch(`/api/admin/leaderboard/${gameId}/${encodeURIComponent(e.name)}`, token, { method: 'DELETE' });
                        setStatus(`Removed "${e.name}" from ${gameId}`);
                        loadLeaderboards();
                      }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* ── Game Odds / Wildcard Editor ────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:36 }}>🎰 Game Odds & Wildcard</div>
          <div className="admin-site-card">
            <div className="admin-site-card-title">⭐ Wildcard Game of the Day</div>
            <div className="admin-site-card-sub">
              Today's wildcard: <strong style={{ color:'#c084fc' }}>
                {gameOddsData?.wildcardOverride || gameOddsData?.wildcard || '…'}
              </strong>
              {gameOddsData?.wildcardOverride && <span style={{ color:'#fbbf24', marginLeft:8 }}>(overridden)</span>}
              &nbsp;· Boost: <strong style={{ color:'#86efac' }}>{gameOddsData?.wildcardBoost ?? 1.5}×</strong>
            </div>
            <div className="admin-ban-form" style={{ marginTop:12 }}>
              <select className="admin-input admin-select" defaultValue=""
                onChange={async e => {
                  const d = await authFetch('/api/admin/game-odds/wildcard/override', token, {
                    method: 'POST', body: JSON.stringify({ slug: e.target.value || null }),
                  });
                  if (d.ok) { loadGameOdds(); setStatus(`Wildcard set to: ${e.target.value || 'auto'}`); }
                }}>
                <option value="">— Auto (date-based) —</option>
                {ALL_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input className="admin-input" type="number" placeholder="Boost ×" min={1} max={5} step={0.1}
                defaultValue={gameOddsData?.wildcardBoost ?? 1.5}
                style={{ width:90 }}
                onBlur={async e => {
                  const val = parseFloat(e.target.value);
                  if (isNaN(val)) return;
                  const d = await authFetch('/api/admin/game-odds/wildcard/override', token, {
                    method: 'POST', body: JSON.stringify({ boost: val }),
                  });
                  if (d.ok) { loadGameOdds(); setStatus(`Wildcard boost → ${val}×`); }
                }} />
            </div>
          </div>
          <div className="admin-site-card">
            <div className="admin-site-card-title">🎮 Per-Game Boost Multipliers</div>
            <div className="admin-site-card-sub">
              1.0× = normal odds &nbsp;·&nbsp; 1.5× = 50% better payouts &nbsp;·&nbsp; 0.5× = nerfed.
              Changes take effect immediately.
            </div>
            {!gameOddsData ? (
              <div className="admin-empty">Loading…</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:12 }}>
                {ALL_GAMES.map(slug => {
                  const savedBoost = gameOddsData.overrides?.[slug] ?? 1.0;
                  const editVal    = gameBoostEdits[slug] ?? String(savedBoost);
                  const isWild     = slug === (gameOddsData.wildcardOverride || gameOddsData.wildcard);
                  const isModified = savedBoost !== 1.0;
                  const isDirty    = parseFloat(editVal) !== savedBoost;
                  return (
                    <div key={slug} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 12px', borderRadius:8,
                      background: isWild ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isWild ? 'rgba(192,132,252,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                      {/* Game name */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontWeight:600, fontSize:'0.92rem', color: isWild ? '#c084fc' : '#e2e8f0' }}>
                          {isWild && '⭐ '}{GAME_DISPLAY_NAMES[slug] || slug}
                        </span>
                        {isWild && <span style={{ fontSize:'0.72rem', color:'#a78bfa', marginLeft:8 }}>Wildcard</span>}
                      </div>
                      {/* Current saved boost badge */}
                      <span style={{
                        fontSize:'0.78rem', fontWeight:700, minWidth:38, textAlign:'center',
                        color: isModified ? '#86efac' : '#6b7280',
                        background: isModified ? 'rgba(134,239,172,0.12)' : 'transparent',
                        borderRadius:4, padding:'2px 6px',
                      }}>
                        {savedBoost}×
                      </span>
                      {/* Input */}
                      <input
                        type="number" min={0.1} max={10} step={0.1}
                        value={editVal}
                        onChange={e => setGameBoostEdits(prev => ({ ...prev, [slug]: e.target.value }))}
                        style={{
                          width:80, padding:'5px 8px', fontSize:'0.88rem', textAlign:'center',
                          background:'#1e1e2e', border:`1px solid ${isDirty ? '#c084fc' : '#374151'}`,
                          borderRadius:6, color:'#e2e8f0', outline:'none',
                        }}
                      />
                      {/* Set button */}
                      <button
                        className="admin-btn admin-btn--primary admin-btn--sm"
                        disabled={!isDirty || isNaN(parseFloat(editVal))}
                        onClick={async () => {
                          const val = parseFloat(editVal);
                          if (isNaN(val)) return;
                          const d = await authFetch(`/api/admin/game-odds/${slug}`, token, {
                            method: 'POST', body: JSON.stringify({ multiplier: val }),
                          });
                          if (d.ok) { loadGameOdds(); setStatus(`${GAME_DISPLAY_NAMES[slug] || slug} → ${val}×`); }
                        }}
                        style={{ minWidth:48 }}
                      >Set</button>
                      {/* Reset button — only when not default */}
                      {isModified && (
                        <button
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          title="Reset to 1×"
                          onClick={async () => {
                            await authFetch(`/api/admin/game-odds/${slug}`, token, { method: 'DELETE' });
                            loadGameOdds(); setStatus(`${GAME_DISPLAY_NAMES[slug] || slug} reset to 1×`);
                          }}
                          style={{ minWidth:46 }}
                        >↩ 1×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Suggestions Review ────────────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:36 }}>
            💡 User Suggestions ({suggestions.filter(s => s.status === 'pending').length} pending)
          </div>
          {suggestions.length === 0 && <div className="admin-empty">No suggestions yet.</div>}
          {suggestions.map(s => (
            <div key={s.id} className={`admin-report${s.status === 'accepted' ? '' : s.status === 'denied' ? ' reviewed' : ''}`}>
              <div className="admin-report-meta">
                <span className="admin-report-name">@{s.username}</span>
                <span className="admin-report-date">{new Date(s.createdAt).toLocaleString()}</span>
                {s.status !== 'pending' && (
                  <span className={`admin-report-reviewed`} style={{ color: s.status === 'accepted' ? '#86efac' : '#f87171' }}>
                    {s.status === 'accepted' ? '✓ Accepted' : '✕ Denied'}
                  </span>
                )}
              </div>
              <div className="admin-report-reason" style={{ color:'#e2e8f0', fontSize:'0.9rem' }}>"{s.text}"</div>
              <div className="admin-report-actions">
                {s.status === 'pending' && (
                  <>
                    <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={async () => {
                      await authFetch(`/api/admin/suggestions/${s.id}/review`, token, { method:'POST', body: JSON.stringify({ status:'accepted' }) });
                      setStatus(`✓ Accepted suggestion from @${s.username}`);
                      loadSuggestions();
                    }}>✓ Accept</button>
                    <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                      await authFetch(`/api/admin/suggestions/${s.id}/review`, token, { method:'POST', body: JSON.stringify({ status:'denied' }) });
                      setStatus(`Denied suggestion from @${s.username}`);
                      loadSuggestions();
                    }}>✕ Deny</button>
                  </>
                )}
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                  await authFetch(`/api/admin/suggestions/${s.id}`, token, { method:'DELETE' });
                  loadSuggestions();
                }}>🗑 Delete</button>
              </div>
            </div>
          ))}

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── MODERATION ── reports + chat ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'moderation' && (
        <div className="admin-section">

          {/* ── User Reports ──────────────────────────────────────────────── */}
          <div className="admin-section-title">📋 User Reports ({reports.filter(r => !r.reviewed).length} unreviewed)</div>
          {reports.length === 0 && <div className="admin-empty">No reports yet.</div>}
          {reports.map(r => (
            <div key={r.id} className={`admin-report${r.reviewed ? ' reviewed' : ''}`}>
              <div className="admin-report-meta">
                <span className="admin-report-game">{r.gameId}</span>
                <span className="admin-report-name">"{r.entryName}"</span>
                {r.entryScore != null && <span className="admin-report-score">Score: {r.entryScore}</span>}
                <span className="admin-report-date">{new Date(r.createdAt).toLocaleString()}</span>
                {r.reviewed && <span className="admin-report-reviewed">✓ Reviewed</span>}
              </div>
              {r.reason && <div className="admin-report-reason">"{r.reason}"</div>}
              <div className="admin-report-actions">
                <button className="admin-btn admin-btn--danger" onClick={() => removeEntry(r.gameId, r.entryName)}>🗑 Remove Entry</button>
                {!r.reviewed && <button className="admin-btn" onClick={() => dismissReport(r.id)}>✓ Mark Reviewed</button>}
                <button className="admin-btn admin-btn--ghost" onClick={() => deleteReport(r.id)}>Delete Report</button>
              </div>
            </div>
          ))}

          {/* ── Flagged Usernames ─────────────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:28 }}>
            🚩 Flagged Usernames ({visibleFlaggedUsernames.length})
            {dismissedUsernames.size > 0 && (
              <span style={{ fontSize:'0.75rem', fontWeight:400, color:'#6b7280', marginLeft:8 }}>
                ({dismissedUsernames.size} dismissed)
              </span>
            )}
          </div>
          {visibleFlaggedUsernames.length === 0
            ? <div className="admin-empty">No suspicious usernames detected.</div>
            : visibleFlaggedUsernames.map(u => (
              <div key={u.username} className="admin-report admin-report--flagged">
                <div className="admin-report-meta">
                  <span className="admin-report-name" style={{ color:'#f87171' }}>@{u.username}</span>
                  <span className="admin-report-date">Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'unknown'}</span>
                  {u.lastIP && <span className="admin-report-game">IP: {u.lastIP}</span>}
                </div>
                <div className="admin-report-actions">
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                    setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('permanent');
                    setBanUserReason('Inappropriate username'); setBansOpen('user'); setTab('users');
                    setStatus(`Pre-filled ban for @${u.username}`);
                  }}>🚫 Ban</button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => deleteUser(u.username)}>🗑 Delete</button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => dismissUsername(u.username)}>✓ Dismiss</button>
                </div>
              </div>
            ))
          }

          {/* ── Flagged Balances ──────────────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:28 }}>
            💰 Flagged Balances ({visibleFlaggedBalances.length})
            <span style={{ fontSize:'0.78rem', fontWeight:400, color:'#6b7280', marginLeft:8 }}>≥ $100,000</span>
            {dismissedBalances.size > 0 && (
              <span style={{ fontSize:'0.75rem', fontWeight:400, color:'#6b7280', marginLeft:8 }}>
                ({dismissedBalances.size} dismissed)
              </span>
            )}
          </div>
          {visibleFlaggedBalances.length === 0
            ? <div className="admin-empty">No unusually high balances.</div>
            : visibleFlaggedBalances.sort((a, b) => b.balance - a.balance).map(u => (
              <div key={u.username} className="admin-report admin-report--flagged">
                <div className="admin-report-meta">
                  <span className="admin-report-name">@{u.username}</span>
                  <span className="admin-report-score" style={{ color:(u.balance || 0) >= BAL_VERY_HIGH ? '#f87171' : '#fbbf24' }}>
                    {(u.balance || 0) >= BAL_VERY_HIGH ? '🔴' : '🟡'} ${(u.balance || 0).toLocaleString()}
                  </span>
                  {u.lastIP && <span className="admin-report-game">IP: {u.lastIP}</span>}
                </div>
                <div className="admin-report-actions">
                  <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => resetBalance(u.username)}>↩ Reset $2k</button>
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                    setBanUser_(u.username); setBanUserGames('casino'); setBanUserDur('permanent');
                    setBanUserReason('Suspected cheating'); setBansOpen('user'); setTab('users');
                    setStatus(`Pre-filled casino ban for @${u.username}`);
                  }}>🎰 Casino Ban</button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => dismissBalance(u.username)}>✓ Dismiss</button>
                </div>
              </div>
            ))
          }

          {/* ── Chat: Broadcast ───────────────────────────────────────────── */}
          <div className="admin-section-title" style={{ marginTop:36 }}>💬 Chat Moderation</div>
          {chatStatus && <div className="admin-status-msg">{chatStatus}</div>}

          <div className="admin-site-card">
            <div className="admin-site-card-header">
              <div className="admin-site-card-title">📢 Broadcast Announcement</div>
              <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => setChatLogOpen(true)}>📋 View Log</button>
            </div>
            <div className="admin-site-card-sub">Send a system message to everyone in global chat.</div>
            <div className="admin-broadcast-form">
              <input className="admin-input" placeholder="Announcement text…" value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && broadcastText.trim()) {
                    const d = await authFetch('/api/admin/chat/broadcast', token, { method:'POST', body:JSON.stringify({ text: broadcastText.trim() }) });
                    if (d.ok) { setBroadcastText(''); setChatStatus('📢 Sent!'); } else setChatStatus(d.error || 'Failed');
                  }
                }} />
              <button className="admin-btn admin-btn--primary" disabled={!broadcastText.trim()} onClick={async () => {
                const d = await authFetch('/api/admin/chat/broadcast', token, { method:'POST', body:JSON.stringify({ text: broadcastText.trim() }) });
                if (d.ok) { setBroadcastText(''); setChatStatus('📢 Sent!'); } else setChatStatus(d.error || 'Failed');
              }}>📢 Send</button>
            </div>
          </div>

          {chatLogOpen && (
            <ChatLogModal
              messages={[...chatMessages].sort((a, b) => a.timestamp - b.timestamp)}
              onClose={() => setChatLogOpen(false)}
            />
          )}

          {/* ── Chat: Mod Settings ────────────────────────────────────────── */}
          {chatSettings && (
            <div className="admin-site-card">
              <div className="admin-site-card-title">⚙️ Moderation Settings</div>
              <div className="admin-chat-settings-grid">

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Strictness</label>
                  <select className="admin-input admin-select" value={chatSettings.strictness}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ strictness: e.target.value }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Strictness → ${e.target.value}`); }
                    }}>
                    <option value="strict">🔴 Strict</option>
                    <option value="moderate">🟡 Moderate</option>
                    <option value="relaxed">🟢 Relaxed</option>
                  </select>
                </div>

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Slow Mode</label>
                  <select className="admin-input admin-select" value={chatSettings.slowMode}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ slowMode: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Slow mode → ${e.target.value}s`); }
                    }}>
                    <option value={0}>Off</option><option value={3}>3s</option>
                    <option value={5}>5s</option><option value={10}>10s</option>
                    <option value={30}>30s</option><option value={60}>60s</option>
                  </select>
                </div>

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Max Length</label>
                  <select className="admin-input admin-select" value={chatSettings.maxLength}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ maxLength: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Max length → ${e.target.value}`); }
                    }}>
                    <option value={50}>50</option><option value={100}>100</option>
                    <option value={200}>200</option><option value={400}>400</option>
                  </select>
                </div>

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Max Emojis</label>
                  <select className="admin-input admin-select" value={chatSettings.maxEmojis}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ maxEmojis: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Max emojis → ${e.target.value}`); }
                    }}>
                    <option value={0}>Unlimited</option><option value={3}>3</option>
                    <option value={6}>6</option><option value={10}>10</option>
                  </select>
                </div>

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Auto-mute after</label>
                  <select className="admin-input admin-select" value={chatSettings.autoMuteAfter}
                    onChange={async e => {
                      const val = Number(e.target.value);
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ autoMuteAfter: val, muteEnabled: val > 0 }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Auto-mute after ${val || 'disabled'}`); }
                    }}>
                    <option value={0}>Disabled</option><option value={2}>2 violations</option>
                    <option value={3}>3 violations</option><option value={5}>5 violations</option>
                    <option value={10}>10 violations</option>
                  </select>
                </div>

                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Repeat window</label>
                  <select className="admin-input admin-select" value={chatSettings.repeatWindow}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify({ repeatWindow: Number(e.target.value) }) });
                      if (s.ok) setChatSettings(s.settings);
                    }}>
                    <option value={2}>2 identical</option><option value={3}>3 identical</option>
                    <option value={5}>5 identical</option>
                  </select>
                </div>

                {[['blockLinks','Block Links'],['blockAllCaps','Block ALL CAPS'],['blockCharSpam','Block Char Spam'],['blockRepeat','Block Repeats'],['shadowMute','Shadow-mute']].map(([key, label]) => (
                  <div key={key} className="admin-chat-setting admin-chat-setting--toggle">
                    <label className="admin-chat-setting-label">{label}</label>
                    <button className={`admin-toggle-btn admin-toggle-btn--sm${chatSettings[key] ? ' admin-toggle-btn--on' : ''}`}
                      onClick={async () => {
                        const patch = { [key]: !chatSettings[key] };
                        const s = await authFetch('/api/admin/chat/settings', token, { method:'POST', body:JSON.stringify(patch) });
                        if (s.ok) { setChatSettings(s.settings); setChatStatus(`${label}: ${!chatSettings[key] ? 'ON' : 'OFF'}`); }
                      }}>{chatSettings[key] ? 'ON' : 'OFF'}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Chat Bans ─────────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🚫 Chat Bans ({chatBans.length})</div>
            <div className="admin-chat-ban-form">
              <input className="admin-input" placeholder="Username" value={chatBanUser} onChange={e => setChatBanUser(e.target.value)} />
              <input className="admin-input" placeholder="Reason" value={chatBanReason} onChange={e => setChatBanReason(e.target.value)} />
              <select className="admin-input admin-select" value={chatBanDur} onChange={e => setChatBanDur(e.target.value)}>
                <option value="permanent">Permanent</option><option value="1h">1 hour</option>
                <option value="6h">6 hours</option><option value="24h">24 hours</option>
                <option value="7d">7 days</option>
              </select>
              <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                if (!chatBanUser.trim()) return;
                await authFetch('/api/admin/chat/ban', token, { method:'POST', body:JSON.stringify({ username: chatBanUser.trim(), reason: chatBanReason, duration: chatBanDur }) });
                setChatBanUser(''); setChatBanReason(''); loadChat(); setChatStatus(`Banned @${chatBanUser.trim()} from chat.`);
              }}>🚫 Ban</button>
            </div>
            {chatBans.length === 0
              ? <div className="admin-empty">No chat bans.</div>
              : chatBans.map(b => (
                <div key={b.username} className="admin-chat-ban-row">
                  <div>
                    <span className="admin-chat-ban-user">@{b.username}</span>
                    {b.reason && <span className="admin-chat-ban-reason"> — {b.reason}</span>}
                    <div className="admin-chat-ban-meta">
                      {b.expiresAt ? `Until ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'} · by {b.bannedBy}
                    </div>
                  </div>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                    await authFetch(`/api/admin/chat/ban/${encodeURIComponent(b.username)}`, token, { method:'DELETE' });
                    loadChat(); setChatStatus(`Unbanned @${b.username} from chat.`);
                  }}>Unban</button>
                </div>
              ))
            }
          </div>

          {/* ── Muted / Violations ────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🔇 Muted & Violations</div>
            <div className="admin-site-card-sub">Shadow-muted users think they're chatting but no one else sees their messages.</div>
            {chatMuted.length === 0 && chatViolations.length === 0 && <div className="admin-empty">No muted users or violations.</div>}
            {[...new Set([...chatMuted, ...chatViolations.map(v => v.username)])].map(uname => {
              const isMuted   = chatMuted.includes(uname);
              const violation = chatViolations.find(v => v.username === uname);
              return (
                <div key={uname} className="admin-chat-ban-row">
                  <div>
                    <span className="admin-chat-ban-user">@{uname}</span>
                    {isMuted    && <span className="admin-chat-muted-badge">🔇 muted</span>}
                    {violation  && <span className="admin-chat-viols"> {violation.count} violation{violation.count !== 1 ? 's' : ''}</span>}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {isMuted && (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                        await authFetch(`/api/admin/chat/mute/${encodeURIComponent(uname)}`, token, { method:'DELETE' });
                        loadChat(); setChatStatus(`Unmuted @${uname}`);
                      }}>Unmute</button>
                    )}
                    {!isMuted && (
                      <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                        await authFetch(`/api/admin/chat/mute/${encodeURIComponent(uname)}`, token, { method:'POST' });
                        loadChat(); setChatStatus(`Muted @${uname}`);
                      }}>Mute</button>
                    )}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                      await authFetch(`/api/admin/chat/violations/${encodeURIComponent(uname)}`, token, { method:'DELETE' });
                      loadChat(); setChatStatus(`Reset violations for @${uname}`);
                    }}>Reset</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Message Feed ──────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-header">
              <div className="admin-site-card-title">📜 Message Log (newest first)</div>
              <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                if (!window.confirm('Clear all chat messages?')) return;
                await authFetch('/api/admin/chat/messages', token, { method:'DELETE' });
                loadChat(); setChatStatus('Chat log cleared.');
              }}>🗑 Clear</button>
            </div>
            <div className="admin-chat-feed">
              {chatMessages.length === 0 && <div className="admin-empty">No messages.</div>}
              {chatMessages.map((m, i) => (
                <div key={m.id || i} className={`admin-chat-msg${m.filtered ? ' admin-chat-msg--filtered' : ''}${m.shadowMuted ? ' admin-chat-msg--shadow' : ''}`}>
                  <span className="admin-chat-msg-user">@{m.username}</span>
                  <span className="admin-chat-msg-text">{m.text}</span>
                  <span className="admin-chat-msg-time">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  {m.filtered    && <span className="admin-chat-msg-tag admin-chat-msg-tag--blocked">BLOCKED: {m.filterReason}</span>}
                  {m.shadowMuted && <span className="admin-chat-msg-tag admin-chat-msg-tag--shadow">SHADOW</span>}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── SETTINGS ── testers + game status + danger zone ── */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'settings' && (
        <div className="admin-section">
          <div className="admin-section-title">⚙️ Site Settings</div>
          {siteStatus && <div className="admin-status-msg">{siteStatus}</div>}

          {/* ── Approved Testers ──────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🔬 Approved Testers</div>
            <div className="admin-site-card-sub">Users in this list can access any game marked as Testing. You (jasper) always have access.</div>
            <div className="admin-testers-section">
              {approvedTesters.length === 0 && <div className="admin-empty" style={{ fontSize:'0.82rem', padding:'0.4rem 0' }}>No testers added yet.</div>}
              <div className="admin-testers-list">
                {approvedTesters.map(u => (
                  <div key={u} className="admin-tester-chip">
                    <span>{u}</span>
                    <button className="admin-tester-remove" title="Remove" onClick={async () => {
                      const res = await authFetch(`/api/admin/site/testers/${encodeURIComponent(u)}`, token, { method:'DELETE' });
                      if (res.ok) { refreshConfig(); setSiteStatus(`Removed ${u} from testers.`); }
                    }}>✕</button>
                  </div>
                ))}
              </div>
              <div className="admin-testers-add">
                <input className="admin-input" placeholder="Username to authorise" value={testerInput}
                  onChange={e => setTesterInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && testerInput.trim()) {
                      authFetch('/api/admin/site/testers', token, { method:'POST', body:JSON.stringify({ username: testerInput.trim() }) })
                        .then(res => { if (res.ok) { refreshConfig(); setSiteStatus(`Added ${testerInput.trim()} as tester.`); setTesterInput(''); } });
                    }
                  }} />
                <button className="admin-btn admin-btn--primary admin-btn--sm" disabled={!testerInput.trim()} onClick={async () => {
                  const u = testerInput.trim();
                  if (!u) return;
                  const res = await authFetch('/api/admin/site/testers', token, { method:'POST', body:JSON.stringify({ username: u }) });
                  if (res.ok) { refreshConfig(); setSiteStatus(`Added ${u} as tester.`); setTesterInput(''); }
                }}>+ Add</button>
              </div>
            </div>
          </div>

          {/* ── Game Status ───────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🎮 Game Status</div>
            <div className="admin-site-card-sub">
              <span style={{color:'#86efac'}}>● OPEN</span> — everyone can play &nbsp;·&nbsp;
              <span style={{color:'#f87171'}}>● CLOSED</span> — maintenance &nbsp;·&nbsp;
              <span style={{color:'#c084fc'}}>● TESTING</span> — testers only
            </div>
            {['casino','arcade','multiplayer'].map(cat => {
              const games = GAME_LIST.filter(g => g.category === cat);
              return (
                <div key={cat} className="admin-game-group">
                  <div className="admin-game-group-label">
                    {{ casino:'🎰 Casino', arcade:'🕹️ Arcade', multiplayer:'👥 Multiplayer' }[cat]}
                  </div>
                  <div className="admin-game-grid">
                    {games.map(g => {
                      const closed  = closedGames.includes(g.slug);
                      const testing = testingGames.includes(g.slug);
                      return (
                        <div key={g.slug} className={`admin-game-tile${closed ? ' admin-game-tile--closed' : testing ? ' admin-game-tile--testing' : ''}`}>
                          <span className="admin-game-tile-name">{g.name}</span>
                          <div className="admin-game-tile-btns">
                            <button
                              className={`admin-toggle-btn admin-toggle-btn--sm${closed ? ' admin-toggle-btn--off' : ' admin-toggle-btn--open'}`}
                              onClick={async () => {
                                const res = await authFetch('/api/admin/site/game-close', token, { method:'POST', body:JSON.stringify({ slug: g.slug, closed: !closed }) });
                                if (res.ok) { refreshConfig(); setSiteStatus(`${g.name} ${closed ? 'opened' : 'closed'}.`); }
                              }}>{closed ? 'CLOSED' : 'OPEN'}</button>
                            <button
                              className={`admin-toggle-btn admin-toggle-btn--sm${testing ? ' admin-toggle-btn--testing' : ' admin-toggle-btn--live'}`}
                              onClick={async () => {
                                const res = await authFetch('/api/admin/site/game-test', token, { method:'POST', body:JSON.stringify({ slug: g.slug, testing: !testing }) });
                                if (res.ok) { refreshConfig(); setSiteStatus(`${g.name} set to ${testing ? 'LIVE' : 'TESTING'}.`); }
                              }}>{testing ? '🔬 TEST' : 'LIVE'}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Weekly Reset ──────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🔄 Weekly Balance Reset</div>
            <div className="admin-site-card-sub">
              Resets every player's casino balance to the specified amount. Runs automatically every Sunday at midnight.
              Use this button to trigger it manually.
            </div>
            <div className="admin-give-form" style={{ marginTop:12 }}>
              <input className="admin-input" type="number" placeholder="Reset amount ($)" min={100}
                value={weeklyResetAmt} onChange={e => setWeeklyResetAmt(e.target.value)} style={{ width:160 }} />
              <button className="admin-btn admin-btn--warn" onClick={async () => {
                if (!window.confirm(`Reset ALL players' balances to $${Number(weeklyResetAmt).toLocaleString()}? This cannot be undone.`)) return;
                const d = await authFetch('/api/admin/weekly-reset', token, {
                  method: 'POST', body: JSON.stringify({ amount: Number(weeklyResetAmt) }),
                });
                setSiteStatus(d.ok ? `✓ Reset ${d.count} players to $${d.amount.toLocaleString()}` : (d.error || 'Failed'));
              }}>🔄 Reset Now</button>
            </div>
          </div>

          {/* ── Jackpot ───────────────────────────────────────────────────── */}
          <JackpotAdminCard token={token} authFetch={authFetch} />

          {/* ── Lottery ───────────────────────────────────────────────────── */}
          <LotteryAdminCard token={token} authFetch={authFetch} />

          {/* ── Wager Race ────────────────────────────────────────────────── */}
          <WagerRaceAdminCard token={token} authFetch={authFetch} />

          {/* ── Gift Codes ────────────────────────────────────────────────── */}
          <GiftCodeAdminCard token={token} authFetch={authFetch} />

          {/* ── News ──────────────────────────────────────────────────────── */}
          <NewsAdminCard token={token} authFetch={authFetch} />

          {/* ── Boost Tokens ──────────────────────────────────────────────── */}
          <BoostAdminCard token={token} authFetch={authFetch} />

          {/* ── Jackpot Rush ──────────────────────────────────────────────── */}
          <JackpotRushAdminCard token={token} authFetch={authFetch} />

          {/* ── Coin Rain ─────────────────────────────────────────────────── */}
          <CoinRainAdminCard token={token} authFetch={authFetch} />

          {/* ── Secondary Admins (owner only) ─────────────────────────────── */}
          {isOwner && <SecondaryAdminsCard token={token} authFetch={authFetch} />}

          {/* ── Danger Zone ───────────────────────────────────────────────── */}
          <div className="admin-site-card admin-danger-card">
            <div className="admin-site-card-title">⚠️ Danger Zone</div>
            <div className="admin-site-card-sub">These actions are irreversible. Use with caution.</div>
            <div className="admin-danger-grid">
              <div className="admin-danger-action">
                <div className="admin-danger-action-label">Clear Chat Violations</div>
                <div className="admin-danger-action-sub">Resets counts and unmutes everyone.</div>
                <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Clear all chat violations and unmute everyone?')) return;
                  const d = await authFetch('/api/admin/danger/clear-violations', token, { method:'POST' });
                  setStatus(d.ok ? `✓ Cleared violations for ${d.count} user(s)` : d.error);
                  loadChat();
                }}>Clear Violations</button>
              </div>
              <div className="admin-danger-action">
                <div className="admin-danger-action-label">Unban All IPs</div>
                <div className="admin-danger-action-sub">Removes every active IP ban.</div>
                <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Remove ALL IP bans?')) return;
                  const d = await authFetch('/api/admin/danger/unban-all-ips', token, { method:'POST' });
                  setStatus(d.ok ? `✓ Unbanned ${d.count} IP(s)` : d.error);
                  loadIPBans();
                }}>Unban All IPs</button>
              </div>
              <div className="admin-danger-action">
                <div className="admin-danger-action-label">Unban All Users</div>
                <div className="admin-danger-action-sub">Lifts all user game bans.</div>
                <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Remove ALL user game bans?')) return;
                  const d = await authFetch('/api/admin/danger/unban-all-users', token, { method:'POST' });
                  setStatus(d.ok ? `✓ Unbanned ${d.count} user(s)` : d.error);
                  loadUserBans();
                }}>Unban All Users</button>
              </div>
              <div className="admin-danger-action">
                <div className="admin-danger-action-label">Kick Everyone</div>
                <div className="admin-danger-action-sub">Destroys all active sessions.</div>
                <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Force-logout ALL users?')) return;
                  const d = await authFetch('/api/admin/danger/kick-all', token, { method:'POST' });
                  setStatus(d.ok ? `✓ Killed ${d.sessionsKilled} session(s)` : d.error);
                }}>Kick Everyone</button>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
