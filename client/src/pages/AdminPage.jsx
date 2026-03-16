import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AdminPage.css';

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

  const [tab, setTab]           = useState('reports'); // 'reports' | 'users' | 'money'
  const [reports, setReports]   = useState([]);
  const [users, setUsers]       = useState([]);
  const [status, setStatus]     = useState('');
  const [giveTarget, setGiveTarget] = useState('');
  const [giveAmount, setGiveAmount] = useState('');
  const [editingBal, setEditingBal] = useState(null); // { username, value }

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

  useEffect(() => {
    if (tab === 'reports') loadReports();
    if (tab === 'users')   loadUsers();
  }, [tab, loadReports, loadUsers]);

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

  async function giveMoney() {
    const amt = parseInt(giveAmount, 10);
    if (!giveTarget || !amt || amt < 1) return setStatus('Enter a username and amount.');
    const d = await authFetch('/api/admin/give-money', token, {
      method: 'POST',
      body: JSON.stringify({ username: giveTarget.trim().toLowerCase(), amount: amt }),
    });
    setStatus(d.ok ? `Gave $${amt.toLocaleString()} to ${giveTarget}. New balance: $${d.balance?.toLocaleString()}` : d.error);
    setGiveTarget(''); setGiveAmount('');
  }

  if (!isAdmin) return null;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <Link to="/" className="admin-back">← Game Vault</Link>
        <div className="admin-title">🛡️ Admin Panel</div>
        <div className="admin-user">Logged in as <strong>jasper</strong></div>
      </div>

      <div className="admin-tabs">
        {[['reports','📋 Reports'],['users','👥 Users'],['money','💰 Give Money']].map(([id, label]) => (
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
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && (
        <div className="admin-section">
          <div className="admin-section-title">All Accounts ({users.length})</div>
          {users.length === 0 && <div className="admin-empty">No users found.</div>}
          <div className="admin-user-list">
            {users.sort((a, b) => b.balance - a.balance).map(u => (
              <div key={u.username} className="admin-user-row">
                <div className="admin-user-info">
                  <span className="admin-user-name">{u.displayName}</span>
                  <span className="admin-user-handle">@{u.username}</span>
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
                </div>
                {u.username !== 'jasper' && (
                  <button className="admin-btn admin-btn--danger" onClick={() => deleteUser(u.username)}>
                    Delete
                  </button>
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
    </div>
  );
}
