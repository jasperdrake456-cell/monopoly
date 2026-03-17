import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
const BAL_HIGH   = 100_000;   // yellow flag
const BAL_VERY_HIGH = 1_000_000; // red flag

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authFetch(path, token, options = {}) {
  return fetch(SERVER_URL + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers },
    ...options,
  }).then(r => r.json());
}

export default function AdminPage() {
  const { user, token, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]           = useState('reports'); // 'reports' | 'users' | 'money' | 'bans'
  const [reports, setReports]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [status, setStatus]     = useState('');
  const [giveTarget, setGiveTarget] = useState('');
  const [giveAmount, setGiveAmount] = useState('');
  const [editingBal, setEditingBal] = useState(null); // { username, value }

  // Dismissed flags (persisted to localStorage)
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

  // Bans state
  const [ipBans, setIpBans]         = useState([]);
  const [userBans, setUserBans]     = useState([]);
  const [banIP, setBanIP]           = useState('');
  const [banIPReason, setBanIPReason] = useState('');
  const [banIPDur, setBanIPDur]     = useState('permanent');
  const [banUser_, setBanUser_]     = useState('');
  const [banUserReason, setBanUserReason] = useState('');
  const [banUserDur, setBanUserDur] = useState('permanent');
  const [banUserGames, setBanUserGames] = useState('all');
  const [activity, setActivity]         = useState({}); // username → gameSlug

  const ALL_GAMES = [
    'crash','plinko','dice','roulette','blackjack','baccarat',
    'mines','ride-the-bus','slots','chicken-cross','texas-holdem',
    'hilo','tower','wheel',
  ];

  const isAdmin = user?.username === 'jasper';

  useEffect(() => {
    if (!isLoggedIn || !isAdmin) { navigate('/'); }
  }, [isLoggedIn, isAdmin, navigate]);

  const loadReports = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/reports', token)
      .then(d => { if (d.ok) setReports(d.reports); })
      .catch(() => {});
  }, [token]);

  const loadUsers = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/users', token)
      .then(d => { if (d.ok) setUsers(d.users); })
      .catch(() => {});
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
    authFetch('/api/admin/activity', token)
      .then(d => {
        if (d.ok) {
          const map = {};
          for (const a of d.activity) map[a.username] = a.gameSlug;
          setActivity(map);
        }
      }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (tab === 'reports') { loadReports(); loadUsers(); }
    if (tab === 'users')   { loadUsers(); loadActivity(); }
    if (tab === 'bans')  { loadIPBans(); loadUserBans(); }
  }, [tab, loadReports, loadUsers, loadIPBans, loadUserBans, loadActivity]);

  // Poll activity every 10 seconds while on users tab
  useEffect(() => {
    if (tab !== 'users') return;
    const id = setInterval(loadActivity, 10_000);
    return () => clearInterval(id);
  }, [tab, loadActivity]);

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
      method: 'PUT',
      body: JSON.stringify({ amount: amt }),
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

  async function kickUser(username) {
    const d = await authFetch(`/api/admin/kick/${encodeURIComponent(username)}`, token, { method: 'POST' });
    setStatus(d.ok ? `Kicked @${username} — ${d.sessionsKilled} session(s) destroyed` : (d.error || 'Kick failed'));
  }

  async function resetBalance(username) {
    const d = await authFetch(`/api/admin/users/${username}/balance`, token, {
      method: 'PUT',
      body: JSON.stringify({ amount: 2000 }),
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
      method: 'POST',
      body: JSON.stringify({ ip: banIP.trim(), reason: banIPReason, durationMs: parseDuration(banIPDur) }),
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
    'hilo','tower','wheel',
  ];

  async function submitUserBan() {
    if (!banUser_.trim()) return setStatus('Enter a username.');
    const games = banUserGames === 'all' ? ['*'] : banUserGames === 'casino' ? CASINO_GAMES : [banUserGames];
    const d = await authFetch('/api/admin/bans/user', token, {
      method: 'POST',
      body: JSON.stringify({ username: banUser_.trim(), games, reason: banUserReason, durationMs: parseDuration(banUserDur) }),
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
    try {
      const d = await authFetch('/api/admin/give-money', token, {
        method: 'POST',
        body: JSON.stringify({ username: giveTarget.trim().toLowerCase(), amount: amt }),
      });
      setStatus(d.ok ? `Gave $${amt.toLocaleString()} to ${giveTarget}. New balance: $${d.balance?.toLocaleString()}` : (d.error || 'Failed'));
      if (d.ok) { setGiveTarget(''); setGiveAmount(''); }
    } catch { setStatus('Network error — try again.'); }
  }

  // Derived: users with suspect usernames or very high balances (for auto-flags)
  const flaggedUsernames = useMemo(() => users.filter(u => isSuspectUsername(u.username) && u.username !== 'jasper'), [users]);
  const flaggedBalances  = useMemo(() => users.filter(u => (u.balance || 0) >= BAL_HIGH && u.username !== 'jasper'), [users]);

  // After applying admin dismissals
  const visibleFlaggedUsernames = useMemo(
    () => flaggedUsernames.filter(u => !dismissedUsernames.has(u.username)),
    [flaggedUsernames, dismissedUsernames]
  );
  const visibleFlaggedBalances = useMemo(
    () => flaggedBalances.filter(u => !dismissedBalances.has(u.username)),
    [flaggedBalances, dismissedBalances]
  );

  // IP grouping: richest account per IP is primary, others are sub-accounts
  const ipGroups = useMemo(() => {
    const byIP = {};
    const noIP = [];
    for (const u of users) {
      if (!u.lastIP) { noIP.push(u); }
      else {
        if (!byIP[u.lastIP]) byIP[u.lastIP] = [];
        byIP[u.lastIP].push(u);
      }
    }
    for (const ip in byIP) byIP[ip].sort((a, b) => (b.balance || 0) - (a.balance || 0));
    noIP.sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const result = [];
    const groups = Object.values(byIP).sort((a, b) => (b[0].balance || 0) - (a[0].balance || 0));
    for (const group of groups) {
      group.forEach((u, idx) => result.push({ user: u, isSubAccount: idx > 0, groupSize: group.length }));
    }
    for (const u of noIP) result.push({ user: u, isSubAccount: false, groupSize: 1 });
    return result;
  }, [users]);

  if (!isAdmin) return null;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <Link to="/" className="admin-back">← Game Vault</Link>
        <div className="admin-title">🛡️ Admin Panel</div>
        <div className="admin-user">Logged in as <strong>jasper</strong></div>
      </div>

      <div className="admin-tabs">
        {[['reports','📋 Reports'],['users','👥 Users'],['money','💰 Give Money'],['bans','🚫 Bans']].map(([id, label]) => (
          <button key={id} className={`admin-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {status && (
        <div className="admin-status" onClick={() => setStatus('')}>{status} ✕</div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <div className="admin-section">
          <div className="admin-section-title">User Reports ({reports.filter(r => !r.reviewed).length} unreviewed)</div>
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
                <button className="admin-btn admin-btn--danger" onClick={() => removeEntry(r.gameId, r.entryName)}>
                  🗑 Remove Entry
                </button>
                {!r.reviewed && (
                  <button className="admin-btn" onClick={() => dismissReport(r.id)}>
                    ✓ Mark Reviewed
                  </button>
                )}
                <button className="admin-btn admin-btn--ghost" onClick={() => deleteReport(r.id)}>
                  Delete Report
                </button>
              </div>
            </div>
          ))}

          {/* ── Auto-flagged: suspect usernames ── */}
          <div className="admin-section-title" style={{ marginTop: 28 }}>
            🚩 Flagged Usernames ({visibleFlaggedUsernames.length})
            {dismissedUsernames.size > 0 && (
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
                ({dismissedUsernames.size} dismissed)
              </span>
            )}
          </div>
          {visibleFlaggedUsernames.length === 0
            ? <div className="admin-empty">No suspicious usernames detected.</div>
            : visibleFlaggedUsernames.map(u => (
              <div key={u.username} className="admin-report admin-report--flagged">
                <div className="admin-report-meta">
                  <span className="admin-report-name" style={{ color: '#f87171' }}>@{u.username}</span>
                  <span className="admin-report-date">Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'unknown'}</span>
                  {u.lastIP && <span className="admin-report-game">IP: {u.lastIP}</span>}
                </div>
                <div className="admin-report-actions">
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                    setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('permanent');
                    setBanUserReason('Inappropriate username'); setTab('bans');
                    setStatus(`Pre-filled ban for @${u.username}`);
                  }}>🚫 Ban</button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => deleteUser(u.username)}>
                    🗑 Delete
                  </button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => dismissUsername(u.username)}>
                    ✓ Dismiss
                  </button>
                </div>
              </div>
            ))
          }

          {/* ── Auto-flagged: very high balances ── */}
          <div className="admin-section-title" style={{ marginTop: 28 }}>
            💰 Flagged Balances ({visibleFlaggedBalances.length})
            <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
              ≥ $100,000
            </span>
            {dismissedBalances.size > 0 && (
              <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
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
                  <span className="admin-report-score" style={{ color: (u.balance || 0) >= BAL_VERY_HIGH ? '#f87171' : '#fbbf24' }}>
                    {(u.balance || 0) >= BAL_VERY_HIGH ? '🔴' : '🟡'} ${(u.balance || 0).toLocaleString()}
                  </span>
                  {u.lastIP && <span className="admin-report-game">IP: {u.lastIP}</span>}
                </div>
                <div className="admin-report-actions">
                  <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => resetBalance(u.username)}>
                    ↩ Reset $2k
                  </button>
                  <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                    setBanUser_(u.username); setBanUserGames('casino'); setBanUserDur('permanent');
                    setBanUserReason('Suspected cheating'); setTab('bans');
                    setStatus(`Pre-filled casino ban for @${u.username}`);
                  }}>🎰 Casino Ban</button>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => dismissBalance(u.username)}>
                    ✓ Dismiss
                  </button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <div className="admin-section">
          <div className="admin-section-title">All Accounts ({users.length})</div>
          {users.length === 0 && <div className="admin-empty">No users found.</div>}
          <div className="admin-user-list">
            {ipGroups.map(({ user: u, isSubAccount }) => (
              <div key={u.username} className={`admin-user-row admin-user-row--expanded${isSubAccount ? ' admin-user-row--sub' : ''}`}>
                <div className="admin-user-info">
                  <span className="admin-user-name">{u.displayName}</span>
                  <span className="admin-user-handle">@{u.username}</span>
                  {(u.balance || 0) >= BAL_VERY_HIGH && <span className="admin-user-flag admin-user-flag--red" title="Very high balance — possible cheating">🔴</span>}
                  {(u.balance || 0) >= BAL_HIGH && (u.balance || 0) < BAL_VERY_HIGH && <span className="admin-user-flag admin-user-flag--yellow" title="High balance">🟡</span>}
                  {isSuspectUsername(u.username) && <span className="admin-user-flag" title="Suspicious username">🚩</span>}
                  {editingBal?.username === u.username ? (
                    <span className="admin-user-bal-edit">
                      <span className="admin-bal-dollar">$</span>
                      <input
                        className="admin-bal-input"
                        type="number"
                        min={0}
                        value={editingBal.value}
                        onChange={e => setEditingBal({ username: u.username, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveBalance(u.username); if (e.key === 'Escape') setEditingBal(null); }}
                        autoFocus
                      />
                      <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={() => saveBalance(u.username)}>✓</button>
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditingBal(null)}>✕</button>
                    </span>
                  ) : (
                    <span
                      className="admin-user-bal admin-user-bal--clickable"
                      title="Click to edit balance"
                      onClick={() => setEditingBal({ username: u.username, value: String(u.balance || 0) })}
                    >
                      ${(u.balance || 0).toLocaleString()} ✏️
                    </span>
                  )}
                  {u.lastIP && (
                    <span className="admin-user-ip" title={`Last seen ${u.lastSeen ? new Date(u.lastSeen).toLocaleString() : 'unknown'}`}>
                      🌐 {u.lastIP}
                    </span>
                  )}
                  {!u.lastIP && <span className="admin-user-ip admin-user-ip--unknown">🌐 No IP yet</span>}
                  {activity[u.username]
                    ? <span className="admin-user-online" title="Currently online">🟢 {activity[u.username]}</span>
                    : <span className="admin-user-offline">⚫ offline</span>
                  }
                </div>
                {u.username !== 'jasper' && (
                  <div className="admin-user-actions">
                    {activity[u.username] && (
                      <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                        setBanUser_(u.username); setBanUserGames(activity[u.username]); setBanUserDur('permanent');
                        setBanUserReason(''); setTab('bans');
                        setStatus(`Pre-filled ban from ${activity[u.username]} for @${u.username}`);
                      }}>🎯 Ban from {activity[u.username]}</button>
                    )}
                    <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('permanent');
                      setBanUserReason(''); setTab('bans');
                      setStatus(`Pre-filled ban form for @${u.username}`);
                    }}>🚫 Perma Ban</button>
                    <button className="admin-btn admin-btn--casino admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('casino'); setBanUserDur('permanent');
                      setBanUserReason(''); setTab('bans');
                      setStatus(`Pre-filled casino ban for @${u.username}`);
                    }}>🎰 Casino Ban</button>
                    <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => {
                      setBanUser_(u.username); setBanUserGames('all'); setBanUserDur('24h');
                      setBanUserReason(''); setTab('bans');
                      setStatus(`Pre-filled 24h ban form for @${u.username}`);
                    }}>⏱ Temp Ban</button>
                    {u.lastIP && (
                      <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => {
                        setBanIP(u.lastIP); setBanIPDur('permanent'); setBanIPReason('');
                        setTab('bans');
                        setStatus(`Pre-filled IP ban for ${u.lastIP} (@${u.username})`);
                      }}>🌐 Ban IP</button>
                    )}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => resetBalance(u.username)} title="Reset casino balance to $2,000">
                      ↩ Reset $2k
                    </button>
                    <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={() => kickUser(u.username)}>
                      👢 Kick
                    </button>
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => deleteUser(u.username)}>
                      🗑 Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Give Money ── */}
      {tab === 'money' && (
        <div className="admin-section">
          <div className="admin-section-title">Give Casino Money</div>
          <div className="admin-give-form">
            <input
              className="admin-input"
              placeholder="Username"
              value={giveTarget}
              onChange={e => setGiveTarget(e.target.value)}
            />
            <input
              className="admin-input"
              type="number"
              placeholder="Amount ($)"
              value={giveAmount}
              onChange={e => setGiveAmount(e.target.value)}
              min={1}
            />
            <button className="admin-btn admin-btn--primary" onClick={giveMoney}>
              💰 Give Money
            </button>
          </div>
        </div>
      )}
      {/* ── Bans ── */}
      {tab === 'bans' && (
        <div className="admin-section">

          {/* IP Bans */}
          <div className="admin-section-title">🌐 IP Bans ({ipBans.length})</div>
          <div className="admin-ban-form">
            <input className="admin-input" placeholder="IP address (e.g. 1.2.3.4)" value={banIP} onChange={e => setBanIP(e.target.value)} />
            <input className="admin-input" placeholder="Reason (optional)" value={banIPReason} onChange={e => setBanIPReason(e.target.value)} />
            <select className="admin-input admin-select" value={banIPDur} onChange={e => setBanIPDur(e.target.value)}>
              <option value="1h">1 hour</option>
              <option value="6h">6 hours</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="permanent">Permanent</option>
            </select>
            <button className="admin-btn admin-btn--danger" onClick={submitIPBan}>🚫 Ban IP</button>
          </div>

          {ipBans.length === 0 && <div className="admin-empty">No IP bans active.</div>}
          {ipBans.map(b => (
            <div key={b.ip} className="admin-ban-row">
              <div className="admin-ban-info">
                <span className="admin-ban-target">{b.ip}</span>
                {b.reason && <span className="admin-ban-reason">"{b.reason}"</span>}
                <span className="admin-ban-expiry">
                  {b.expiresAt ? `Expires ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'}
                </span>
              </div>
              <button className="admin-btn admin-btn--ghost" onClick={() => removeIPBan(b.ip)}>Unban</button>
            </div>
          ))}

          <div style={{ marginTop: 28 }} />

          {/* User Game Bans */}
          <div className="admin-section-title">👤 User Game Bans ({userBans.length})</div>
          <div className="admin-ban-form">
            <input className="admin-input" placeholder="Username" value={banUser_} onChange={e => setBanUser_(e.target.value)} />
            <input className="admin-input" placeholder="Reason (optional)" value={banUserReason} onChange={e => setBanUserReason(e.target.value)} />
            <select className="admin-input admin-select" value={banUserGames} onChange={e => setBanUserGames(e.target.value)}>
              <option value="all">Everything (all games)</option>
              <option value="casino">Casino games only</option>
              {ALL_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="admin-input admin-select" value={banUserDur} onChange={e => setBanUserDur(e.target.value)}>
              <option value="1h">1 hour</option>
              <option value="6h">6 hours</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="permanent">Permanent</option>
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
                <span className="admin-ban-expiry">
                  {b.expiresAt ? `Expires ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'}
                </span>
              </div>
              <button className="admin-btn admin-btn--ghost" onClick={() => removeUserBan(b.username)}>Unban</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
