import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import XPBadge from '../components/XPBadge';
import DailyMissions from '../components/DailyMissions';
import './ProfilePage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function ProfilePage() {
  const { username: paramUser } = useParams();
  const { user, token, isLoggedIn } = useAuth();
  const targetUser = paramUser || user?.username;
  const isOwnProfile = !paramUser || paramUser.toLowerCase() === user?.username?.toLowerCase();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');

  useEffect(() => {
    if (!targetUser) return;
    fetch(`${SERVER_URL}/api/xp/profile/${targetUser}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setProfile(d.profile); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [targetUser]);

  if (loading) return <div className="profile-loading">Loading…</div>;
  if (!profile) return <div className="profile-loading">Player not found.</div>;

  const { levelInfo, achievementDetails, totalWagered, totalWins, winStreak, bestStreak, gamesPlayed, xp: totalXp } = profile;
  const uniqueGames = Object.keys(gamesPlayed || {}).length;
  const totalBets   = Object.values(gamesPlayed || {}).reduce((s, c) => s + c, 0);
  const topGame     = Object.entries(gamesPlayed || {}).sort((a, b) => b[1] - a[1])[0];

  const nextXp     = levelInfo.nextLevel?.xp;
  const curLvlXp   = levelInfo.xp - (levelInfo.xp - (levelInfo.progress / 100) * (nextXp - levelInfo.xp || 1));

  return (
    <div className="profile-page">
      {/* Header card */}
      <div className="profile-hero" style={{ '--level-color': levelInfo.color }}>
        <div className="profile-hero-avatar">
          {targetUser?.[0]?.toUpperCase()}
        </div>
        <div className="profile-hero-info">
          <div className="profile-hero-name">{targetUser}</div>
          <div className="profile-hero-badge">
            <XPBadge level={levelInfo.level} levelName={levelInfo.name} icon={levelInfo.icon} color={levelInfo.color} />
            <span className="profile-hero-level-name">{levelInfo.name}</span>
          </div>
          <div className="profile-hero-xp">
            <div className="profile-xp-bar-wrap">
              <div className="profile-xp-bar">
                <div className="profile-xp-bar-fill" style={{ width: `${levelInfo.progress}%`, background: levelInfo.color }} />
              </div>
              <span className="profile-xp-label">
                {totalXp.toLocaleString()} XP
                {levelInfo.xpToNext != null && ` · ${levelInfo.xpToNext.toLocaleString()} to Lv.${levelInfo.level + 1}`}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-hero-achievements">
          <span className="profile-achiev-count">{achievementDetails.length}</span>
          <span className="profile-achiev-label">Achievements</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {['overview', 'achievements', ...(isOwnProfile && isLoggedIn ? ['missions'] : [])].map(t => (
          <button key={t} className={`profile-tab ${tab === t ? 'profile-tab--active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? '📊 Overview' : t === 'achievements' ? '🏆 Achievements' : '📋 Missions'}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="profile-stats-grid">
          <StatCard icon="💸" label="Total Wagered" value={`$${(totalWagered || 0).toLocaleString()}`} />
          <StatCard icon="✅" label="Total Wins"    value={(totalWins || 0).toLocaleString()} />
          <StatCard icon="🎮" label="Total Bets"    value={totalBets.toLocaleString()} />
          <StatCard icon="🗺️" label="Games Played"  value={`${uniqueGames} unique`} />
          <StatCard icon="🔥" label="Current Streak" value={`${winStreak || 0} W`} />
          <StatCard icon="⚡" label="Best Streak"   value={`${bestStreak || 0} W`} />
          {topGame && <StatCard icon="🥇" label="Favourite Game" value={topGame[0]} sub={`${topGame[1]} bets`} />}
          <StatCard icon="🌟" label="XP Earned"     value={totalXp.toLocaleString()} />
        </div>
      )}

      {/* Achievements */}
      {tab === 'achievements' && (
        <div className="profile-achievements">
          {achievementDetails.length === 0 && (
            <div className="profile-empty">No achievements yet — keep playing!</div>
          )}
          {achievementDetails.map(a => (
            <div key={a.id} className="profile-achiev-card">
              <div className="profile-achiev-icon">{a.icon}</div>
              <div className="profile-achiev-body">
                <div className="profile-achiev-name">{a.name}</div>
                <div className="profile-achiev-desc">{a.desc}</div>
              </div>
              <div className="profile-achiev-xp">+{a.xpReward?.toLocaleString()} XP</div>
              <div className="profile-achiev-date">
                {a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missions (own profile only) */}
      {tab === 'missions' && isOwnProfile && isLoggedIn && (
        <DailyMissions token={token} />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
