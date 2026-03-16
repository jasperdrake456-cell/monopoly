import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const MEDALS = ['🥇', '🥈', '🥉'];

function formatBalance(amount) {
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CasinoLeaderboardPage() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/casino-leaderboard`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setPlayers(Array.isArray(data) ? data.slice(0, 20) : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.backLink}>
        <Link to="/" style={styles.link}>← Game Vault</Link>
      </div>

      <div style={styles.container}>
        <h1 style={styles.title}>💰 Casino Rich List</h1>
        <p style={styles.subtitle}>Top 20 players by casino balance</p>

        {loading && (
          <div style={styles.state}>Loading…</div>
        )}

        {!loading && (error || players.length === 0) && (
          <div style={styles.state}>No data yet.</div>
        )}

        {!loading && !error && players.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: '60px' }}>Rank</th>
                <th style={styles.th}>Player</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => (
                <tr
                  key={i}
                  style={{
                    ...styles.tr,
                    ...(i === 0 ? styles.trGold : i === 1 ? styles.trSilver : i === 2 ? styles.trBronze : {}),
                  }}
                >
                  <td style={{ ...styles.td, fontWeight: 700, fontSize: '1.1rem' }}>
                    {i < 3 ? MEDALS[i] : `#${i + 1}`}
                  </td>
                  <td style={styles.td}>
                    <span style={styles.playerName}>{player.name || player.username || 'Unknown'}</span>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', ...styles.balanceCell }}>
                    {formatBalance(player.balance ?? player.coins ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f1117',
    color: '#fff',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    padding: '0 16px 60px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  backLink: {
    position: 'fixed',
    top: 12,
    left: 12,
    zIndex: 100,
  },
  link: {
    color: 'rgba(255,255,255,0.6)',
    textDecoration: 'none',
    fontSize: '0.9rem',
  },
  container: {
    marginTop: '70px',
    width: '100%',
    maxWidth: '560px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '1.8rem',
    fontWeight: 800,
    color: '#f0c040',
    margin: '0 0 4px',
    textAlign: 'center',
    textShadow: '0 0 16px rgba(240,192,64,0.35)',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.9rem',
    margin: '0 0 24px',
    textAlign: 'center',
  },
  state: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '1rem',
    marginTop: '40px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '14px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.35)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    transition: 'background 0.15s',
  },
  trGold: {
    background: 'rgba(240,192,64,0.07)',
  },
  trSilver: {
    background: 'rgba(192,192,192,0.05)',
  },
  trBronze: {
    background: 'rgba(205,127,50,0.05)',
  },
  td: {
    padding: '13px 16px',
    fontSize: '0.95rem',
    color: 'rgba(255,255,255,0.85)',
    verticalAlign: 'middle',
  },
  playerName: {
    fontWeight: 600,
  },
  balanceCell: {
    fontWeight: 700,
    color: '#4ade80',
    fontVariantNumeric: 'tabular-nums',
  },
};
