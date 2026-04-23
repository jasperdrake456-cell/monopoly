import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './JokerLeaderboardPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

function fmt(n) {
  if (n == null) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toLocaleString();
}

function rarityStyle(rarities, rarity) {
  return rarities?.[rarity] || { label: 'Common', color: '#94a3b8', glow: 'rgba(148,163,184,0.4)' };
}

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export default function JokerLeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [rarities, setRarities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${SERVER_URL}/api/jokers/leaderboard`);
        const d = await res.json();
        if (cancelled) return;
        if (d.ok) {
          setLeaderboard(d.leaderboard || []);
          setRarities(d.rarities || {});
        } else {
          setError(d.error || 'Failed to load leaderboard');
        }
      } catch {
        if (!cancelled) setError('Network error');
      }
      if (!cancelled) setLoading(false);
    }
    load();
    const id = setInterval(load, 30000); // refresh every 30s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) {
    return <div className="jlb-loading">Loading Joker Leaderboard...</div>;
  }

  return (
    <div className="jlb-page">
      <div className="jlb-header">
        <Link to="/" className="jlb-back">← Home</Link>
        <div className="jlb-title">
          <div className="jlb-title-emoji">🃏</div>
          <h1>Joker Collection Leaderboard</h1>
        </div>
        <div className="jlb-header-links">
          <Link to="/jokers" className="jlb-secondary-btn">🎁 Open Crate</Link>
          <Link to="/auction" className="jlb-secondary-btn">🏛️ Auction</Link>
        </div>
      </div>

      <div className="jlb-hero">
        <h2>Richest Joker Collections</h2>
        <p>
          Ranked by total market value of jokers owned. Market prices update
          with every auction sale. Can you out-collect the top dog?
        </p>
      </div>

      {error && <div className="jlb-error">{error}</div>}

      {leaderboard.length === 0 ? (
        <div className="jlb-empty">
          No collections yet. Be the first to pull a joker and take #1!
        </div>
      ) : (
        <div className="jlb-board">
          {leaderboard.map((row, idx) => {
            const rank = idx + 1;
            const rarestStyle = rarityStyle(rarities, row.rarest);
            const rankClass =
              rank === 1 ? 'jlb-row--gold'
              : rank === 2 ? 'jlb-row--silver'
              : rank === 3 ? 'jlb-row--bronze'
              : '';
            return (
              <div
                key={row.username}
                className={`jlb-row ${rankClass}`}
                style={{ '--rarest-color': rarestStyle.color, '--rarest-glow': rarestStyle.glow }}
              >
                <div className="jlb-rank">
                  {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                </div>
                <div className="jlb-main">
                  <div className="jlb-username">{row.username}</div>
                  <div className="jlb-stats">
                    <span className="jlb-stat">
                      <span className="jlb-stat-label">Total</span>
                      <span className="jlb-stat-value jlb-stat-value--gold">{fmt(row.totalValue)}</span>
                    </span>
                    <span className="jlb-stat">
                      <span className="jlb-stat-label">Jokers</span>
                      <span className="jlb-stat-value">{row.jokerCount}</span>
                    </span>
                    <span className="jlb-stat">
                      <span className="jlb-stat-label">Equipped</span>
                      <span className="jlb-stat-value">{row.equippedCount}</span>
                    </span>
                    <span
                      className="jlb-stat jlb-stat--rarest"
                      style={{ color: rarestStyle.color }}
                    >
                      <span className="jlb-stat-label">Rarest</span>
                      <span className="jlb-stat-value" style={{ color: rarestStyle.color }}>
                        {rarestStyle.label}
                      </span>
                    </span>
                  </div>
                  <div className="jlb-rarity-bar">
                    {RARITY_ORDER.map(r => {
                      const count = row.rarityBreakdown?.[r] || 0;
                      if (count === 0) return null;
                      const st = rarityStyle(rarities, r);
                      return (
                        <span
                          key={r}
                          className="jlb-rarity-pill"
                          style={{
                            color: st.color,
                            borderColor: st.color + '55',
                            background: st.color + '14',
                          }}
                          title={`${st.label} × ${count}`}
                        >
                          {st.label} ×{count}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="jlb-hint">Leaderboard refreshes every 30 seconds.</div>
    </div>
  );
}
