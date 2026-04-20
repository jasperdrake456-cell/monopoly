import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './GlobalStatsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const STAT_ICONS = {
  totalBets:    '🎯',
  totalWagered: '💸',
  totalWon:     '🏆',
  totalLost:    '💀',
  biggestWin:   '🚀',
  activePlayers:'👥',
};

export default function GlobalStatsPage() {
  const [stats,   setStats]   = useState(null);
  const [top,     setTop]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/api/stats/global`).then(r => r.json()),
      fetch(`${SERVER_URL}/api/xp/leaderboard`).then(r => r.json()),
    ]).then(([s, t]) => {
      if (s.ok) setStats(s);   // fields are top-level (biggestWinEver, totalProfitPaid, etc.)
      if (t.ok) setTop(t.players || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="gs-loading">Loading stats…</div>;

  const LEVEL_COLORS = ['#94a3b8','#22c55e','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#ec4899','#06b6d4','#10b981','#f97316'];

  return (
    <div className="gs-page">
      <div className="gs-hero">
        <div className="gs-hero-icon">📊</div>
        <div>
          <h1 className="gs-hero-title">Global Statistics</h1>
          <p className="gs-hero-sub">Site-wide totals and top player rankings</p>
        </div>
      </div>

      {/* Global stat cards */}
      {stats && (
        <div className="gs-cards">
          <div className="gs-card gs-card--yellow">
            <div className="gs-card-icon">🚀</div>
            <div className="gs-card-label">Biggest Win Ever</div>
            <div className="gs-card-value">${(stats.biggestWinEver?.profit || 0).toLocaleString()}</div>
            {stats.biggestWinEver?.username && (
              <div className="gs-card-sub">by {stats.biggestWinEver.username} ({stats.biggestWinEver.game})</div>
            )}
          </div>
          <div className="gs-card gs-card--green">
            <div className="gs-card-icon">💰</div>
            <div className="gs-card-label">Total Profit Paid Out</div>
            <div className="gs-card-value">${Math.max(0, stats.totalProfitPaid || 0).toLocaleString()}</div>
          </div>
          <div className="gs-card">
            <div className="gs-card-icon">🎯</div>
            <div className="gs-card-label">Big Win Count</div>
            <div className="gs-card-value">{(stats.bigWinCount || 0).toLocaleString()}</div>
          </div>
          <div className="gs-card gs-card--purple">
            <div className="gs-card-icon">🎟️</div>
            <div className="gs-card-label">Lottery Jackpot</div>
            <div className="gs-card-value">${(stats.lotteryJackpot || 0).toLocaleString()}</div>
            <div className="gs-card-sub">{stats.lotteryTickets || 0} tickets sold</div>
          </div>
          <div className="gs-card">
            <div className="gs-card-icon">🏁</div>
            <div className="gs-card-label">Wager Race Pool</div>
            <div className="gs-card-value">${(stats.wagerRacePool || 0).toLocaleString()}</div>
          </div>
          {stats.topXpPlayer && (
            <div className="gs-card gs-card--yellow">
              <div className="gs-card-icon">{stats.topXpPlayer.levelInfo?.icon || '⭐'}</div>
              <div className="gs-card-label">Top XP Player</div>
              <div className="gs-card-value gs-card-value--sm">{stats.topXpPlayer.username}</div>
              <div className="gs-card-sub">{stats.topXpPlayer.xp?.toLocaleString()} XP · Lv.{stats.topXpPlayer.level}</div>
            </div>
          )}
        </div>
      )}

      {/* Top XP players */}
      {top.length > 0 && (
        <div className="gs-section">
          <h3 className="gs-section-title">🏅 Top Players by XP</h3>
          <div className="gs-xp-table">
            <div className="gs-xp-header">
              <span>Rank</span>
              <span>Player</span>
              <span>Level</span>
              <span>XP</span>
              <span>Total Wagered</span>
            </div>
            {top.map((p, i) => (
              <div key={p.username} className="gs-xp-row">
                <span className="gs-xp-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <span className="gs-xp-name">
                  <Link to={`/profile/${p.username}`}>{p.username}</Link>
                </span>
                <span className="gs-xp-level" style={{ color: p.levelInfo?.color || LEVEL_COLORS[Math.min(p.level - 1, 9)] }}>
                  {p.levelInfo?.icon || '⭐'} Lv.{p.level}
                </span>
                <span className="gs-xp-val">{p.xp?.toLocaleString()} XP</span>
                <span className="gs-xp-wagered">{p.levelInfo?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
