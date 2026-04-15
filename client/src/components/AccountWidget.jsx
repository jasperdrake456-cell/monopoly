import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useChampion } from '../hooks/useChampion';
import { setBalanceFromServer } from '../utils/casinoBalance';
import './AccountWidget.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function AccountWidget() {
  const { user, balance, isLoggedIn, logout, refreshBalance } = useAuth();
  const { champion } = useChampion();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const isChampion = isLoggedIn && user && champion?.username === user.username?.toLowerCase();

  const [redeemMode, setRedeemMode] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemMsg,  setRedeemMsg]  = useState('');
  const [redeeming,  setRedeeming]  = useState(false);

  // Close on outside click
  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setRedeemMode(false); } }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function handleRedeem() {
    if (!redeemCode.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemMsg('');
    try {
      const token = localStorage.getItem('authToken');
      const res   = await fetch(`${SERVER_URL}/api/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        // Use server-authoritative balance so stale local cache can't wipe the bonus
        setBalanceFromServer(data.newBalance);
        if (refreshBalance) refreshBalance(data.newBalance);
        setRedeemMsg(`🎉 +$${data.amount.toLocaleString()} added to your balance!`);
        setRedeemCode('');
      } else {
        setRedeemMsg(`❌ ${data.error || 'Invalid code'}`);
      }
    } catch {
      setRedeemMsg('❌ Network error');
    }
    setRedeeming(false);
  }

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
        <span className="acw-avatar">{isChampion ? '👑' : user.displayName[0].toUpperCase()}</span>
        <span className="acw-name" style={isChampion ? { color: '#FFD700' } : {}}>
          {isChampion && <span style={{ marginRight: 3 }}>👑</span>}{user.displayName}
        </span>
        <span className="acw-bal">${balance.toLocaleString()}</span>
        <span className="acw-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="acw-dropdown">
          <div className="acw-header">
            <div className="acw-header-name" style={isChampion ? { color: '#FFD700' } : {}}>
            {isChampion && '👑 '}{user.displayName}
          </div>
            <div className="acw-header-user">@{user.username}</div>
            <div className="acw-header-bal">💰 ${balance.toLocaleString()}</div>
          </div>
          <div className="acw-divider" />
          <Link to="/transfer" className="acw-item" onClick={() => setOpen(false)}>
            💸 Send Money
          </Link>
          <button className="acw-item" onClick={() => { setRedeemMode(m => !m); setRedeemMsg(''); }}>
            🎁 Redeem Code
          </button>
          {redeemMode && (
            <div className="acw-redeem">
              <input
                className="acw-redeem-input"
                placeholder="Enter code…"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleRedeem()}
                autoFocus
              />
              <button className="acw-redeem-btn" onClick={handleRedeem} disabled={redeeming}>
                {redeeming ? '…' : 'Go'}
              </button>
              {redeemMsg && <div className={`acw-redeem-msg ${redeemMsg.startsWith('🎉') ? 'acw-redeem-msg--ok' : 'acw-redeem-msg--err'}`}>{redeemMsg}</div>}
            </div>
          )}
          <div className="acw-divider" />
          <button className="acw-item acw-item--danger" onClick={async () => { await logout(); setOpen(false); navigate('/'); }}>
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
