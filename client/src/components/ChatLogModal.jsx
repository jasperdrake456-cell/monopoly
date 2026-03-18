import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import './ChatLogModal.css';

const PAGE_SIZE = 75;

const TYPE_OPTIONS = [
  { value: 'all',     label: 'All messages' },
  { value: 'normal',  label: '✅ Normal only' },
  { value: 'blocked', label: '🚫 Blocked only' },
  { value: 'shadow',  label: '👻 Shadow-muted only' },
];

const RANGE_OPTIONS = [
  { value: 'all',  label: 'All time' },
  { value: '7d',   label: 'Last 7 days' },
  { value: '3d',   label: 'Last 3 days' },
  { value: '24h',  label: 'Last 24 hours' },
  { value: '6h',   label: 'Last 6 hours' },
  { value: '1h',   label: 'Last hour' },
];

function rangeMs(value) {
  const map = { '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, '3d': 259_200_000, '7d': 604_800_000 };
  return map[value] || null;
}

function fmtFull(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ChatLogModal({ messages, onClose }) {
  const [search,   setSearch]   = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateRange,  setDateRange]  = useState('7d');
  const [sortDir,    setSortDir]    = useState('desc'); // 'desc' | 'asc'
  const [groupByUser, setGroupByUser] = useState(false);
  const [page, setPage] = useState(1);
  const listRef = useRef(null);

  // Reset page whenever filters change
  useEffect(() => { setPage(1); }, [search, userFilter, typeFilter, dateRange, sortDir, groupByUser]);

  // Unique users for dropdown
  const allUsers = useMemo(() => {
    const s = new Set(messages.map(m => m.username));
    return [...s].sort();
  }, [messages]);

  // Filtered + sorted messages
  const filtered = useMemo(() => {
    const now      = Date.now();
    const ms       = rangeMs(dateRange);
    const cutoff   = ms ? now - ms : null;
    const needle   = search.trim().toLowerCase();
    const userLc   = userFilter.toLowerCase();

    let result = messages.filter(m => {
      if (cutoff && m.timestamp < cutoff) return false;
      if (userLc && m.username.toLowerCase() !== userLc) return false;
      if (typeFilter === 'normal'  && (m.filtered || m.shadowMuted)) return false;
      if (typeFilter === 'blocked' && !m.filtered)   return false;
      if (typeFilter === 'shadow'  && !m.shadowMuted) return false;
      if (needle && !m.text?.toLowerCase().includes(needle)
                 && !m.username?.toLowerCase().includes(needle)) return false;
      return true;
    });

    result = [...result].sort((a, b) =>
      sortDir === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );

    return result;
  }, [messages, search, userFilter, typeFilter, dateRange, sortDir]);

  // Stats
  const stats = useMemo(() => ({
    total:   filtered.length,
    normal:  filtered.filter(m => !m.filtered && !m.shadowMuted).length,
    blocked: filtered.filter(m => m.filtered).length,
    shadow:  filtered.filter(m => m.shadowMuted).length,
  }), [filtered]);

  // Pagination
  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore   = paginated.length < filtered.length;

  // Group by user mode: build user → messages map
  const grouped = useMemo(() => {
    if (!groupByUser) return null;
    const map = new Map();
    filtered.forEach(m => {
      if (!map.has(m.username)) map.set(m.username, []);
      map.get(m.username).push(m);
    });
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered, groupByUser]);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    const lines = filtered.map(m =>
      `[${fmtFull(m.timestamp)}] @${m.username}: ${m.text}${m.filtered ? ` [BLOCKED: ${m.filterReason}]` : ''}${m.shadowMuted ? ' [SHADOW]' : ''}`
    );
    navigator.clipboard?.writeText(lines.join('\n'))
      .catch(() => {});
  }, [filtered]);

  // Close on backdrop click
  const handleBackdrop = useCallback(e => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Day separators helper
  function renderMessages(msgs) {
    let lastDay = '';
    return msgs.map((m, i) => {
      const day = fmtDate(m.timestamp);
      const showSep = day !== lastDay;
      lastDay = day;
      return (
        <React.Fragment key={m.id || i}>
          {showSep && sortDir === 'asc' && (
            <div className="chatlog-day-sep"><span>{day}</span></div>
          )}
          <div
            className={`chatlog-row${m.filtered ? ' chatlog-row--blocked' : ''}${m.shadowMuted ? ' chatlog-row--shadow' : ''}`}
            onClick={() => userFilter === m.username ? setUserFilter('') : setUserFilter(m.username)}
            title="Click to filter by user"
          >
            <span className="chatlog-row-time">{fmtFull(m.timestamp)}</span>
            <span className="chatlog-row-user">@{m.username}</span>
            <span className="chatlog-row-text">{m.text}</span>
            {m.filtered    && <span className="chatlog-tag chatlog-tag--blocked">BLOCKED{m.filterReason ? `: ${m.filterReason}` : ''}</span>}
            {m.shadowMuted && <span className="chatlog-tag chatlog-tag--shadow">SHADOW</span>}
          </div>
        </React.Fragment>
      );
    });
  }

  return (
    <div className="chatlog-backdrop" onClick={handleBackdrop}>
      <div className="chatlog-modal">

        {/* ── Header ── */}
        <div className="chatlog-header">
          <div className="chatlog-header-left">
            <span className="chatlog-header-icon">📋</span>
            <span className="chatlog-header-title">Chat Log Viewer</span>
            <span className="chatlog-header-sub">{messages.length} messages stored</span>
          </div>
          <div className="chatlog-header-right">
            <button className="chatlog-btn chatlog-btn--ghost" onClick={handleCopy} title="Copy filtered results to clipboard">
              📋 Copy
            </button>
            <button className="chatlog-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="chatlog-stats">
          <div className="chatlog-stat">
            <span className="chatlog-stat-val">{stats.total}</span>
            <span className="chatlog-stat-label">Matching</span>
          </div>
          <div className="chatlog-stat">
            <span className="chatlog-stat-val chatlog-stat-val--ok">{stats.normal}</span>
            <span className="chatlog-stat-label">Normal</span>
          </div>
          <div className="chatlog-stat">
            <span className="chatlog-stat-val chatlog-stat-val--blocked">{stats.blocked}</span>
            <span className="chatlog-stat-label">Blocked</span>
          </div>
          <div className="chatlog-stat">
            <span className="chatlog-stat-val chatlog-stat-val--shadow">{stats.shadow}</span>
            <span className="chatlog-stat-label">Shadow</span>
          </div>
        </div>

        {/* ── Filters toolbar ── */}
        <div className="chatlog-toolbar">
          {/* Search */}
          <div className="chatlog-toolbar-search">
            <span className="chatlog-search-icon">🔍</span>
            <input
              className="chatlog-search-input"
              placeholder="Search messages or usernames…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="chatlog-search-clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* User dropdown */}
          <select className="chatlog-select" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
            <option value="">All users ({allUsers.length})</option>
            {allUsers.map(u => <option key={u} value={u}>@{u}</option>)}
          </select>

          {/* Type filter */}
          <select className="chatlog-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Date range */}
          <select className="chatlog-select" value={dateRange} onChange={e => setDateRange(e.target.value)}>
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Sort */}
          <button
            className={`chatlog-btn chatlog-btn--sort${sortDir === 'asc' ? ' chatlog-btn--sort-asc' : ''}`}
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            title={sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
          >
            {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
          </button>

          {/* Group by user */}
          <button
            className={`chatlog-btn${groupByUser ? ' chatlog-btn--active' : ' chatlog-btn--ghost'}`}
            onClick={() => setGroupByUser(g => !g)}
          >
            👤 Group
          </button>

          {/* Reset */}
          {(search || userFilter || typeFilter !== 'all' || dateRange !== '7d') && (
            <button className="chatlog-btn chatlog-btn--ghost chatlog-btn--reset" onClick={() => {
              setSearch(''); setUserFilter(''); setTypeFilter('all'); setDateRange('7d');
            }}>✕ Reset</button>
          )}
        </div>

        {/* ── Active filter chips ── */}
        {(search || userFilter || typeFilter !== 'all' || dateRange !== '7d') && (
          <div className="chatlog-chips">
            {dateRange !== '7d' && (
              <span className="chatlog-chip">
                {RANGE_OPTIONS.find(o => o.value === dateRange)?.label}
                <button onClick={() => setDateRange('7d')}>✕</button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="chatlog-chip chatlog-chip--type">
                {TYPE_OPTIONS.find(o => o.value === typeFilter)?.label}
                <button onClick={() => setTypeFilter('all')}>✕</button>
              </span>
            )}
            {userFilter && (
              <span className="chatlog-chip chatlog-chip--user">
                @{userFilter}
                <button onClick={() => setUserFilter('')}>✕</button>
              </span>
            )}
            {search && (
              <span className="chatlog-chip chatlog-chip--search">
                "{search}"
                <button onClick={() => setSearch('')}>✕</button>
              </span>
            )}
          </div>
        )}

        {/* ── Message list ── */}
        <div className="chatlog-body" ref={listRef}>
          {filtered.length === 0 && (
            <div className="chatlog-empty">No messages match the current filters.</div>
          )}

          {groupByUser && grouped ? (
            grouped.map(([uname, msgs]) => (
              <div key={uname} className="chatlog-group">
                <div className="chatlog-group-header">
                  <span className="chatlog-group-name">@{uname}</span>
                  <span className="chatlog-group-count">{msgs.length} message{msgs.length !== 1 ? 's' : ''}</span>
                  <button
                    className="chatlog-btn chatlog-btn--ghost chatlog-btn--xs"
                    onClick={() => { setGroupByUser(false); setUserFilter(uname); }}
                  >View only</button>
                </div>
                <div className="chatlog-group-msgs">
                  {msgs.slice(0, 5).map((m, i) => (
                    <div key={m.id || i} className={`chatlog-row chatlog-row--compact${m.filtered ? ' chatlog-row--blocked' : ''}${m.shadowMuted ? ' chatlog-row--shadow' : ''}`}>
                      <span className="chatlog-row-time">{fmtFull(m.timestamp)}</span>
                      <span className="chatlog-row-text">{m.text}</span>
                      {m.filtered    && <span className="chatlog-tag chatlog-tag--blocked">BLOCKED</span>}
                      {m.shadowMuted && <span className="chatlog-tag chatlog-tag--shadow">SHADOW</span>}
                    </div>
                  ))}
                  {msgs.length > 5 && (
                    <button
                      className="chatlog-show-more-user"
                      onClick={() => { setGroupByUser(false); setUserFilter(uname); }}
                    >+ {msgs.length - 5} more — click to view all</button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <>
              {renderMessages(paginated)}
              {hasMore && (
                <button className="chatlog-load-more" onClick={() => setPage(p => p + 1)}>
                  Load more ({filtered.length - paginated.length} remaining)
                </button>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}
