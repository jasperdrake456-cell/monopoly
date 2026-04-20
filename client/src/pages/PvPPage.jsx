import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, subtractBalance, addBalance } from '../utils/casinoBalance';
import './PvPPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const MIN_BET = 500;
const MAX_BET = 5_000_000;

function timeSince(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function PvPPage() {
  const { user, token } = useAuth();
  const [open,    setOpen]    = useState([]);
  const [results, setResults] = useState([]);
  const [myChals, setMyChals] = useState([]);
  const [balance, setBalance] = useState(getBalance);
  const [amount,  setAmount]  = useState(1000);
  const [opp,     setOpp]     = useState('');
  const [creating, setCreating] = useState(false);
  const [msg,     setMsg]     = useState('');
  const [flip,    setFlip]    = useState(null); // { winner, loser, flip, amount }
  const pollRef = useRef(null);

  async function load() {
    const r1 = await fetch(`${SERVER_URL}/api/pvp/challenges`);
    const d1 = await r1.json();
    if (d1.ok) {
      setOpen(d1.challenges || []);
      setResults(d1.results || []);
    }

    if (user && token) {
      const r3 = await fetch(`${SERVER_URL}/api/pvp/my-challenges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d3 = await r3.json();
      if (d3.ok) setMyChals(d3.challenges);
    }
  }

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 8000);
    return () => clearInterval(pollRef.current);
  }, [user, token]);

  async function createChallenge() {
    if (!user) return setMsg('Log in first');
    const amt = parseInt(amount);
    if (isNaN(amt) || amt < MIN_BET) return setMsg(`Minimum is $${MIN_BET.toLocaleString()}`);
    if (amt > MAX_BET) return setMsg(`Maximum is $${MAX_BET.toLocaleString()}`);
    if (amt > getBalance()) return setMsg('Insufficient balance');

    setCreating(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/pvp/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amt, opponent: opp.trim() || undefined }),
      });
      const d = await r.json();
      if (d.ok) {
        subtractBalance(amt);
        setBalance(getBalance());
        setMsg('Challenge created!');
        setOpp('');
        load();
      } else { setMsg(d.error || 'Failed'); }
    } finally { setCreating(false); }
  }

  async function acceptChallenge(id, amount) {
    if (!user) return setMsg('Log in first');
    if (amount > getBalance()) return setMsg('Insufficient balance');
    setMsg('');
    const r = await fetch(`${SERVER_URL}/api/pvp/accept/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.ok) {
      subtractBalance(amount);
      if (d.winner === user.username) {
        addBalance(amount * 2);
        setMsg(`🎉 You won! Coin landed ${d.flip} — +$${(amount).toLocaleString()}`);
      } else {
        setMsg(`😔 You lost… Coin landed ${d.flip} — ${d.winner} wins`);
      }
      setBalance(getBalance());
      setFlip({ ...d, amount });
      load();
    } else { setMsg(d.error || 'Failed to accept'); }
  }

  async function cancelChallenge(id, amount) {
    const r = await fetch(`${SERVER_URL}/api/pvp/challenge/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (d.ok) {
      addBalance(amount);
      setBalance(getBalance());
      setMsg('Challenge cancelled — balance refunded');
      load();
    } else { setMsg(d.error || 'Failed to cancel'); }
  }

  const myOpenChallenge = myChals.find(c => c.status === 'open' && c.challenger === user?.username);

  return (
    <div className="pvp-page">
      <div className="pvp-hero">
        <div className="pvp-hero-icon">🪙</div>
        <div>
          <h1 className="pvp-hero-title">PvP Coin Flip</h1>
          <p className="pvp-hero-sub">Challenge another player — winner takes all</p>
        </div>
      </div>

      <div className="pvp-balance">💰 Balance: <strong>${balance.toLocaleString()}</strong></div>

      {/* Flip result overlay */}
      {flip && (
        <div className={`pvp-flip-result ${flip.winner === user?.username ? 'pvp-flip-result--win' : 'pvp-flip-result--lose'}`}>
          <div className="pvp-flip-coin">{flip.flip === 'heads' ? '🪙' : '🟡'}</div>
          <div className="pvp-flip-verdict">{flip.winner === user?.username ? '🎉 YOU WIN!' : '💀 YOU LOSE'}</div>
          <div className="pvp-flip-detail">
            Coin: <strong>{flip.flip}</strong> · {flip.winner} won ${flip.amount?.toLocaleString()}
          </div>
          <button className="pvp-dismiss" onClick={() => setFlip(null)}>Dismiss</button>
        </div>
      )}

      {msg && <div className={`pvp-msg ${msg.includes('won') || msg.includes('created') || msg.includes('refunded') ? 'pvp-msg--ok' : 'pvp-msg--err'}`}>{msg}</div>}

      {/* Create challenge */}
      <div className="pvp-create-card">
        <h3 className="pvp-section-title">🆕 Create Challenge</h3>
        <div className="pvp-create-row">
          <div className="pvp-input-group">
            <label>Wager Amount</label>
            <input
              type="number"
              min={MIN_BET}
              max={MAX_BET}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div className="pvp-input-group">
            <label>Target Player (optional)</label>
            <input
              type="text"
              placeholder="Leave blank for open challenge"
              value={opp}
              onChange={e => setOpp(e.target.value)}
            />
          </div>
        </div>
        <div className="pvp-quick-bets">
          {[500, 1000, 5000, 10000, 50000].filter(v => v <= balance).map(v => (
            <button key={v} className={`pvp-qb ${amount == v ? 'active' : ''}`} onClick={() => setAmount(v)}>${v.toLocaleString()}</button>
          ))}
        </div>
        {myOpenChallenge ? (
          <div className="pvp-has-open">You already have an open challenge. Cancel it first to create a new one.</div>
        ) : (
          <button className="pvp-btn pvp-btn--create" onClick={createChallenge} disabled={creating}>
            {creating ? 'Creating…' : '🪙 Create Challenge'}
          </button>
        )}
      </div>

      {/* My active challenge */}
      {myOpenChallenge && (
        <div className="pvp-my-challenge">
          <div className="pvp-mc-label">YOUR ACTIVE CHALLENGE</div>
          <div className="pvp-mc-info">
            <span>${myOpenChallenge.amount.toLocaleString()}</span>
            {myOpenChallenge.opponent ? <span>vs {myOpenChallenge.opponent}</span> : <span>Open to anyone</span>}
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{timeSince(myOpenChallenge.createdAt)}</span>
          </div>
          <button className="pvp-btn pvp-btn--cancel" onClick={() => cancelChallenge(myOpenChallenge.id, myOpenChallenge.amount)}>
            ✕ Cancel &amp; Refund
          </button>
        </div>
      )}

      {/* Open challenges */}
      <div className="pvp-section">
        <h3 className="pvp-section-title">⚡ Open Challenges</h3>
        {open.length === 0 && <div className="pvp-empty">No open challenges — be the first!</div>}
        {open.map(c => {
          const isOwn    = c.challenger === user?.username;
          const targeted = c.opponent && c.opponent !== user?.username;
          return (
            <div key={c.id} className={`pvp-challenge-row ${isOwn ? 'pvp-challenge-row--own' : ''}`}>
              <div className="pvp-chal-meta">
                <span className="pvp-chal-from">
                  <Link to={`/profile/${c.challenger}`}>{c.challenger}</Link>
                </span>
                <span className="pvp-chal-amount">${c.amount.toLocaleString()}</span>
                {c.opponent && <span className="pvp-chal-target">→ {c.opponent}</span>}
                <span className="pvp-chal-time">{timeSince(c.createdAt)}</span>
              </div>
              {!isOwn && !targeted && user && (
                <button
                  className="pvp-btn pvp-btn--accept"
                  onClick={() => acceptChallenge(c.id, c.amount)}
                  disabled={c.amount > balance}
                >
                  {c.amount > balance ? 'Insufficient funds' : '🤝 Accept'}
                </button>
              )}
              {targeted && !isOwn && (
                <span className="pvp-targeted">Targeted challenge</span>
              )}
              {c.opponent === user?.username && (
                <button
                  className="pvp-btn pvp-btn--accept"
                  onClick={() => acceptChallenge(c.id, c.amount)}
                  disabled={c.amount > balance}
                >
                  {c.amount > balance ? 'Insufficient funds' : '🤝 Accept Your Challenge'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent results */}
      {results.length > 0 && (
        <div className="pvp-section">
          <h3 className="pvp-section-title">📜 Recent Results</h3>
          {results.slice(0, 10).map(c => (
            <div key={c.id} className="pvp-result-row">
              <span className="pvp-result-flip">{c.flip === 'heads' ? '🪙' : '🟡'} {c.flip}</span>
              <span>
                <strong style={{ color: '#22c55e' }}>{c.winner}</strong>
                <span style={{ color: '#475569' }}> beat </span>
                <span style={{ color: '#ef4444' }}>{c.loser}</span>
              </span>
              <span style={{ color: '#f59e0b', fontWeight: 700 }}>${c.amount?.toLocaleString()}</span>
              <span style={{ color: '#475569', fontSize: '0.78rem' }}>{timeSince(c.settledAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
