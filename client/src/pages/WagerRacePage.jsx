import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './WagerRacePage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';
const MEDALS = ['🥇', '🥈', '🥉'];
const PRIZE_COLORS = ['#f59e0b', '#94a3b8', '#cd7f32'];

export default function WagerRacePage() {
  const { user } = useAuth();
  const [data,   setData]  = useState(null);
  const [prev,   setPrev]  = useState(null);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/wager-race`).then(r => r.json()).then(d => { if (d.ok) setData(d); });
    fetch(`${SERVER_URL}/api/wager-race/prev`).then(r => r.json()).then(d => { if (d.ok) setPrev(d.prev); });
  }, []);

  const myRank = data?.leaderboard?.findIndex(p => p.username === user?.username);

  return (
    <div className="wr-page">
      <div className="wr-hero">
        <div className="wr-hero-icon">🏁</div>
        <div>
          <h1 className="wr-hero-title">Weekly Wager Race</h1>
          <p className="wr-hero-sub">Top 3 wagerers each week split the prize pool</p>
        </div>
      </div>

      {/* Prize pool */}
      <div className="wr-prizes">
        {data?.prizes?.map((p, i) => (
          <div key={i} className="wr-prize-card" style={{ '--prize-color': PRIZE_COLORS[i] }}>
            <div className="wr-prize-medal">{MEDALS[i]}</div>
            <div className="wr-prize-rank">#{p.rank}</div>
            <div className="wr-prize-amount">${p.prize.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Week info */}
      {data && (
        <div className="wr-week-label">Week of {data.week} · Prize pool: ${data.prizePool.toLocaleString()}</div>
      )}

      {/* Leaderboard */}
      <div className="wr-table">
        <div className="wr-table-header">
          <span>Rank</span><span>Player</span><span>Total Wagered</span>
        </div>
        {data?.leaderboard?.length === 0 && (
          <div className="wr-empty">No wagers yet this week — be the first!</div>
        )}
        {data?.leaderboard?.map((p, i) => (
          <div key={p.username} className={`wr-row ${p.username === user?.username ? 'wr-row--me' : ''} ${i < 3 ? 'wr-row--top' : ''}`}>
            <span className="wr-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            <span className="wr-name">
              <Link to={`/profile/${p.username}`}>{p.username}</Link>
              {p.username === user?.username && <span className="wr-you-badge">YOU</span>}
            </span>
            <span className="wr-wager">${p.wagered.toLocaleString()}</span>
            {i < 3 && <span className="wr-prize-tag" style={{ color: PRIZE_COLORS[i] }}>${data.prizes[i]?.prize.toLocaleString()}</span>}
          </div>
        ))}
        {myRank > 2 && (
          <div className="wr-my-rank">
            You are #{myRank + 1} — wager ${(data.leaderboard[2]?.wagered - data.leaderboard[myRank]?.wagered + 1).toLocaleString()} more to reach 3rd place!
          </div>
        )}
      </div>

      {/* Previous winners */}
      {prev?.winners?.length > 0 && (
        <div className="wr-prev">
          <h3 className="wr-prev-title">Last Week's Winners (week of {prev.week})</h3>
          {prev.winners.map((w, i) => (
            <div key={i} className="wr-prev-row">
              <span>{MEDALS[i]}</span>
              <span>{w.username}</span>
              <span style={{ color: '#22c55e' }}>+${w.prize.toLocaleString()}</span>
              <span style={{ color: '#475569', fontSize: '0.78rem' }}>(wagered ${w.wagered.toLocaleString()})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
