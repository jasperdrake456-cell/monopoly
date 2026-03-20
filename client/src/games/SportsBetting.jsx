import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, subtractBalance, setBalanceFromServer } from '../utils/casinoBalance';
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

// Format American odds for display: +150, -110
function fmtOdds(o) {
  if (o == null) return '—';
  return o > 0 ? `+${o}` : `${o}`;
}

// Calculate total payout (stake + winnings)
function calcPayout(amount, odds) {
  if (!amount || !odds) return 0;
  const amt = parseFloat(amount) || 0;
  if (odds > 0) return Math.floor(amt + amt * (odds / 100));
  return Math.floor(amt + amt * (100 / Math.abs(odds)));
}

// Format date/time nicely
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// How long ago / until
function fmtRelative(iso) {
  const diff = new Date(iso) - Date.now();
  if (diff < 0) return 'In progress / ended';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `In ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)   return `In ${h}h ${m}m`;
  return `In ${m}m`;
}

const STATUS_ICON = { won: '✅', lost: '❌', push: '🔄', open: '⏳', void: '🚫' };
const STATUS_LABEL = { won: 'WON', lost: 'LOST', push: 'PUSH', open: 'OPEN', void: 'VOID' };

export default function SportsBetting() {
  const { token } = useAuth();

  const [sports,     setSports]     = useState([]);   // [{ key, name, emoji, games }]
  const [activeTab,  setActiveTab]  = useState(null); // sport key or 'mybets'
  const [myBets,     setMyBets]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [noApiKey,   setNoApiKey]   = useState(false);
  const [error,      setError]      = useState(null);

  // Bet slip state
  const [slip, setSlip] = useState(null); // { game, pick, odds, pickLabel }
  const [betAmt, setBetAmt] = useState('');
  const [placing, setPlacing] = useState(false);
  const [slipMsg, setSlipMsg] = useState(null); // { ok, text }

  // ── Load games ──────────────────────────────────────────────────────────────
  const loadGames = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch('/api/sports/games', token);
      if (!data.ok) {
        if (data.error === 'NO_API_KEY') { setNoApiKey(true); setLoading(false); return; }
        setError(data.error || 'Failed to load games');
      } else {
        setSports(data.sports || []);
        // Default to first sport that has games
        if (!activeTab || activeTab === null) {
          const first = (data.sports || []).find(s => s.games?.length > 0);
          setActiveTab(first?.key || (data.sports?.[0]?.key) || 'mybets');
        }
      }
    } catch {
      setError('Network error — check your connection.');
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

  // Refresh games every 5 minutes
  useEffect(() => {
    const id = setInterval(() => { loadGames(); loadMyBets(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadGames, loadMyBets]);

  // ── Place bet ────────────────────────────────────────────────────────────────
  async function placeBet() {
    if (!slip) return;
    const amt = Math.floor(parseFloat(betAmt) || 0);
    if (amt < 100)     return setSlipMsg({ ok: false, text: 'Minimum bet is $100' });
    if (amt > 500_000) return setSlipMsg({ ok: false, text: 'Max bet is $500,000' });
    if (amt > getBalance()) return setSlipMsg({ ok: false, text: 'Insufficient balance' });

    setPlacing(true);
    setSlipMsg(null);

    try {
      const data = await authFetch('/api/sports/bet', token, {
        method: 'POST',
        body: JSON.stringify({
          gameId:       slip.game.id,
          sport:        slip.game.sport,
          homeTeam:     slip.game.homeTeam,
          awayTeam:     slip.game.awayTeam,
          commenceTime: slip.game.commenceTime,
          pick:         slip.pick,
          odds:         slip.odds,
          amount:       amt,
        }),
      });

      if (data.ok) {
        // Deduct locally so UI updates immediately
        subtractBalance(amt);
        setSlipMsg({ ok: true, text: `Bet placed! Potential payout: $${data.potentialPayout.toLocaleString()}` });
        setBetAmt('');
        setTimeout(() => { setSlip(null); setSlipMsg(null); }, 2500);
        loadMyBets();
      } else {
        setSlipMsg({ ok: false, text: data.error || 'Bet failed' });
      }
    } catch {
      setSlipMsg({ ok: false, text: 'Network error' });
    } finally {
      setPlacing(false);
    }
  }

  function selectPick(game, pick, pickOdds, pickLabel) {
    // If same pick clicked again, deselect
    if (slip?.game?.id === game.id && slip?.pick === pick) {
      setSlip(null);
      setBetAmt('');
      setSlipMsg(null);
    } else {
      setSlip({ game, pick, odds: pickOdds, pickLabel });
      setBetAmt('');
      setSlipMsg(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const openCount   = myBets.filter(b => b.status === 'open').length;
  const currentGames = sports.find(s => s.key === activeTab)?.games || [];

  return (
    <div className="sb-root">
      {/* Header */}
      <div className="sb-header">
        <div className="sb-header-left">
          <span className="sb-logo">🏆</span>
          <div>
            <div className="sb-title">Sports Betting</div>
            <div className="sb-subtitle">Real odds · Auto-settles · Win real coins</div>
          </div>
        </div>
        <div className="sb-balance">
          💰 ${getBalance().toLocaleString()}
        </div>
      </div>

      {/* Tab bar */}
      <div className="sb-tabs">
        {sports.map(s => (
          <button
            key={s.key}
            className={`sb-tab ${activeTab === s.key ? 'sb-tab--active' : ''}`}
            onClick={() => setActiveTab(s.key)}
          >
            <span>{s.emoji}</span> {s.name}
            {s.games?.length > 0 && <span className="sb-tab-count">{s.games.length}</span>}
          </button>
        ))}
        <button
          className={`sb-tab ${activeTab === 'mybets' ? 'sb-tab--active' : ''}`}
          onClick={() => setActiveTab('mybets')}
        >
          📋 My Bets {openCount > 0 && <span className="sb-tab-count sb-tab-count--open">{openCount}</span>}
        </button>
      </div>

      {/* Body */}
      <div className="sb-body">
        {/* No API key configured */}
        {noApiKey && (
          <div className="sb-setup-card">
            <div className="sb-setup-icon">🔑</div>
            <div className="sb-setup-title">API Key Required</div>
            <div className="sb-setup-text">
              Sports Betting uses real live odds from <strong>The-Odds-API</strong>.
              To activate it:
            </div>
            <ol className="sb-setup-steps">
              <li>Sign up for a free API key at <strong>the-odds-api.com</strong> (500 free requests/month)</li>
              <li>Go to your <strong>Railway dashboard → Variables</strong></li>
              <li>Add <code>ODDS_API_KEY</code> = your key</li>
              <li>Redeploy — sports betting activates automatically</li>
            </ol>
            <div className="sb-setup-note">Free tier gives 500 requests/month. Odds are cached for 30 minutes so you'll use ~50 requests/day max.</div>
          </div>
        )}

        {/* Loading */}
        {!noApiKey && loading && (
          <div className="sb-loading">
            <div className="sb-loading-spinner" />
            Loading live odds…
          </div>
        )}

        {/* Error */}
        {!noApiKey && !loading && error && (
          <div className="sb-error">⚠️ {error}</div>
        )}

        {/* Games list */}
        {!noApiKey && !loading && !error && activeTab !== 'mybets' && (
          <div className="sb-games">
            {currentGames.length === 0 ? (
              <div className="sb-empty">
                No upcoming games for this sport right now.<br />
                Check back later or try another sport.
              </div>
            ) : (
              currentGames.map(game => {
                const isSelectedHome = slip?.game?.id === game.id && slip?.pick === game.homeTeam;
                const isSelectedAway = slip?.game?.id === game.id && slip?.pick === game.awayTeam;
                const isSelectedDraw = slip?.game?.id === game.id && slip?.pick === 'Draw';
                const alreadyBet = myBets.some(b => b.gameId === game.id && b.status === 'open');
                return (
                  <div key={game.id} className={`sb-game-card ${alreadyBet ? 'sb-game-card--bet' : ''}`}>
                    <div className="sb-game-time">
                      {fmtTime(game.commenceTime)}
                      <span className="sb-game-countdown">{fmtRelative(game.commenceTime)}</span>
                    </div>
                    <div className="sb-game-matchup">
                      <div className="sb-game-team">{game.homeTeam}</div>
                      <div className="sb-game-vs">vs</div>
                      <div className="sb-game-team">{game.awayTeam}</div>
                    </div>
                    {alreadyBet && <div className="sb-already-bet">✓ Bet placed</div>}
                    <div className="sb-game-odds">
                      <button
                        className={`sb-odds-btn ${isSelectedHome ? 'sb-odds-btn--selected' : ''}`}
                        onClick={() => !alreadyBet && selectPick(game, game.homeTeam, game.odds.home, game.homeTeam)}
                        disabled={alreadyBet}
                      >
                        <span className="sb-odds-label">{game.homeTeam.split(' ').pop()}</span>
                        <span className="sb-odds-val">{fmtOdds(game.odds.home)}</span>
                      </button>
                      {game.odds.draw != null && (
                        <button
                          className={`sb-odds-btn sb-odds-btn--draw ${isSelectedDraw ? 'sb-odds-btn--selected' : ''}`}
                          onClick={() => !alreadyBet && selectPick(game, 'Draw', game.odds.draw, 'Draw')}
                          disabled={alreadyBet}
                        >
                          <span className="sb-odds-label">Draw</span>
                          <span className="sb-odds-val">{fmtOdds(game.odds.draw)}</span>
                        </button>
                      )}
                      <button
                        className={`sb-odds-btn ${isSelectedAway ? 'sb-odds-btn--selected' : ''}`}
                        onClick={() => !alreadyBet && selectPick(game, game.awayTeam, game.odds.away, game.awayTeam)}
                        disabled={alreadyBet}
                      >
                        <span className="sb-odds-label">{game.awayTeam.split(' ').pop()}</span>
                        <span className="sb-odds-val">{fmtOdds(game.odds.away)}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* My Bets */}
        {activeTab === 'mybets' && (
          <div className="sb-mybets">
            {myBets.length === 0 ? (
              <div className="sb-empty">No bets placed yet. Pick a sport and place your first bet!</div>
            ) : (
              myBets.map(bet => (
                <div key={bet.betId} className={`sb-bet-card sb-bet-card--${bet.status}`}>
                  <div className="sb-bet-header">
                    <span className="sb-bet-status-icon">{STATUS_ICON[bet.status]}</span>
                    <span className={`sb-bet-status-label sb-bet-status--${bet.status}`}>
                      {STATUS_LABEL[bet.status]}
                    </span>
                    <span className="sb-bet-time">{fmtTime(bet.placedAt)}</span>
                  </div>
                  <div className="sb-bet-matchup">
                    {bet.homeTeam} vs {bet.awayTeam}
                  </div>
                  <div className="sb-bet-pick">
                    Picked: <strong>{bet.pick}</strong>
                    <span className="sb-bet-odds">{fmtOdds(bet.odds)}</span>
                  </div>
                  <div className="sb-bet-amounts">
                    <span className="sb-bet-wagered">Wagered: ${bet.amount.toLocaleString()}</span>
                    {bet.status === 'open' ? (
                      <span className="sb-bet-potential">To win: ${(bet.potentialPayout - bet.amount).toLocaleString()}</span>
                    ) : bet.status === 'won' ? (
                      <span className="sb-bet-won">+${bet.payout.toLocaleString()}</span>
                    ) : bet.status === 'push' ? (
                      <span className="sb-bet-push">Returned ${bet.payout.toLocaleString()}</span>
                    ) : (
                      <span className="sb-bet-lost">-${bet.amount.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bet slip sidebar */}
      {slip && (
        <div className="sb-slip-overlay" onClick={() => { setSlip(null); setBetAmt(''); setSlipMsg(null); }}>
          <div className="sb-slip" onClick={e => e.stopPropagation()}>
            <div className="sb-slip-header">
              <span>📋 Bet Slip</span>
              <button className="sb-slip-close" onClick={() => { setSlip(null); setBetAmt(''); setSlipMsg(null); }}>✕</button>
            </div>
            <div className="sb-slip-game">
              {slip.game.homeTeam} vs {slip.game.awayTeam}
            </div>
            <div className="sb-slip-pick">
              <span className="sb-slip-pick-label">Your pick:</span>
              <span className="sb-slip-pick-val">{slip.pickLabel}</span>
              <span className="sb-slip-pick-odds">{fmtOdds(slip.odds)}</span>
            </div>
            <div className="sb-slip-row">
              <label className="sb-slip-label">Bet amount</label>
              <div className="sb-slip-input-row">
                <span className="sb-slip-dollar">$</span>
                <input
                  className="sb-slip-input"
                  type="number"
                  min="100"
                  max="500000"
                  placeholder="100"
                  value={betAmt}
                  onChange={e => setBetAmt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && placeBet()}
                  autoFocus
                />
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
                <span className="sb-slip-payout-val">
                  ${calcPayout(parseFloat(betAmt), slip.odds).toLocaleString()}
                </span>
              </div>
            )}
            {slipMsg && (
              <div className={`sb-slip-msg ${slipMsg.ok ? 'sb-slip-msg--ok' : 'sb-slip-msg--err'}`}>
                {slipMsg.text}
              </div>
            )}
            <button
              className="sb-slip-place-btn"
              onClick={placeBet}
              disabled={placing || !betAmt || parseFloat(betAmt) < 100}
            >
              {placing ? 'Placing…' : `Place Bet · $${(parseFloat(betAmt) || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
