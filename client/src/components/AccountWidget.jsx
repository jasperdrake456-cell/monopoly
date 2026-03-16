import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AccountWidget.css';

export default function AccountWidget() {
  const { user, balance, isLoggedIn, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (!isLoggedIn) {
    return (
      <Link to="/auth" className="acw-signin-btn">
        👤 Sign In
      </Link>
    );
  }

  return (
    <div className="acw-wrap" ref={ref}>
      <button className="acw-trigger" onClick={() => setOpen(o => !o)}>
        <span className="acw-avatar">{user.displayName[0].toUpperCase()}</span>
        <span className="acw-name">{user.displayName}</span>
        <span className="acw-bal">${balance.toLocaleString()}</span>
        <span className="acw-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="acw-dropdown">
          <div className="acw-header">
            <div className="acw-header-name">{user.displayName}</div>
            <div className="acw-header-user">@{user.username}</div>
            <div className="acw-header-bal">💰 ${balance.toLocaleString()}</div>
          </div>
          <div className="acw-divider" />
          <Link to="/transfer" className="acw-item" onClick={() => setOpen(false)}>
            💸 Send Money
          </Link>
          <div className="acw-divider" />
          <button className="acw-item acw-item--danger" onClick={async () => { await logout(); setOpen(false); navigate('/'); }}>
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
