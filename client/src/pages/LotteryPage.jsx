import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './LotteryPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function LotteryPage() {
  const { user, token } = useAuth();
  const [status, setStatus]   = useState(null);
  const [myTickets, setMy]    = useState([]);
  const [buying, setBuying]   = useState(false);
  const [msg, setMsg]         = useState('');

  async function load() {
    const r = await fetch(`${SERVER_URL}/api/lottery`);
    const d = await r.json();
    if (d.ok) setStatus(d);

    if (user) {
      const r2 = await fetch(`${SERVER_URL}/api/lottery/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d2 = await r2.json();
      if (d2.ok) setMy(d2.tickets);
    }
  }

  useEffect(() => { load(); }, [user]);

  async function buy() {
    if (!user) return setMsg('Log in to buy tickets');
    setBuying(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/lottery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) { setMsg(`🎟️ Ticket #${d.ticketId} purchased!`); load(); }
      else setMsg(d.error || 'Failed to buy ticket');
    } finally { setBuying(false); }
  }

  const myCount = myTickets.length;
  const canBuy  = user && status && !status.drawn && myCount < (status?.maxTickets || 10);

  return (
    <div className="lt-page">
      <div className="lt-hero">
        <div className="lt-hero-icon">🎰</div>
        <div>
          <h1 className="lt-hero-title">Weekly Lottery</h1>
          <p className="lt-hero-sub">Buy tickets — one lucky winner takes the jackpot every Sunday</p>
        </div>
      </div>

      {status && (
        <>
          {/* Jackpot display */}
          <div className="lt-jackpot">
            <div className="lt-jackpot-label">THIS WEEK'S JACKPOT</div>
            <div className="lt-jackpot-amount">${status.jackpot.toLocaleString()}</div>
            <div className="lt-jackpot-meta">
              {status.tickets} ticket{status.tickets !== 1 ? 's' : ''} sold · Draw: {status.drawDate}
            </div>
          </div>

          {/* Already drawn */}
          {status.drawn && status.winner && (
            <div className="lt-drawn-banner">
              🎉 This week's winner: <strong>{status.winner.username}</strong> won ${status.winner.jackpot?.toLocaleString()}!
            </div>
          )}
          {status.drawn && !status.winner && (
            <div className="lt-drawn-banner lt-drawn-banner--no-win">
              No tickets were sold this week — no winner drawn.
            </div>
          )}

          {/* Buy area */}
          {!status.drawn && (
            <div className="lt-buy-area">
              <div className="lt-ticket-info">
                <span>Price per ticket: <strong>${(status.ticketPrice || 500).toLocaleString()}</strong></span>
                <span>Max per player: <strong>{status.maxTickets}</strong></span>
                {user && <span>Your tickets: <strong className="lt-my-count">{myCount}</strong></span>}
              </div>
              {msg && <div className={`lt-msg ${msg.startsWith('🎟️') ? 'lt-msg--ok' : 'lt-msg--err'}`}>{msg}</div>}
              <button
                className="lt-btn"
                onClick={buy}
                disabled={buying || !canBuy}
              >
                {buying ? 'Buying…' : canBuy ? `🎟️ Buy Ticket ($${(status.ticketPrice || 500).toLocaleString()})` : myCount >= (status?.maxTickets || 10) ? 'Max tickets reached' : 'Log in to buy'}
              </button>
              {user && myTickets.length > 0 && (
                <div className="lt-my-tickets">
                  <div className="lt-my-tickets-title">Your Tickets This Week</div>
                  <div className="lt-ticket-list">
                    {myTickets.map(t => (
                      <div key={t.ticketId} className="lt-ticket">
                        🎟️ #{t.ticketId}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History */}
          {status.history?.length > 0 && (
            <div className="lt-history">
              <h3 className="lt-history-title">Past Winners</h3>
              {status.history.map((h, i) => (
                <div key={i} className="lt-history-row">
                  <span className="lt-history-week">Week of {h.week}</span>
                  {h.winner ? (
                    <>
                      <span className="lt-history-winner">🏆 {h.winner.username}</span>
                      <span className="lt-history-prize" style={{ color: '#22c55e' }}>
                        +${h.jackpot?.toLocaleString()}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#475569' }}>No winner (no tickets)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!status && <div className="lt-loading">Loading…</div>}
    </div>
  );
}
