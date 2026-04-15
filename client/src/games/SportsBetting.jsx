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
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles',
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

// Display overrides: sport key → { label, emoji }
const SPORT_DISPLAY = {
  'NCAAB':                 { label: 'March Madness', emoji: '🏀' },
  'NBA':                   { label: 'NBA',           emoji: '🏀' },
  'NHL':                   { label: 'NHL',           emoji: '🏒' },
  'Premier League':        { label: 'Premier League',emoji: '⚽' },
  'UEFA Champions League': { label: 'Champions League', emoji: '⚽' },
  'NFL':                   { label: 'NFL',           emoji: '🏈' },
  'MLB':                   { label: 'MLB',           emoji: '⚾' },
  'MMA':                   { label: 'MMA / UFC',     emoji: '🥊' },
};

// Preferred tab order
const SPORT_ORDER = ['NCAAB','NBA','NHL','Premier League','UEFA Champions League','NFL','MLB','MMA'];

function groupBySport(games) {
  const map = {};
  for (const g of games) {
    if (!map[g.sport]) {
      const disp = SPORT_DISPLAY[g.sport] || {};
      map[g.sport] = {
        key:   g.sport,
        name:  disp.label || g.sport,
        emoji: disp.emoji || g.sportEmoji || '🏆',
        games: [],
      };
    }
    map[g.sport].games.push(g);
  }
  // Sort by preferred order, unknowns at end
  return Object.values(map).sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a.key), bi = SPORT_ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

const STATUS_ICON  = { won: '✅', lost: '❌', push: '🔄', open: '⏳', void: '🚫', cancelled: '🚫' };
const STATUS_LABEL = { won: 'WON', lost: 'LOST', push: 'PUSH', open: 'OPEN', void: 'VOID', cancelled: 'VOID' };

// ── Parlay helpers ────────────────────────────────────────────────────────────

function americanToDecimal(odds) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function decimalToAmerican(dec) {
  if (dec >= 2) return Math.round((dec - 1) * 100);
  return Math.round(-100 / (dec - 1));
}

function parlayDecimal(picks) {
  return picks.reduce((acc, p) => acc * americanToDecimal(p.odds), 1);
}

function parlayOdds(picks) {
  if (!picks.length) return null;
  return decimalToAmerican(parlayDecimal(picks));
}

function parlayPayout(picks, amount) {
  if (!picks.length || !amount) return 0;
  return Math.floor(amount * parlayDecimal(picks));
}

export default function SportsBetting() {
  const { token } = useAuth();

  const [games,     setGames]     = useState([]);
  const [sports,    setSports]    = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [myBets,    setMyBets]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [scores,   setScores]   = useState([]);
  const [slip,     setSlip]     = useState(null);
  const [betAmt,   setBetAmt]   = useState('');
  const [placing,  setPlacing]  = useState(false);
  const [slipMsg,  setSlipMsg]  = useState(null);

  // Parlay state
  const [parlayPicks,  setParlayPicks]  = useState([]); // [{ gameId, game, pick, odds }]
  const [parlayAmt,    setParlayAmt]    = useState('');
  const [parlayMsg,    setParlayMsg]    = useState(null);
  const [placingParlay, setPlacingParlay] = useState(false);
  const [myParlays,    setMyParlays]    = useState([]);

  const loadScores = useCallback(async () => {
    if (!token) return;
    try {
      const data = await authFetch('/api/sports/scores', token);
      if (data.ok) setScores(data.scores || []);
    } catch { /* silent */ }
  }, [token]);

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

  const loadMyParlays = useCallback(async () => {
    if (!token) return;
    const data = await authFetch('/api/sports/my-parlays', token);
    if (data.ok) setMyParlays(data.parlays || []);
  }, [token]);

  useEffect(() => { loadGames(); loadMyBets(); loadScores(); loadMyParlays(); }, [loadGames, loadMyBets, loadScores, loadMyParlays]);
  useEffect(() => {
    const id = setInterval(() => { loadGames(); loadMyBets(); loadScores(); loadMyParlays(); }, 15_000);
    return () => clearInterval(id);
  }, [loadGames, loadMyBets, loadScores, loadMyParlays]);

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

  // Add/change/remove a game from the parlay slip (works from any sport tab)
  function toggleParlay(game, pick, pickOdds) {
    const existing = parlayPicks.findIndex(p => p.gameId === game.gameId);
    if (existing >= 0) {
      const cur = parlayPicks[existing];
      if (cur.pick === pick) {
        setParlayPicks(prev => prev.filter(p => p.gameId !== game.gameId));
      } else {
        setParlayPicks(prev => prev.map(p => p.gameId === game.gameId ? { ...p, pick, odds: pickOdds } : p));
      }
    } else {
      setParlayPicks(prev => [...prev, { gameId: game.gameId, game, pick, odds: pickOdds }]);
    }
    setParlayMsg(null);
  }

  function selectPick(game, pick, pickOdds) {
    if (slip?.game?.gameId === game.gameId && slip?.pick === pick) {
      setSlip(null); setBetAmt(''); setSlipMsg(null);
    } else {
      setSlip({ game, pick, odds: pickOdds }); setBetAmt(''); setSlipMsg(null);
    }
  }

  async function placeParlay() {
    const amt = Math.floor(parseFloat(parlayAmt) || 0);
    if (parlayPicks.length < 2) return setParlayMsg({ ok: false, text: 'Add at least 2 picks to your parlay' });
    if (amt < 100)              return setParlayMsg({ ok: false, text: 'Minimum parlay bet is $100' });
    if (amt > 500_000)          return setParlayMsg({ ok: false, text: 'Max bet is $500,000' });
    if (amt > getBalance())     return setParlayMsg({ ok: false, text: 'Insufficient balance' });

    setPlacingParlay(true);
    setParlayMsg(null);
    try {
      const picks = parlayPicks.map(p => ({ gameId: p.gameId, pick: p.pick, odds: p.odds }));
      const data  = await authFetch('/api/sports/parlay', token, {
        method: 'POST',
        body: JSON.stringify({ picks, amount: amt }),
      });
      if (data.ok) {
        subtractBalance(amt);
        const payout = data.potentialPayout;
        setParlayMsg({ ok: true, text: `Parlay placed! Potential win: $${(payout - amt).toLocaleString()}` });
        setParlayAmt('');
        setTimeout(() => { setParlayPicks([]); setParlayMsg(null); loadMyParlays(); }, 2500);
      } else {
        setParlayMsg({ ok: false, text: data.error || 'Parlay failed' });
      }
    } catch {
      setParlayMsg({ ok: false, text: 'Network error' });
    } finally {
      setPlacingParlay(false);
    }
  }

  // Look up live score for a stored game by fuzzy team name match
  function getLiveScore(homeTeam, awayTeam) {
    const norm = s => (s || '').toLowerCase().replace(/^\(\d+\)\s*/, '').replace(/\bst\./g, 'saint').replace(/[^a-z0-9 ]/g, '').replace(/\bstate\b/g, 'st').replace(/\s+/g, ' ').trim();
    const match = name => n => norm(n).includes(norm(name)) || norm(name).includes(norm(n));
    const g = scores.find(s =>
      (s.scores || []).length >= 2 &&
      s.home_team && s.away_team &&
      (match(homeTeam)(s.home_team) || match(homeTeam)(s.away_team)) &&
      (match(awayTeam)(s.home_team) || match(awayTeam)(s.away_team))
    );
    if (!g) return null;
    const getS = team => (g.scores || []).find(s => match(team)(s.name))?.score ?? '?';
    const homeIsApiHome = match(homeTeam)(g.home_team);
    return {
      home: homeIsApiHome ? getS(g.home_team) : getS(g.away_team),
      away: homeIsApiHome ? getS(g.away_team) : getS(g.home_team),
      completed: g.completed,
    };
  }

  const openCount      = myBets.filter(b => b.status === 'open').length;
  const openParlays    = myParlays.filter(b => b.status === 'open').length;
  const currentGames   = sports.find(s => s.key === activeTab)?.games || [];
  const isParlaySport  = activeTab !== 'mybets' && activeTab !== 'parlay' && activeTab !== null;

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
          📋 My Bets {(openCount + openParlays) > 0 && <span className="sb-tab-count sb-tab-count--open">{openCount + openParlays}</span>}
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

        {!loading && !error && activeTab !== 'mybets' && activeTab !== 'parlay' && currentGames.length > 0 && (
          <div className="sb-games">
            {currentGames.map(game => {
              const parlayLeg  = parlayPicks.find(p => p.gameId === game.gameId);
              const selHome = slip?.game?.gameId === game.gameId && slip?.pick === game.homeTeam;
              const selAway = slip?.game?.gameId === game.gameId && slip?.pick === game.awayTeam;
              const selDraw = slip?.game?.gameId === game.gameId && slip?.pick === 'Draw';
              const alreadyBet = myBets.some(b => b.gameId === game.gameId && b.status === 'open');
              const parlaySelHome = parlayLeg?.pick === game.homeTeam;
              const parlaySelAway = parlayLeg?.pick === game.awayTeam;
              const parlaySelDraw = parlayLeg?.pick === 'Draw';
              return (
                <div key={game.gameId} className={`sb-game-card ${alreadyBet ? 'sb-game-card--bet' : ''} ${parlayLeg ? 'sb-game-card--parlay' : ''}`}>
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
                  {/* Single-bet odds row */}
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
                  {/* Parlay add row */}
                  <div className="sb-parlay-add-row">
                    <span className="sb-parlay-add-label">+ Parlay</span>
                    <button
                      className={`sb-parlay-add-btn ${parlaySelHome ? 'sb-parlay-add-btn--active' : ''}`}
                      onClick={() => toggleParlay(game, game.homeTeam, game.odds.home)}>
                      {game.homeTeam.split(' ').slice(-1)[0]} {fmtOdds(game.odds.home)}
                    </button>
                    {game.odds.draw != null && (
                      <button
                        className={`sb-parlay-add-btn ${parlaySelDraw ? 'sb-parlay-add-btn--active' : ''}`}
                        onClick={() => toggleParlay(game, 'Draw', game.odds.draw)}>
                        Draw {fmtOdds(game.odds.draw)}
                      </button>
                    )}
                    <button
                      className={`sb-parlay-add-btn ${parlaySelAway ? 'sb-parlay-add-btn--active' : ''}`}
                      onClick={() => toggleParlay(game, game.awayTeam, game.odds.away)}>
                      {game.awayTeam.split(' ').slice(-1)[0]} {fmtOdds(game.odds.away)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}


        {activeTab === 'mybets' && (
          <div className="sb-mybets">
            {/* Straight bets */}
            {myBets.length === 0 && myParlays.length === 0 ? (
              <div className="sb-empty">No bets placed yet. Pick a game and place your first bet!</div>
            ) : null}

            {/* Parlay bets section */}
            {myParlays.length > 0 && (
              <div className="sb-mybets-section">
                <div className="sb-mybets-section-title">🎰 Parlay Bets</div>
                {myParlays.map(bet => (
                  <div key={bet.betId} className={`sb-bet-card sb-bet-card--${bet.status} sb-bet-card--parlay`}>
                    <div className="sb-bet-header">
                      <span className="sb-bet-status-icon">{STATUS_ICON[bet.status] || '⏳'}</span>
                      <span className={`sb-bet-status-label sb-bet-status--${bet.status}`}>
                        {STATUS_LABEL[bet.status] || bet.status.toUpperCase()} · PARLAY
                      </span>
                      <span className="sb-bet-time">{new Date(bet.placedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    <div className="sb-parlay-legs-summary">
                      {bet.picks.map((leg, i) => (
                        <div key={leg.gameId} className={`sb-parlay-leg-mini sb-parlay-leg-mini--${leg.status}`}>
                          <span className="sb-parlay-leg-mini-num">{i + 1}</span>
                          <span className="sb-parlay-leg-mini-teams">{leg.homeTeam} vs {leg.awayTeam}</span>
                          <span className="sb-parlay-leg-mini-pick">{leg.pick}</span>
                          <span className="sb-parlay-leg-mini-odds">{fmtOdds(leg.odds)}</span>
                          <span className="sb-parlay-leg-mini-status">
                            {leg.status === 'open' ? '⏳' : leg.status === 'won' ? '✅' : leg.status === 'lost' ? '❌' : leg.status === 'push' ? '🔄' : '🚫'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="sb-bet-amounts">
                      <span className="sb-bet-wagered">Wagered: ${bet.amount.toLocaleString()}</span>
                      <span style={{ color: '#7a8a9a', fontSize: '0.8rem' }}>Combined: {fmtOdds(bet.combinedOdds)}</span>
                      {bet.status === 'open'  && <span className="sb-bet-potential">To win: ${(bet.potentialPayout - bet.amount).toLocaleString()}</span>}
                      {bet.status === 'won'   && <span className="sb-bet-won">+${bet.payout.toLocaleString()}</span>}
                      {bet.status === 'push'  && <span className="sb-bet-push">Returned ${bet.payout.toLocaleString()}</span>}
                      {bet.status === 'lost'  && <span className="sb-bet-lost">-${bet.amount.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Straight bets section */}
            {myBets.length > 0 && (
              <div className="sb-mybets-section">
                {myParlays.length > 0 && <div className="sb-mybets-section-title">📋 Straight Bets</div>}
                {myBets.map(bet => {
              const live = getLiveScore(bet.homeTeam, bet.awayTeam);
              const isLive = live && !live.completed && bet.status === 'open';
              return (
              <div key={bet.betId} className={`sb-bet-card sb-bet-card--${bet.status}`}>
                <div className="sb-bet-header">
                  <span className="sb-bet-status-icon">{isLive ? '🔴' : (STATUS_ICON[bet.status] || '⏳')}</span>
                  <span className={`sb-bet-status-label sb-bet-status--${bet.status}`}>
                    {isLive ? 'LIVE' : (STATUS_LABEL[bet.status] || bet.status.toUpperCase())}
                  </span>
                  <span className="sb-bet-time">{fmtTime(bet.commenceTime || bet.placedAt)}</span>
                </div>
                {live && (
                  <div className="sb-bet-score">
                    <span className="sb-bet-score-team">{bet.homeTeam.split(' ').slice(-1)[0]}</span>
                    <span className="sb-bet-score-val">{live.home} – {live.away}</span>
                    <span className="sb-bet-score-team">{bet.awayTeam.split(' ').slice(-1)[0]}</span>
                    {live.completed && <span className="sb-bet-score-final">FINAL</span>}
                  </div>
                )}
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
            );
            })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Parlay Slip ──────────────────────────────────────────── */}
      {parlayPicks.length > 0 && (
        <div className="sb-parlay-float">
          <div className="sb-parlay-float-header">
            <span>🎰 Parlay Slip <strong>{parlayPicks.length} leg{parlayPicks.length !== 1 ? 's' : ''}</strong></span>
            <span className="sb-parlay-float-odds">
              {parlayOdds(parlayPicks) !== null ? fmtOdds(parlayOdds(parlayPicks)) : '—'}
            </span>
            <button className="sb-parlay-float-clear" onClick={() => { setParlayPicks([]); setParlayMsg(null); }}>Clear ✕</button>
          </div>
          <div className="sb-parlay-float-legs">
            {parlayPicks.map((p, i) => (
              <div key={p.gameId} className="sb-parlay-float-leg">
                <span className="sb-parlay-float-leg-num">{i + 1}</span>
                <span className="sb-parlay-float-leg-text">
                  <strong>{p.pick}</strong> · {p.game.homeTeam.split(' ').slice(-1)[0]} vs {p.game.awayTeam.split(' ').slice(-1)[0]}
                </span>
                <span className="sb-parlay-float-leg-odds" style={{ color: p.odds > 0 ? '#22c55e' : '#f87171' }}>{fmtOdds(p.odds)}</span>
                <button className="sb-parlay-float-leg-remove" onClick={() => setParlayPicks(prev => prev.filter(x => x.gameId !== p.gameId))}>✕</button>
              </div>
            ))}
          </div>
          <div className="sb-parlay-float-footer">
            <div className="sb-parlay-float-input-row">
              <span className="sb-slip-dollar">$</span>
              <input className="sb-parlay-float-input" type="number" min="100" max="500000"
                placeholder="Wager (min $100)" value={parlayAmt}
                onChange={e => setParlayAmt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && placeParlay()} />
              {parlayAmt && parseFloat(parlayAmt) >= 100 && (
                <span className="sb-parlay-float-payout">
                  → ${parlayPayout(parlayPicks, parseFloat(parlayAmt)).toLocaleString()}
                </span>
              )}
            </div>
            <div className="sb-slip-quick" style={{ marginBottom: 6 }}>
              {[500, 1000, 5000, 10000].map(v => (
                <button key={v} className="sb-slip-quick-btn" onClick={() => setParlayAmt(String(v))}>
                  ${v.toLocaleString()}
                </button>
              ))}
            </div>
            {parlayMsg && (
              <div className={`sb-slip-msg ${parlayMsg.ok ? 'sb-slip-msg--ok' : 'sb-slip-msg--err'}`} style={{ marginBottom: 6 }}>
                {parlayMsg.text}
              </div>
            )}
            <button className="sb-slip-place-btn" onClick={placeParlay}
              disabled={placingParlay || parlayPicks.length < 2 || !parlayAmt || parseFloat(parlayAmt) < 100}>
              {placingParlay ? 'Placing…' : `Place ${parlayPicks.length}-Leg Parlay · $${(parseFloat(parlayAmt)||0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}

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
