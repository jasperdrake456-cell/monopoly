import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, subtractBalance } from '../utils/casinoBalance';
import './SportsBetting.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function authFetch(path, token, options = {}) {
  return fetch(SERVER_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(r => r.json());
}

function fmtOdds(o) {
  if (o == null) return '—';
  return o > 0 ? `+${o}` : `${o}`;
}

function calcPayout(amount, odds) {
  if (!amount || !odds) return 0;
  const amt = parseFloat(amount) || 0;
  if (odds > 0) return Math.floor(amt + amt * (odds / 100));
  return Math.floor(amt + amt * (100 / Math.abs(odds)));
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtRelative(iso) {
  const diff = new Date(iso) - Date.now();
  if (diff < 0) return 'Live / In Progress';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `In ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)   return `In ${h}h ${m}m`;
  return `In ${m}m`;
}

// Group flat games array into sport tabs
function groupBySport(games) {
  const map = {};
  for (const g of games) {
    if (!map[g.sport]) map[g.sport] = { key: g.sport, name: g.sport, emoji: g.sportEmoji || '🏆', games: [] };
    map[g.sport].games.push(g);
  }
  return Object.values(map);
}

const STATUS_ICON  = { won: '✅', lost: '❌', push: '🔄', open: '⏳', void: '🚫', cancelled: '🚫' };
const STATUS_LABEL = { won: 'WON', lost: 'LOST', push: 'PUSH', open: 'OPEN', void: 'VOID', cancelled: 'VOID' };

export default function SportsBetting() {
  const { token } = useAuth();

  const [games,     setGames]     = useState([]);
  const [sports,    setSports]    = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [myBets,    setMyBets]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [slip,     setSlip]     = useState(null);
  const [betAmt,   setBetAmt]   = useState('');
  const [placing,  setPlacing]  = useState(false);
  const [slipMsg,  setSlipMsg]  = useState(null);

  const loadGames = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await authFetch('/api/sports/games', token);
      if (data.ok) {
        setGames(data.games || []);
        const grouped = groupBySport(data.games || []);
        setSports(grouped);
        if (!activeTab) setActiveTab(grouped[0]?.key || 'mybets');
      } else {
        setError(data.error || 'Failed to load games');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line

  const loadMyBets = useCallback(async () => {
    if (!token) return;
    const data = await authFetch('/api/sports/bets', token);
    if (data.ok) setMyBets(data.bets || []);
  }, [token]);

  useEffect(() => { loadGames(); loadMyBets(); }, [loadGames, loadMyBets]);
  useEffect(() => {
    const id = setInterval(() => { loadGames(); loadMyBets(); }, 60_000);
    return () => clearInterval(id);
  }, [loadGames, loadMyBets]);

  async function placeBet() {
    if (!slip) return;
    const amt = Math.floor(parseFloat(betAmt) || 0);
    if (amt < 100)          return setSlipMsg({ ok: false, text: 'Minimum bet is $100' });
    if (amt > 500_000)      return setSlipMsg({ ok: false, text: 'Max bet is $500,000' });
    if (amt > getBalance()) return setSlipMsg({ ok: false, text: 'Insufficient balance' });

    setPlacing(true);
    setSlipMsg(null);
    try {
      const data = await authFetch('/api/sports/bet', token, {
        method: 'POST',
        body: JSON.stringify({ gameId: slip.game.gameId, pick: slip.pick, odds: slip.odds, amount: amt }),
      });
      if (data.ok) {
        subtractBalance(amt);
        setSlipMsg({ ok: true, text: `Bet placed! Win $${(data.potentialPayout - amt).toLocaleString()}` });
        setBetAmt('');
        setTimeout(() => { setSlip(null); setSlipMsg(null); loadMyBets(); }, 2000);
      } else {
        setSlipMsg({ ok: false, text: data.error || 'Bet failed' });
      }
    } catch {
      setSlipMsg({ ok: false, text: 'Network error' });
    } finally {
      setPlacing(false);
    }
  }

  function selectPick(game, pick, pickOdds) {
    if (slip?.game?.gameId === game.gameId && slip?.pick === pick) {
      setSlip(null); setBetAmt(''); setSlipMsg(null);
    } else {
      setSlip({ game, pick, odds: pickOdds }); setBetAmt(''); setSlipMsg(null);
    }
  }

  const openCount     = myBets.filter(b => b.status === 'open').length;
  const currentGames  = sports.find(s => s.key === activeTab)?.games || [];

  return (
    <div className="sb-root">
      <div className="sb-header">
        <div className="sb-header-left">
          <span className="sb-logo">🏆</span>
          <div>
            <div className="sb-title">Sports Betting</div>
            <div className="sb-subtitle">Live games · Real payouts in casino coins</div>
          </div>
        </div>
        <div className="sb-balance">💰 ${getBalance().toLocaleString()}</div>
      </div>

      <div className="sb-tabs">
        {sports.map(s => (
          <button key={s.key} className={`sb-tab ${activeTab === s.key ? 'sb-tab--active' : ''}`}
            onClick={() => setActiveTab(s.key)}>
            {s.emoji} {s.name}
            {s.games.length > 0 && <span className="sb-tab-count">{s.games.length}</span>}
          </button>
        ))}
        <button className={`sb-tab ${activeTab === 'mybets' ? 'sb-tab--active' : ''}`}
          onClick={() => setActiveTab('mybets')}>
          📋 My Bets {openCount > 0 && <span className="sb-tab-count sb-tab-count--open">{openCount}</span>}
        </button>
      </div>

      <div className="sb-body">
        {loading && (
          <div className="sb-loading">
            <div className="sb-loading-spinner" />
            Loading games…
          </div>
        )}
        {!loading && error && <div className="sb-error">⚠️ {error}</div>}

        {!loading && !error && games.length === 0 && activeTab !== 'mybets' && (
          <div className="sb-empty">
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏟️</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>No games available yet</div>
            <div>The admin hasn't posted any games yet. Check back soon!</div>
          </div>
        )}

        {!loading && !error && activeTab !== 'mybets' && currentGames.length > 0 && (
          <div className="sb-games">
            {currentGames.map(game => {
              const selHome = slip?.game?.gameId === game.gameId && slip?.pick === game.homeTeam;
              const selAway = slip?.game?.gameId === game.gameId && slip?.pick === game.awayTeam;
              const selDraw = slip?.game?.gameId === game.gameId && slip?.pick === 'Draw';
              const alreadyBet = myBets.some(b => b.gameId === game.gameId && b.status === 'open');
              return (
                <div key={game.gameId} className={`sb-game-card ${alreadyBet ? 'sb-game-card--bet' : ''}`}>
                  <div className="sb-game-time">
                    {fmtTime(game.startTime)}
                    <span className="sb-game-countdown">{fmtRelative(game.startTime)}</span>
                  </div>
                  <div className="sb-game-matchup">
                    <div className="sb-game-team">{game.homeTeam}</div>
                    <div className="sb-game-vs">vs</div>
                    <div className="sb-game-team">{game.awayTeam}</div>
                  </div>
                  {alreadyBet && <div className="sb-already-bet">✓ Bet placed</div>}
                  <div className="sb-game-odds">
                    <button className={`sb-odds-btn ${selHome ? 'sb-odds-btn--selected' : ''}`}
                      onClick={() => !alreadyBet && selectPick(game, game.homeTeam, game.odds.home)}
                      disabled={alreadyBet}>
                      <span className="sb-odds-label">{game.homeTeam.split(' ').slice(-1)[0]}</span>
                      <span className="sb-odds-val">{fmtOdds(game.odds.home)}</span>
                    </button>
                    {game.odds.draw != null && (
                      <button className={`sb-odds-btn sb-odds-btn--draw ${selDraw ? 'sb-odds-btn--selected' : ''}`}
                        onClick={() => !alreadyBet && selectPick(game, 'Draw', game.odds.draw)}
                        disabled={alreadyBet}>
                        <span className="sb-odds-label">Draw</span>
                        <span className="sb-odds-val">{fmtOdds(game.odds.draw)}</span>
                      </button>
                    )}
                    <button className={`sb-odds-btn ${selAway ? 'sb-odds-btn--selected' : ''}`}
                      onClick={() => !alreadyBet && selectPick(game, game.awayTeam, game.odds.away)}
                      disabled={alreadyBet}>
                      <span className="sb-odds-label">{game.awayTeam.split(' ').slice(-1)[0]}</span>
                      <span className="sb-odds-val">{fmtOdds(game.odds.away)}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'mybets' && (
          <div className="sb-mybets">
            {myBets.length === 0 ? (
              <div className="sb-empty">No bets placed yet. Pick a game and place your first bet!</div>
            ) : myBets.map(bet => (
              <div key={bet.betId} className={`sb-bet-card sb-bet-card--${bet.status}`}>
                <div className="sb-bet-header">
                  <span className="sb-bet-status-icon">{STATUS_ICON[bet.status] || '⏳'}</span>
                  <span className={`sb-bet-status-label sb-bet-status--${bet.status}`}>
                    {STATUS_LABEL[bet.status] || bet.status.toUpperCase()}
                  </span>
                  <span className="sb-bet-time">{fmtTime(bet.placedAt)}</span>
                </div>
                <div className="sb-bet-matchup">{bet.homeTeam} vs {bet.awayTeam}</div>
                <div className="sb-bet-pick">
                  Picked: <strong>{bet.pick}</strong>
                  <span className="sb-bet-odds">{fmtOdds(bet.odds)}</span>
                </div>
                <div className="sb-bet-amounts">
                  <span className="sb-bet-wagered">Wagered: ${bet.amount.toLocaleString()}</span>
                  {bet.status === 'open'  && <span className="sb-bet-potential">To win: ${(bet.potentialPayout - bet.amount).toLocaleString()}</span>}
                  {bet.status === 'won'   && <span className="sb-bet-won">+${bet.payout.toLocaleString()}</span>}
                  {bet.status === 'push'  && <span className="sb-bet-push">Returned ${bet.payout.toLocaleString()}</span>}
                  {bet.status === 'lost'  && <span className="sb-bet-lost">-${bet.amount.toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {slip && (
        <div className="sb-slip-overlay" onClick={() => { setSlip(null); setBetAmt(''); setSlipMsg(null); }}>
          <div className="sb-slip" onClick={e => e.stopPropagation()}>
            <div className="sb-slip-header">
              <span>📋 Bet Slip</span>
              <button className="sb-slip-close" onClick={() => { setSlip(null); setBetAmt(''); setSlipMsg(null); }}>✕</button>
            </div>
            <div className="sb-slip-game">{slip.game.homeTeam} vs {slip.game.awayTeam}</div>
            <div className="sb-slip-pick">
              <span className="sb-slip-pick-label">Pick:</span>
              <span className="sb-slip-pick-val">{slip.pick}</span>
              <span className="sb-slip-pick-odds">{fmtOdds(slip.odds)}</span>
            </div>
            <div className="sb-slip-row">
              <label className="sb-slip-label">Bet amount</label>
              <div className="sb-slip-input-row">
                <span className="sb-slip-dollar">$</span>
                <input className="sb-slip-input" type="number" min="100" max="500000"
                  placeholder="100" value={betAmt} onChange={e => setBetAmt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && placeBet()} autoFocus />
              </div>
              <div className="sb-slip-quick">
                {[500, 1000, 5000, 10000].map(v => (
                  <button key={v} className="sb-slip-quick-btn" onClick={() => setBetAmt(String(v))}>
                    ${v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            {betAmt && parseFloat(betAmt) >= 100 && (
              <div className="sb-slip-payout">
                <span>Potential payout</span>
                <span className="sb-slip-payout-val">${calcPayout(parseFloat(betAmt), slip.odds).toLocaleString()}</span>
              </div>
            )}
            {slipMsg && (
              <div className={`sb-slip-msg ${slipMsg.ok ? 'sb-slip-msg--ok' : 'sb-slip-msg--err'}`}>
                {slipMsg.text}
              </div>
            )}
            <button className="sb-slip-place-btn" onClick={placeBet}
              disabled={placing || !betAmt || parseFloat(betAmt) < 100}>
              {placing ? 'Placing…' : `Place Bet · $${(parseFloat(betAmt) || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
