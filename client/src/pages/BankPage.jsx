import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './BankPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

export default function BankPage() {
  const { token, isLoggedIn } = useAuth();
  const [positions, setPositions] = useState([]);
  const [tiers, setTiers] = useState({});
  const [balance, setBalance] = useState(getBalance());
  const [selTier, setSelTier] = useState('instant');
  const [amount, setAmount] = useState(10000);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/bank/positions`, { headers: { Authorization: `Bearer ${token}` }});
      const d = await r.json();
      if (d.ok) { setPositions(d.positions); setTiers(d.tiers); }
    } catch {}
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { refresh(); setBalance(getBalance()); }, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  async function deposit() {
    if (loading) return;
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/bank/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier: selTier, amount: Math.floor(amount) }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        setPositions(d.positions);
        setMsg(`✅ Deposited ${fmt(amount)} into ${tiers[selTier]?.name}`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
    setLoading(false);
  }

  async function withdraw(positionId) {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/bank/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ positionId }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setBalance(d.balance);
        setPositions(d.positions);
        setMsg(`✅ Withdrew ${fmt(d.payout)}`);
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Connection error'); }
    setLoading(false);
  }

  if (!isLoggedIn) {
    return (
      <div className="bank-page">
        <div className="bank-card">
          <div className="bank-title">🏦 The Vault</div>
          <div style={{ color: '#aaa', textAlign: 'center' }}>Log in to deposit into the Vault.</div>
          <Link to="/" className="gv-btn gv-btn--ghost" style={{ alignSelf: 'center' }}>← Back</Link>
        </div>
      </div>
    );
  }

  const totalDeposited = positions.reduce((s, p) => s + p.principal + (p.accruedInterest || 0), 0);

  return (
    <div className="bank-page">
      <div className="bank-header">
        <Link to="/" className="bank-back">← Home</Link>
        <div className="bank-title">🏦 The Vault</div>
        <div className="bank-bal">Balance: <b>{fmt(balance)}</b></div>
      </div>

      <div className="bank-hero">
        <div className="bank-hero-label">TOTAL IN VAULT</div>
        <div className="bank-hero-amount">{fmt(totalDeposited)}</div>
        <div className="bank-hero-sub">Interest accrues every second. Hodl for bigger yields.</div>
      </div>

      <div className="bank-tier-grid">
        {Object.entries(tiers).map(([key, t]) => (
          <button
            key={key}
            className={`bank-tier ${selTier === key ? 'bank-tier--active' : ''}`}
            onClick={() => setSelTier(key)}>
            <div className="bank-tier-emoji">{t.emoji}</div>
            <div className="bank-tier-name">{t.name}</div>
            <div className="bank-tier-rate">{(t.dailyRate * 100).toFixed(2)}%/day</div>
            <div className="bank-tier-lock">
              {t.lockDays === 0 ? 'No lock' : `${t.lockDays}-day lock`}
            </div>
          </button>
        ))}
      </div>

      <div className="bank-deposit">
        <label className="bank-label">Deposit amount</label>
        <input className="gv-input" type="number" min={1000} step={1000}
          value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="bank-preset">
          {[10000, 50000, 100000, 500000].map(a => (
            <button key={a} className="bank-preset-btn" onClick={() => setAmount(a)}>{fmt(a)}</button>
          ))}
        </div>
        <button className="gv-btn gv-btn--gold" onClick={deposit} disabled={loading || amount < 1000}>
          {loading ? 'Working…' : `💰 Deposit ${fmt(amount)}`}
        </button>
        {msg && <div className="bank-msg">{msg}</div>}
      </div>

      <h2 className="bank-section-title">📦 Your Positions</h2>
      {positions.length === 0 ? (
        <div className="bank-empty">No positions yet. Deposit above to start earning.</div>
      ) : (
        <div className="bank-positions">
          {positions.map(p => {
            const tier = tiers[p.tier];
            const locked = Date.now() < p.unlocksAt;
            const waitMs = p.unlocksAt - Date.now();
            const waitDays = Math.ceil(waitMs / 86_400_000);
            const accrued = p.accruedInterest || 0;
            return (
              <div key={p.id} className={`bank-pos ${locked ? 'bank-pos--locked' : ''}`}>
                <div className="bank-pos-top">
                  <span className="bank-pos-emoji">{tier?.emoji || '💎'}</span>
                  <span className="bank-pos-name">{tier?.name || p.tier}</span>
                </div>
                <div className="bank-pos-rows">
                  <div className="bank-pos-row"><span>Principal</span><b>{fmt(p.principal)}</b></div>
                  <div className="bank-pos-row"><span>Interest accrued</span><b className="bank-pos-earned">+{fmt(accrued)}</b></div>
                  <div className="bank-pos-row"><span>Total</span><b>{fmt(p.principal + accrued)}</b></div>
                  <div className="bank-pos-row">
                    <span>Status</span>
                    <b className={locked ? 'bank-pos-locked' : 'bank-pos-free'}>
                      {locked ? `🔒 Locked (${waitDays}d)` : '🔓 Unlocked'}
                    </b>
                  </div>
                </div>
                <button
                  className={`gv-btn ${locked ? 'gv-btn--ghost' : 'gv-btn--green'}`}
                  disabled={locked || loading}
                  onClick={() => withdraw(p.id)}>
                  {locked ? 'Still Locked' : '💸 Withdraw'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
