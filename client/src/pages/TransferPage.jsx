import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './TransferPage.css';

export default function TransferPage() {
  const { isLoggedIn, balance, transfer } = useAuth();
  const navigate = useNavigate();

  const TRANSFER_CAP = 100000;
  const [toUsername, setToUsername] = useState('');
  const [amount, setAmount]         = useState('');
  const [status, setStatus]         = useState(null); // null | { ok, msg }
  const [loading, setLoading]       = useState(false);

  if (!isLoggedIn) {
    return (
      <div className="transfer-page">
        <div className="transfer-card">
          <div className="transfer-logo">💸 Send Money</div>
          <p className="transfer-note">You must be signed in to send money.</p>
          <Link to="/auth" className="transfer-submit">Sign In</Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const amt = parseInt(amount, 10);
    if (!toUsername.trim()) return setStatus({ ok: false, msg: 'Enter a recipient username.' });
    if (!amt || amt < 1) return setStatus({ ok: false, msg: 'Amount must be at least $1.' });
    if (amt > TRANSFER_CAP) return setStatus({ ok: false, msg: `Maximum transfer is $${TRANSFER_CAP.toLocaleString()} per transaction.` });
    if (amt > balance) return setStatus({ ok: false, msg: `Insufficient balance ($${balance.toLocaleString()}).` });

    setLoading(true);
    setStatus(null);
    const result = await transfer(toUsername.trim(), amt);
    setLoading(false);

    if (result.ok) {
      setStatus({ ok: true, msg: `✅ Sent $${amt.toLocaleString()} to @${toUsername.trim().toLowerCase()}!` });
      setToUsername('');
      setAmount('');
    } else {
      setStatus({ ok: false, msg: result.error || 'Transfer failed.' });
    }
  }

  return (
    <div className="transfer-page">
      <div className="transfer-card">
        <div className="transfer-logo">💸 Send Money</div>
        <div className="transfer-balance">Your balance: <span>${balance.toLocaleString()}</span></div>

        <form className="transfer-form" onSubmit={handleSubmit}>
          <label className="transfer-label">
            Recipient username
            <input
              className="transfer-input"
              type="text"
              placeholder="e.g. jasper"
              value={toUsername}
              onChange={e => setToUsername(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="transfer-label">
            Amount ($)
            <input
              className="transfer-input"
              type="number"
              placeholder="100"
              min={1}
              max={Math.min(balance, TRANSFER_CAP)}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <span className="transfer-cap-hint">Max $100,000 per transfer</span>
          </label>

          {status && (
            <div className={`transfer-status ${status.ok ? 'transfer-status--ok' : 'transfer-status--err'}`}>
              {status.msg}
            </div>
          )}

          <button className="transfer-submit" type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send Money'}
          </button>
        </form>

        <Link to="/" className="transfer-back">← Back to Game Vault</Link>
      </div>
    </div>
  );
}
