import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { setBalanceFromServer } from '../utils/casinoBalance';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function GiftButton() {
  const { token, isLoggedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState(5000);
  const [message, setMessage] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoggedIn) return null;

  async function send() {
    if (loading) return;
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipient, amount: Math.floor(amount), message }),
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg(`✅ Sent $${d.received.toLocaleString()} to ${recipient} (${d.tax > 0 ? `$${d.tax} tax` : 'no tax'})`);
        setRecipient(''); setMessage('');
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setLoading(false);
  }

  return (
    <>
      <button
        className="home-trivia-btn"
        onClick={() => setOpen(true)}
        style={{ background: 'rgba(236,72,153,0.12)', borderColor: 'rgba(236,72,153,0.45)', color: '#f9a8d4', fontWeight: 800 }}>
        🎁 Gift
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 20, backdropFilter: 'blur(8px)',
          }}>
          <div style={{
            background: 'var(--gv-grad-bg)',
            border: '1px solid rgba(236,72,153,0.35)',
            borderRadius: 16,
            padding: 24,
            width: '100%', maxWidth: 420,
            display: 'flex', flexDirection: 'column', gap: 12,
            boxShadow: 'var(--gv-shadow-lg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--gv-font-display)', fontSize: '1.3rem',
                background: 'linear-gradient(135deg, #ec4899, #f59e0b)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>🎁 Send Gift</h2>
              <button onClick={() => setOpen(false)} className="gv-btn gv-btn--ghost" style={{ padding: '4px 10px' }}>✖</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gv-text-dim)' }}>
              Send chips to another player. 5% tax applies.
            </div>
            <label style={{ fontSize: '0.78rem', color: 'var(--gv-text-mute)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Recipient username</label>
            <input className="gv-input" placeholder="username"
              value={recipient} onChange={e => setRecipient(e.target.value)} />
            <label style={{ fontSize: '0.78rem', color: 'var(--gv-text-mute)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Amount</label>
            <input className="gv-input" type="number" min={100} max={500000} step={100}
              value={amount} onChange={e => setAmount(e.target.value)} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1000, 5000, 25000, 100000].map(a => (
                <button key={a} className="gv-btn gv-btn--ghost" style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                  onClick={() => setAmount(a)}>${a.toLocaleString()}</button>
              ))}
            </div>
            <label style={{ fontSize: '0.78rem', color: 'var(--gv-text-mute)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Message (optional)</label>
            <input className="gv-input" maxLength={100} placeholder="Thanks for the help!"
              value={message} onChange={e => setMessage(e.target.value)} />
            <button className="gv-btn gv-btn--purple" onClick={send} disabled={loading || !recipient || amount < 100}>
              {loading ? 'Sending…' : `🎁 Send ${Math.floor(amount).toLocaleString()}`}
            </button>
            {msg && <div style={{ textAlign: 'center', color: 'var(--gv-text-dim)', fontSize: '0.88rem' }}>{msg}</div>}
          </div>
        </div>
      )}
    </>
  );
}
