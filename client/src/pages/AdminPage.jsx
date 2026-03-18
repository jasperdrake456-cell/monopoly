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

  const [tab, setTab]           = useState('stats'); // 'stats'|'reports'|'users'|'money'|'bans'|'wins'|'site'|'chat'
  const [reports, setReports]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [bigWins, setBigWins]   = useState([]);
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

  // ── Site config (game closures + testing mode) ────────────────────────────
  const { closedGames, testingGames, approvedTesters, refreshConfig } = useSiteConfig();
  const [testerInput, setTesterInput]   = useState('');
  const [siteStatus, setSiteStatus]     = useState('');

  // ── Chat mod ────────────────────────────────────────────────────────────────
  const [chatMessages,   setChatMessages]   = useState([]);
  const [chatBans,       setChatBans]       = useState([]);
  const [chatViolations, setChatViolations] = useState([]);
  const [chatMuted,      setChatMuted]      = useState([]);
  const [chatSettings,   setChatSettings]   = useState(null);
  const [chatLogOpen,    setChatLogOpen]    = useState(false);
  const [chatBanUser,    setChatBanUser]     = useState('');
  const [chatBanReason,  setChatBanReason]   = useState('');
  const [chatBanDur,     setChatBanDur]      = useState('permanent');
  const [chatStatus,     setChatStatus]      = useState('');
  const [broadcastText,  setBroadcastText]   = useState('');

  // ── Stats tab ───────────────────────────────────────────────────────────────
  const [platformStats, setPlatformStats] = useState(null);

  // ── User search ─────────────────────────────────────────────────────────────
  const [userSearch, setUserSearch] = useState('');

  const ALL_GAMES = [
    'crash','plinko','dice','roulette','blackjack','baccarat',
    'mines','ride-the-bus','slots','chicken-cross','texas-holdem',
    'hilo','tower','wheel','video-poker','keno','dragon-tiger',
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

  const loadBigWins = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/wins', token)
      .then(d => { if (d.ok) setBigWins(d.wins); })
      .catch(() => {});
  }, [token]);

  const loadStats = useCallback(() => {
    if (!token) return;
    authFetch('/api/admin/stats', token)
      .then(d => { if (d.ok) setPlatformStats(d.stats); })
      .catch(() => {});
  }, [token]);

  const loadChat = useCallback(() => {
    if (!token) return;
    Promise.all([
      authFetch('/api/admin/chat/messages',   token),
      authFetch('/api/admin/chat/bans',        token),
      authFetch('/api/admin/chat/violations',  token),
      authFetch('/api/admin/chat/muted',       token),
      authFetch('/api/admin/chat/settings',    token),
    ]).then(([msgs, bans, viols, muted, settings]) => {
      if (msgs.ok)     setChatMessages([...msgs.messages].reverse());
      if (bans.ok)     setChatBans(bans.bans);
      if (viols.ok)    setChatViolations(viols.violations);
      if (muted.ok)    setChatMuted(muted.muted);
      if (settings.ok) setChatSettings(settings.settings);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (tab === 'stats')   { loadStats(); loadUsers(); }
    if (tab === 'reports') { loadReports(); loadUsers(); }
    if (tab === 'users')   { loadUsers(); loadActivity(); }
    if (tab === 'bans')    { loadIPBans(); loadUserBans(); }
    if (tab === 'wins')    { loadBigWins(); }
    if (tab === 'site')    { refreshConfig(); }
    if (tab === 'chat')    { loadChat(); }
  }, [tab, loadStats, loadReports, loadUsers, loadIPBans, loadUserBans, loadActivity, loadBigWins, refreshConfig, loadChat]);

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
    'hilo','tower','wheel','video-poker','keno','dragon-tiger',
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

  // Flat sorted user list (richest first)
  const sortedUsers = useMemo(
    () => [...users].filter(u => u.username !== 'jasper').sort((a, b) => (b.balance || 0) - (a.balance || 0)),
    [users]
  );

  // Filtered by search
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return sortedUsers;
    return sortedUsers.filter(u =>
      u.username.includes(q) ||
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.lastIP || '').includes(q)
    );
  }, [sortedUsers, userSearch]);

  if (!isAdmin) return null;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <Link to="/" className="admin-back">← Game Vault</Link>
        <div className="admin-title">🛡️ Admin Panel</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="admin-btn admin-btn--ghost admin-btn--sm"
            title="Reload current tab data"
            onClick={() => {
              if (tab === 'stats')   { loadStats(); loadUsers(); }
              if (tab === 'reports') { loadReports(); loadUsers(); }
              if (tab === 'users')   { loadUsers(); loadActivity(); }
              if (tab === 'bans')    { loadIPBans(); loadUserBans(); }
              if (tab === 'wins')    { loadBigWins(); }
              if (tab === 'site')    { refreshConfig(); setSiteStatus('↻ Refreshed'); }
              if (tab === 'chat')    { loadChat(); setChatStatus('↻ Refreshed'); }
              setStatus('↻ Refreshed');
            }}
          >↻ Reload</button>
          <div className="admin-user">Logged in as <strong>jasper</strong></div>
        </div>
      </div>

      <div className="admin-tabs">
        {[['stats','📊 Stats'],['reports','📋 Reports'],['users','👥 Users'],['money','💰 Give Money'],['bans','🚫 Bans'],['wins','🏆 Big Wins'],['site','⚙️ Site Control'],['chat','💬 Chat Mod']].map(([id, label]) => (
          <button key={id} className={`admin-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {status && (
        <div className="admin-status" onClick={() => setStatus('')}>{status} ✕</div>
      )}

      {/* ── Stats ── */}
      {tab === 'stats' && (
        <div className="admin-section">
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
                  <div className="admin-stat-label">Total Chips in Circulation</div>
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

              {/* Top 10 richest */}
              <div className="admin-section-title" style={{ marginTop: 28 }}>💰 Top 10 Balances</div>
              <div className="admin-user-list">
                {sortedUsers.slice(0, 10).map((u, i) => (
                  <div key={u.username} className="admin-user-row">
                    <div className="admin-user-info">
                      <span className="admin-stat-rank">#{i + 1}</span>
                      <span className="admin-user-name">{u.displayName}</span>
                      <span className="admin-user-handle">@{u.username}</span>
                      <span className="admin-user-bal">${(u.balance || 0).toLocaleString()}</span>
                      {activity[u.username]
                        ? <span className="admin-user-online">🟢 {activity[u.username]}</span>
                        : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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
          <div className="admin-section-title-row">
            <div className="admin-section-title">All Accounts ({filteredUsers.length}{userSearch ? ` of ${sortedUsers.length}` : ''})</div>
          </div>
          <div className="admin-user-search-row">
            <input
              className="admin-input admin-user-search"
              placeholder="🔍 Search by username, display name, or IP…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setUserSearch('')}>✕ Clear</button>
            )}
          </div>
          {filteredUsers.length === 0 && <div className="admin-empty">{userSearch ? 'No users match your search.' : 'No users found.'}</div>}
          <div className="admin-user-list">
            {filteredUsers.map(u => (
              <div key={u.username} className="admin-user-row admin-user-row--expanded">
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
          {/* Give money form */}
          <div className="admin-section-title">💰 Give Casino Money</div>
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

      {/* ── Big Wins ── */}
      {tab === 'wins' && (
        <div className="admin-section">
          <div className="admin-wins-header">
            <div className="admin-section-title">🏆 Big Wins ({bigWins.length})</div>
            <div className="admin-wins-header-actions">
              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={loadBigWins}>↻ Refresh</button>
              {bigWins.length > 0 && (
                <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                  if (!window.confirm('Clear all big win logs? This cannot be undone.')) return;
                  await authFetch('/api/admin/wins', token, { method: 'DELETE' });
                  setBigWins([]);
                  setStatus('Win log cleared.');
                }}>🗑 Clear Log</button>
              )}
            </div>
          </div>
          <div className="admin-wins-subtext">
            Logs wins where profit exceeds $50,000 in a single round.
          </div>
          {bigWins.length === 0 && <div className="admin-empty">No big wins recorded yet.</div>}
          {bigWins.map((w, i) => (
            <div key={w.id || i} className="admin-win-row">
              <div className="admin-win-top">
                <span className="admin-win-game">{w.game}</span>
                <span className="admin-win-user">@{w.username}</span>
                <span className="admin-win-profit">+${(w.profit || 0).toLocaleString()}</span>
                {w.multiplier != null && (
                  <span className="admin-win-mult">{w.multiplier}×</span>
                )}
                <span className="admin-win-time">{new Date(w.timestamp).toLocaleString()}</span>
                <button
                  className="admin-btn admin-btn--ghost admin-btn--sm admin-win-delete"
                  title="Remove this entry from the log"
                  onClick={async () => {
                    if (w.id) {
                      await authFetch(`/api/admin/wins/${encodeURIComponent(w.id)}`, token, { method: 'DELETE' });
                    }
                    setBigWins(prev => prev.filter((_, idx) => idx !== i));
                  }}
                >✕</button>
              </div>
              <div className="admin-win-meta">
                <span className="admin-win-bet">Bet: ${(w.bet || 0).toLocaleString()}</span>
                <span className="admin-win-payout">Payout: ${(w.payout || 0).toLocaleString()}</span>
                {w.details && <span className="admin-win-details">{w.details}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Site Control ── */}
      {tab === 'site' && (
        <div className="admin-section">
          <div className="admin-section-title">⚙️ Site Control</div>
          {siteStatus && <div className="admin-status-msg">{siteStatus}</div>}

          {/* ── Approved Testers ─────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🔬 Approved Testers</div>
            <div className="admin-site-card-sub">
              Users in this list can access any game marked as Testing below.
              You (jasper) always have access regardless.
            </div>
            <div className="admin-testers-section">
              {approvedTesters.length === 0 && (
                <div className="admin-empty" style={{ fontSize: '0.82rem', padding: '0.4rem 0' }}>
                  No testers added yet.
                </div>
              )}
              <div className="admin-testers-list">
                {approvedTesters.map(u => (
                  <div key={u} className="admin-tester-chip">
                    <span>{u}</span>
                    <button
                      className="admin-tester-remove"
                      title="Remove tester"
                      onClick={async () => {
                        const res = await authFetch(`/api/admin/site/testers/${encodeURIComponent(u)}`, token, { method: 'DELETE' });
                        if (res.ok) { refreshConfig(); setSiteStatus(`Removed ${u} from testers.`); }
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
              <div className="admin-testers-add">
                <input
                  className="admin-input"
                  placeholder="Username to authorise"
                  value={testerInput}
                  onChange={e => setTesterInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && testerInput.trim()) {
                      authFetch('/api/admin/site/testers', token, {
                        method: 'POST',
                        body: JSON.stringify({ username: testerInput.trim() }),
                      }).then(res => {
                        if (res.ok) { refreshConfig(); setSiteStatus(`Added ${testerInput.trim()} as tester.`); setTesterInput(''); }
                      });
                    }
                  }}
                />
                <button
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  disabled={!testerInput.trim()}
                  onClick={async () => {
                    const u = testerInput.trim();
                    if (!u) return;
                    const res = await authFetch('/api/admin/site/testers', token, {
                      method: 'POST',
                      body: JSON.stringify({ username: u }),
                    });
                    if (res.ok) { refreshConfig(); setSiteStatus(`Added ${u} as tester.`); setTesterInput(''); }
                  }}
                >+ Add</button>
              </div>
            </div>
          </div>

          {/* ── Game Grid ────────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🎮 Game Status</div>
            <div className="admin-site-card-sub">
              <span style={{color:'#86efac'}}>● OPEN</span> — everyone can play &nbsp;·&nbsp;
              <span style={{color:'#f87171'}}>● CLOSED</span> — maintenance, no access &nbsp;·&nbsp;
              <span style={{color:'#c084fc'}}>● TESTING</span> — approved testers only
            </div>
            {['casino', 'arcade', 'multiplayer'].map(cat => {
              const games = GAME_LIST.filter(g => g.category === cat);
              return (
                <div key={cat} className="admin-game-group">
                  <div className="admin-game-group-label">
                    {{ casino: '🎰 Casino', arcade: '🕹️ Arcade', multiplayer: '👥 Multiplayer' }[cat]}
                  </div>
                  <div className="admin-game-grid">
                    {games.map(g => {
                      const closed  = closedGames.includes(g.slug);
                      const testing = testingGames.includes(g.slug);
                      return (
                        <div
                          key={g.slug}
                          className={`admin-game-tile${closed ? ' admin-game-tile--closed' : testing ? ' admin-game-tile--testing' : ''}`}
                        >
                          <span className="admin-game-tile-name">{g.name}</span>
                          <div className="admin-game-tile-btns">
                            <button
                              className={`admin-toggle-btn admin-toggle-btn--sm${closed ? ' admin-toggle-btn--off' : ' admin-toggle-btn--open'}`}
                              title={closed ? 'Click to reopen' : 'Click to close for maintenance'}
                              onClick={async () => {
                                const res = await authFetch('/api/admin/site/game-close', token, {
                                  method: 'POST',
                                  body: JSON.stringify({ slug: g.slug, closed: !closed }),
                                });
                                if (res.ok) { refreshConfig(); setSiteStatus(`${g.name} ${closed ? 'opened' : 'closed'}.`); }
                              }}
                            >{closed ? 'CLOSED' : 'OPEN'}</button>
                            <button
                              className={`admin-toggle-btn admin-toggle-btn--sm${testing ? ' admin-toggle-btn--testing' : ' admin-toggle-btn--live'}`}
                              title={testing ? 'Click to make live' : 'Click to set to testing mode'}
                              onClick={async () => {
                                const res = await authFetch('/api/admin/site/game-test', token, {
                                  method: 'POST',
                                  body: JSON.stringify({ slug: g.slug, testing: !testing }),
                                });
                                if (res.ok) { refreshConfig(); setSiteStatus(`${g.name} set to ${testing ? 'LIVE' : 'TESTING'}.`); }
                              }}
                            >{testing ? '🔬 TEST' : 'LIVE'}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chat Mod ── */}
      {tab === 'chat' && (
        <div className="admin-section">
          <div className="admin-section-title-row">
            <div className="admin-section-title">💬 Chat Moderation</div>
            <button
              className="admin-btn admin-btn--primary admin-btn--sm"
              onClick={() => setChatLogOpen(true)}
            >📋 View Chat Log</button>
          </div>
          {chatStatus && <div className="admin-status-msg">{chatStatus}</div>}

          {/* ── Chat Log Modal ─────────────────────────────────────────────── */}
          {chatLogOpen && (
            <ChatLogModal
              messages={[...chatMessages].sort((a, b) => a.timestamp - b.timestamp)}
              onClose={() => setChatLogOpen(false)}
            />
          )}

          {/* ── Broadcast ────────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">📢 Broadcast Announcement</div>
            <div className="admin-site-card-sub">Send a system message to everyone in global chat.</div>
            <div className="admin-broadcast-form">
              <input
                className="admin-input"
                placeholder="Announcement text…"
                value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter' && broadcastText.trim()) {
                    const d = await authFetch('/api/admin/chat/broadcast', token, {
                      method: 'POST', body: JSON.stringify({ text: broadcastText.trim() }),
                    });
                    if (d.ok) { setBroadcastText(''); setChatStatus('📢 Announcement sent!'); }
                    else setChatStatus(d.error || 'Failed to broadcast');
                  }
                }}
              />
              <button
                className="admin-btn admin-btn--primary"
                disabled={!broadcastText.trim()}
                onClick={async () => {
                  const d = await authFetch('/api/admin/chat/broadcast', token, {
                    method: 'POST', body: JSON.stringify({ text: broadcastText.trim() }),
                  });
                  if (d.ok) { setBroadcastText(''); setChatStatus('📢 Announcement sent!'); }
                  else setChatStatus(d.error || 'Failed to broadcast');
                }}
              >📢 Send</button>
            </div>
          </div>

          {/* ── Mod Settings ─────────────────────────────────────────────── */}
          {chatSettings && (
            <div className="admin-site-card">
              <div className="admin-site-card-title">⚙️ Moderation Settings</div>
              <div className="admin-chat-settings-grid">

                {/* Strictness */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Strictness</label>
                  <select className="admin-input admin-select" value={chatSettings.strictness}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ strictness: e.target.value }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Strictness → ${e.target.value}`); }
                    }}>
                    <option value="strict">🔴 Strict — all profanity blocked</option>
                    <option value="moderate">🟡 Moderate — heavy profanity blocked</option>
                    <option value="relaxed">🟢 Relaxed — slurs/threats only</option>
                  </select>
                </div>

                {/* Slow mode */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Slow Mode</label>
                  <select className="admin-input admin-select" value={chatSettings.slowMode}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ slowMode: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Slow mode → ${e.target.value}s`); }
                    }}>
                    <option value={0}>Off</option>
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </div>

                {/* Max length */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Max Message Length</label>
                  <select className="admin-input admin-select" value={chatSettings.maxLength}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ maxLength: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Max length → ${e.target.value}`); }
                    }}>
                    <option value={50}>50 chars</option>
                    <option value={100}>100 chars</option>
                    <option value={200}>200 chars</option>
                    <option value={400}>400 chars</option>
                  </select>
                </div>

                {/* Max emojis */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Max Emojis per Message</label>
                  <select className="admin-input admin-select" value={chatSettings.maxEmojis}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ maxEmojis: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Max emojis → ${e.target.value}`); }
                    }}>
                    <option value={0}>Unlimited</option>
                    <option value={3}>3</option>
                    <option value={6}>6</option>
                    <option value={10}>10</option>
                  </select>
                </div>

                {/* Auto-mute after N violations */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Auto-mute after violations</label>
                  <select className="admin-input admin-select" value={chatSettings.autoMuteAfter}
                    onChange={async e => {
                      const val = Number(e.target.value);
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ autoMuteAfter: val, muteEnabled: val > 0 }) });
                      if (s.ok) { setChatSettings(s.settings); setChatStatus(`Auto-mute after ${val || 'disabled'}`); }
                    }}>
                    <option value={0}>Disabled</option>
                    <option value={2}>2 violations</option>
                    <option value={3}>3 violations</option>
                    <option value={5}>5 violations</option>
                    <option value={10}>10 violations</option>
                  </select>
                </div>

                {/* Repeat window */}
                <div className="admin-chat-setting">
                  <label className="admin-chat-setting-label">Repeat spam window</label>
                  <select className="admin-input admin-select" value={chatSettings.repeatWindow}
                    onChange={async e => {
                      const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify({ repeatWindow: Number(e.target.value) }) });
                      if (s.ok) { setChatSettings(s.settings); }
                    }}>
                    <option value={2}>2 identical messages</option>
                    <option value={3}>3 identical messages</option>
                    <option value={5}>5 identical messages</option>
                  </select>
                </div>

                {/* Toggle: block links */}
                {[
                  ['blockLinks',    'Block Links/URLs'],
                  ['blockAllCaps',  'Block ALL CAPS'],
                  ['blockCharSpam', 'Block Character Spam'],
                  ['blockRepeat',   'Block Repeat Messages'],
                  ['shadowMute',    'Shadow-mute (silent block)'],
                ].map(([key, label]) => (
                  <div key={key} className="admin-chat-setting admin-chat-setting--toggle">
                    <label className="admin-chat-setting-label">{label}</label>
                    <button
                      className={`admin-toggle-btn admin-toggle-btn--sm${chatSettings[key] ? ' admin-toggle-btn--on' : ''}`}
                      onClick={async () => {
                        const patch = { [key]: !chatSettings[key] };
                        const s = await authFetch('/api/admin/chat/settings', token, { method: 'POST', body: JSON.stringify(patch) });
                        if (s.ok) { setChatSettings(s.settings); setChatStatus(`${label}: ${!chatSettings[key] ? 'ON' : 'OFF'}`); }
                      }}
                    >{chatSettings[key] ? 'ON' : 'OFF'}</button>
                  </div>
                ))}

              </div>
            </div>
          )}

          {/* ── Chat Bans ────────────────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🚫 Chat Bans ({chatBans.length})</div>
            <div className="admin-chat-ban-form">
              <input className="admin-input" placeholder="Username" value={chatBanUser} onChange={e => setChatBanUser(e.target.value)} />
              <input className="admin-input" placeholder="Reason" value={chatBanReason} onChange={e => setChatBanReason(e.target.value)} />
              <select className="admin-input admin-select" value={chatBanDur} onChange={e => setChatBanDur(e.target.value)}>
                <option value="permanent">Permanent</option>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
              </select>
              <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={async () => {
                if (!chatBanUser.trim()) return;
                await authFetch('/api/admin/chat/ban', token, { method: 'POST', body: JSON.stringify({ username: chatBanUser.trim(), reason: chatBanReason, duration: chatBanDur }) });
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
                      {b.expiresAt ? `Until ${new Date(b.expiresAt).toLocaleString()}` : 'Permanent'}
                      {' · '}by {b.bannedBy}
                    </div>
                  </div>
                  <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                    await authFetch(`/api/admin/chat/ban/${encodeURIComponent(b.username)}`, token, { method: 'DELETE' });
                    loadChat(); setChatStatus(`Unbanned @${b.username} from chat.`);
                  }}>Unban</button>
                </div>
              ))
            }
          </div>

          {/* ── Muted / Violations ───────────────────────────────────────── */}
          <div className="admin-site-card">
            <div className="admin-site-card-title">🔇 Muted Users & Violations</div>
            <div className="admin-site-card-sub">Shadow-muted users think they're chatting but no one else sees their messages.</div>
            {chatMuted.length === 0 && chatViolations.length === 0
              ? <div className="admin-empty">No muted users or violations.</div>
              : null
            }
            {[...new Set([...chatMuted, ...chatViolations.map(v => v.username)])].map(uname => {
              const isMuted   = chatMuted.includes(uname);
              const violation = chatViolations.find(v => v.username === uname);
              return (
                <div key={uname} className="admin-chat-ban-row">
                  <div>
                    <span className="admin-chat-ban-user">@{uname}</span>
                    {isMuted && <span className="admin-chat-muted-badge">🔇 muted</span>}
                    {violation && <span className="admin-chat-viols"> {violation.count} violation{violation.count !== 1 ? 's' : ''}</span>}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {isMuted && (
                      <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                        await authFetch(`/api/admin/chat/mute/${encodeURIComponent(uname)}`, token, { method: 'DELETE' });
                        loadChat(); setChatStatus(`Unmuted @${uname}`);
                      }}>Unmute</button>
                    )}
                    {!isMuted && (
                      <button className="admin-btn admin-btn--warn admin-btn--sm" onClick={async () => {
                        await authFetch(`/api/admin/chat/mute/${encodeURIComponent(uname)}`, token, { method: 'POST' });
                        loadChat(); setChatStatus(`Muted @${uname}`);
                      }}>Mute</button>
                    )}
                    <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={async () => {
                      await authFetch(`/api/admin/chat/violations/${encodeURIComponent(uname)}`, token, { method: 'DELETE' });
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
                if (!window.confirm('Clear all chat messages? Cannot be undone.')) return;
                await authFetch('/api/admin/chat/messages', token, { method: 'DELETE' });
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
                  {m.filtered   && <span className="admin-chat-msg-tag admin-chat-msg-tag--blocked">BLOCKED: {m.filterReason}</span>}
                  {m.shadowMuted && <span className="admin-chat-msg-tag admin-chat-msg-tag--shadow">SHADOW</span>}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
