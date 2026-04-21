import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './LotteryPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// Format ms into d h m s
function fmtCountdown(ms) {
  if (ms <= 0) return { h: '00', m: '00', s: '00', total: 0 };
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(sec).padStart(2, '0'),
    total: ms,
  };
}

function WinModal({ draw, myTickets, onClose }) {
  const isWinner = myTickets?.some(t => t.ticketId === draw?.winner?.ticketId);
  return (
    <div className="lt-modal-backdrop" onClick={onClose}>
      <div className="lt-modal" onClick={e => e.stopPropagation()}>
        {isWinner ? (
          <>
            <div className="lt-modal-emoji">🎉</div>
            <div className="lt-modal-title lt-modal-title--win">YOU WON!</div>
            <div className="lt-modal-prize">${draw.jackpot?.toLocaleString()}</div>
            <div className="lt-modal-sub">Winning ticket: #{draw.winner?.ticketId}</div>
          </>
        ) : draw?.winner ? (
          <>
            <div className="lt-modal-emoji">🏆</div>
            <div className="lt-modal-title">Draw Complete!</div>
            <div className="lt-modal-winner">Winner: <strong>{draw.winner.username}</strong></div>
            <div className="lt-modal-prize lt-modal-prize--other">${draw.jackpot?.toLocaleString()}</div>
            {myTickets?.length > 0 && <div className="lt-modal-sub">Better luck tomorrow! 🍀</div>}
          </>
        ) : (
          <>
            <div className="lt-modal-emoji">😔</div>
            <div className="lt-modal-title">No Winner Today</div>
            <div className="lt-modal-sub">No tickets were sold — jackpot carries over!</div>
          </>
        )}
        <button className="lt-modal-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function LotteryPage() {
  const { user, token } = useAuth();
  const [status,   setStatus]   = useState(null);
  const [myTickets, setMy]      = useState([]);
  const [balance,  setBalance]  = useState(getBalance);
  const [buying,   setBuying]   = useState(false);
  const [msg,      setMsg]      = useState('');
  const [cd,       setCd]       = useState(null);
  const [drawAnim, setDrawAnim] = useState(null); // draw result modal
  const [newTicket, setNewTicket] = useState(null); // just-bought ticket for animation
  const socketRef = useRef(null);

  const load = useCallback(async () => {
    const r = await fetch(`${SERVER_URL}/api/lottery`);
    const d = await r.json();
    if (d.ok) setStatus(d);

    if (user && token) {
      const r2 = await fetch(`${SERVER_URL}/api/lottery/my-tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d2 = await r2.json();
      if (d2.ok) setMy(d2.tickets || []);
    }
    setBalance(getBalance());
  }, [user, token]);

  useEffect(() => { load(); }, [load]);

  // Countdown ticker
  useEffect(() => {
    if (!status?.nextDrawAt) return;
    function tick() {
      setCd(fmtCountdown(status.nextDrawAt - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status?.nextDrawAt]);

  // Socket listener for live draw results
  useEffect(() => {
    const sock = window.__gameSocket;
    if (!sock) return;
    function onDraw(data) {
      setDrawAnim(data);
      load();
    }
    sock.on('lotteryDraw', onDraw);
    return () => sock.off('lotteryDraw', onDraw);
  }, [load]);

  // Sync balance when balanceReset fires
  useEffect(() => {
    const sock = window.__gameSocket;
    if (!sock || !user) return;
    function onBalance(data) {
      if (data.username === user.username) {
        setBalanceFromServer(data.balance);
        setBalance(data.balance);
      }
    }
    sock.on('balanceReset', onBalance);
    return () => sock.off('balanceReset', onBalance);
  }, [user]);

  async function buy() {
    if (!user) return setMsg('Log in to buy tickets');
    if (balance < (status?.ticketPrice || 500)) return setMsg(`You need $${(status?.ticketPrice || 500).toLocaleString()} to buy a ticket`);
    setBuying(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/lottery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setMsg(`🎟️ Lucky number ${d.ticketNum}! Ticket #${d.ticketId} purchased! Your odds: ~${d.odds}%`);
        setNewTicket(d);
        setTimeout(() => setNewTicket(null), 3000);
        load();
      } else {
        setMsg(d.error || 'Failed to buy ticket');
      }
    } finally { setBuying(false); }
  }

  const myCount = myTickets.length;
  const canBuy  = user && status && !status.drawn && myCount < (status?.maxTickets || 5) && balance >= (status?.ticketPrice || 500);
  const odds    = status?.tickets > 0 ? ((myCount / status.tickets) * 100).toFixed(1) : null;

  return (
    <div className="lt-page">
      {drawAnim && (
        <WinModal draw={drawAnim} myTickets={myTickets} onClose={() => setDrawAnim(null)} />
      )}

      <div className="lt-hero">
        <div className="lt-hero-icon">🎟️</div>
        <div>
          <h1 className="lt-hero-title">Daily Lottery</h1>
          <p className="lt-hero-sub">One winner every day at noon Pacific — jackpot grows with every ticket sold</p>
        </div>
      </div>

      {/* Countdown */}
      {cd && !status?.drawn && (
        <div className="lt-countdown-bar">
          <div className="lt-cd-label">Next draw in</div>
          <div className="lt-cd-blocks">
            <div className="lt-cd-block"><span>{cd.h}</span><label>hr</label></div>
            <div className="lt-cd-sep">:</div>
            <div className="lt-cd-block"><span>{cd.m}</span><label>min</label></div>
            <div className="lt-cd-sep">:</div>
            <div className="lt-cd-block"><span>{cd.s}</span><label>sec</label></div>
          </div>
        </div>
      )}

      {status && (
        <>
          {/* Jackpot */}
          <div className={`lt-jackpot ${status.drawn ? 'lt-jackpot--drawn' : ''}`}>
            <div className="lt-jackpot-label">{status.drawn ? "TODAY'S JACKPOT (DRAWN)" : "TODAY'S JACKPOT"}</div>
            <div className="lt-jackpot-amount">${status.jackpot.toLocaleString()}</div>
            <div className="lt-jackpot-meta">
              {status.tickets} ticket{status.tickets !== 1 ? 's' : ''} sold
              {status.tickets > 0 && ` · ${status.participants?.length || 1} player${(status.participants?.length || 1) !== 1 ? 's' : ''}`}
            </div>
          </div>

          {/* Winner banner */}
          {status.drawn && status.winner && (
            <div className="lt-winner-banner">
              <div className="lt-winner-crown">🏆</div>
              <div>
                <div className="lt-winner-name">{status.winner.username}</div>
                <div className="lt-winner-prize">won <strong>${status.winner.jackpot?.toLocaleString()}</strong> · ticket #{status.winner.ticketId}</div>
              </div>
            </div>
          )}
          {status.drawn && !status.winner && (
            <div className="lt-no-winner">😔 No tickets sold today — jackpot carries over to tomorrow!</div>
          )}

          {/* Buy section */}
          {!status.drawn && (
            <div className="lt-buy-card">
              <div className="lt-buy-header">
                <div>
                  <div className="lt-buy-title">🎟️ Buy a Ticket</div>
                  <div className="lt-buy-info">
                    <span>${(status.ticketPrice || 500).toLocaleString()} per ticket</span>
                    <span>Max {status.maxTickets}/day</span>
                    <span>Your balance: <strong style={{ color: balance >= (status.ticketPrice||500) ? '#22c55e' : '#ef4444' }}>${balance.toLocaleString()}</strong></span>
                  </div>
                </div>
                {myCount > 0 && (
                  <div className="lt-odds-badge">
                    <div className="lt-odds-pct">~{odds}%</div>
                    <div className="lt-odds-label">win chance</div>
                  </div>
                )}
              </div>

              {msg && <div className={`lt-msg ${msg.startsWith('🎟️') ? 'lt-msg--ok' : 'lt-msg--err'}`}>{msg}</div>}

              <button
                className="lt-btn"
                onClick={buy}
                disabled={buying || !canBuy}
              >
                {buying ? '⏳ Buying…'
                  : !user ? '🔒 Log in to buy'
                  : balance < (status?.ticketPrice || 500) ? `💸 Need $${(status?.ticketPrice||500).toLocaleString()} to buy`
                  : myCount >= (status?.maxTickets || 5) ? `✓ Max ${status.maxTickets} tickets reached`
                  : `🎟️ Buy Ticket — $${(status.ticketPrice || 500).toLocaleString()}`}
              </button>

              {/* New ticket animation */}
              {newTicket && (
                <div className="lt-new-ticket">
                  <div className="lt-new-ticket-inner">
                    <div className="lt-nt-label">Your lucky number</div>
                    <div className="lt-nt-num">{newTicket.ticketNum}</div>
                    <div className="lt-nt-id">#{newTicket.ticketId}</div>
                  </div>
                </div>
              )}

              {/* My tickets */}
              {user && myTickets.length > 0 && (
                <div className="lt-my-tickets">
                  <div className="lt-my-tickets-title">Your tickets today ({myCount}/{status.maxTickets})</div>
                  <div className="lt-ticket-row">
                    {myTickets.map(t => (
                      <div key={t.ticketId} className="lt-ticket">
                        <div className="lt-ticket-num">{t.ticketNum || '????'}</div>
                        <div className="lt-ticket-id">#{t.ticketId}</div>
                      </div>
                    ))}
                    {Array.from({ length: (status.maxTickets || 5) - myCount }).map((_, i) => (
                      <div key={i} className="lt-ticket lt-ticket--empty">
                        <div className="lt-ticket-num">?</div>
                        <div className="lt-ticket-id">empty</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current participants */}
          {!status.drawn && status.participants?.length > 0 && (
            <div className="lt-participants">
              <div className="lt-part-title">🎯 Today's Players</div>
              <div className="lt-part-list">
                {status.participants.map((p, i) => (
                  <div key={p.username} className={`lt-part-row ${p.username === user?.username ? 'lt-part-row--me' : ''}`}>
                    <span className="lt-part-rank">#{i + 1}</span>
                    <span className="lt-part-name">{p.username}</span>
                    <span className="lt-part-tickets">{p.count} ticket{p.count !== 1 ? 's' : ''}</span>
                    <span className="lt-part-odds">
                      {((p.count / status.tickets) * 100).toFixed(1)}% odds
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {status.history?.length > 0 && (
            <div className="lt-history">
              <div className="lt-history-title">📜 Recent Draws</div>
              {status.history.map((h, i) => (
                <div key={i} className="lt-history-row">
                  <span className="lt-history-day">{h.day}</span>
                  {h.winner ? (
                    <>
                      <span className="lt-history-winner">🏆 {h.winner.username}</span>
                      <span className="lt-history-prize">+${h.jackpot?.toLocaleString()}</span>
                      <span className="lt-history-count">{h.tickets} tickets</span>
                    </>
                  ) : (
                    <span className="lt-history-no-win">{h.note || 'No winner'}</span>
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
