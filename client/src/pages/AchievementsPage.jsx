import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AchievementsPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const ALL_ACHIEVEMENTS = [
  { id: 'first_bet',    name: 'First Steps',      desc: 'Place your first bet',                      icon: '🎯', xpReward: 50,    category: 'Betting' },
  { id: 'bet_1k',       name: 'Getting Started',  desc: 'Wager $1,000 total',                        icon: '💸', xpReward: 100,   category: 'Betting' },
  { id: 'bet_100k',     name: 'Big Spender',       desc: 'Wager $100,000 total',                      icon: '🤑', xpReward: 500,   category: 'Betting' },
  { id: 'bet_1m',       name: 'High Roller',       desc: 'Wager $1,000,000 total',                    icon: '🎰', xpReward: 2000,  category: 'Betting' },
  { id: 'bet_10m',      name: 'Whale',             desc: 'Wager $10,000,000 total',                   icon: '🐋', xpReward: 10000, category: 'Betting' },
  { id: 'first_win',    name: "Beginner's Luck",   desc: 'Win your first bet',                        icon: '🍀', xpReward: 75,    category: 'Wins' },
  { id: 'win_10',       name: 'On a Roll',         desc: 'Win 10 bets',                               icon: '🎲', xpReward: 200,   category: 'Wins' },
  { id: 'win_100',      name: 'Consistent',        desc: 'Win 100 bets',                              icon: '📈', xpReward: 1000,  category: 'Wins' },
  { id: 'win_500',      name: 'Unstoppable',       desc: 'Win 500 bets',                              icon: '🔥', xpReward: 5000,  category: 'Wins' },
  { id: 'streak_3',     name: 'Hot Streak',        desc: 'Win 3 bets in a row',                       icon: '🌶️', xpReward: 150,   category: 'Streaks' },
  { id: 'streak_5',     name: 'Heater',            desc: 'Win 5 bets in a row',                       icon: '🔥', xpReward: 400,   category: 'Streaks' },
  { id: 'streak_10',    name: 'Unstoppable',       desc: 'Win 10 bets in a row',                      icon: '⚡', xpReward: 2000,  category: 'Streaks' },
  { id: 'bigwin_5x',    name: 'Multiplier',        desc: 'Win with a 5× multiplier or higher',        icon: '✨', xpReward: 200,   category: 'Big Wins' },
  { id: 'bigwin_10x',   name: 'Jackpot Hunter',    desc: 'Win with a 10× multiplier or higher',       icon: '💥', xpReward: 500,   category: 'Big Wins' },
  { id: 'bigwin_50x',   name: 'Legendary',         desc: 'Win with a 50× multiplier or higher',       icon: '💎', xpReward: 2000,  category: 'Big Wins' },
  { id: 'bigwin_100x',  name: 'Godlike',           desc: 'Win with a 100× multiplier or higher',      icon: '👑', xpReward: 10000, category: 'Big Wins' },
  { id: 'profit_50k',   name: 'Profit King',       desc: 'Win $50,000 profit in one bet',             icon: '💰', xpReward: 1000,  category: 'Big Wins' },
  { id: 'profit_500k',  name: 'Millionaire',       desc: 'Win $500,000 profit in one bet',            icon: '🏦', xpReward: 5000,  category: 'Big Wins' },
  { id: 'games_5',      name: 'Explorer',          desc: 'Play 5 different games',                    icon: '🗺️', xpReward: 300,   category: 'Explorer' },
  { id: 'games_10',     name: 'Gamer',             desc: 'Play 10 different games',                   icon: '🎮', xpReward: 750,   category: 'Explorer' },
  { id: 'games_all',    name: 'Completionist',     desc: 'Play every game on the site',               icon: '🏅', xpReward: 5000,  category: 'Explorer' },
  { id: 'level_5',      name: 'Rising Star',       desc: 'Reach level 5 (Shark)',                     icon: '🦈', xpReward: 500,   category: 'Levels' },
  { id: 'level_10',     name: 'Legend',            desc: 'Reach max level 10 (God)',                  icon: '👑', xpReward: 50000, category: 'Levels' },
  { id: 'spin_7',       name: 'Daily Devotee',     desc: 'Claim daily spin 7 days in a row',          icon: '🎡', xpReward: 500,   category: 'Daily' },
  { id: 'spin_30',      name: 'Loyal',             desc: 'Claim daily spin 30 days in a row',         icon: '📅', xpReward: 3000,  category: 'Daily' },
  { id: 'jackpot',      name: 'Jackpot!',          desc: 'Win the slots jackpot',                     icon: '🎰', xpReward: 20000, category: 'Special' },
  { id: 'parlay_win',   name: 'Parlay Pro',        desc: 'Win a sports parlay bet',                   icon: '🏆', xpReward: 1000,  category: 'Special' },
  { id: 'comeback',     name: 'Comeback Kid',      desc: 'Win after having $0 in balance',            icon: '🔄', xpReward: 750,   category: 'Special' },
];

const CATEGORIES = ['All', 'Betting', 'Wins', 'Streaks', 'Big Wins', 'Explorer', 'Levels', 'Daily', 'Special'];

export default function AchievementsPage() {
  const { token, isLoggedIn } = useAuth();
  const [profile,  setProfile]  = useState(null);
  const [category, setCategory] = useState('All');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${SERVER_URL}/api/xp/profile`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setProfile(d.profile); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const unlockedIds = new Set((profile?.achievements || []).map(a => a.id || a));
  const filtered = category === 'All' ? ALL_ACHIEVEMENTS : ALL_ACHIEVEMENTS.filter(a => a.category === category);
  const unlocked = filtered.filter(a => unlockedIds.has(a.id));
  const locked   = filtered.filter(a => !unlockedIds.has(a.id));

  return (
    <div className="ach-page">
      <div className="ach-header">
        <Link to="/" className="ach-back">← Home</Link>
        <h1 className="ach-title">🏅 Achievements</h1>
        {isLoggedIn && profile && (
          <div className="ach-summary">
            <span className="ach-count">{unlockedIds.size}/{ALL_ACHIEVEMENTS.length}</span>
            <span className="ach-count-label"> unlocked</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isLoggedIn && profile && (
        <div className="ach-progress-wrap">
          <div className="ach-progress-bar" style={{ width: `${Math.floor((unlockedIds.size / ALL_ACHIEVEMENTS.length) * 100)}%` }} />
        </div>
      )}

      {/* Category tabs */}
      <div className="ach-tabs">
        {CATEGORIES.map(c => (
          <button key={c}
            className={`ach-tab ${category === c ? 'ach-tab--active' : ''}`}
            onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      {loading ? (
        <div className="ach-loading">Loading…</div>
      ) : (
        <>
          {unlocked.length > 0 && (
            <div className="ach-group">
              <div className="ach-group-title">✅ Unlocked ({unlocked.length})</div>
              <div className="ach-grid">
                {unlocked.map(a => (
                  <div key={a.id} className="ach-card ach-card--unlocked">
                    <div className="ach-card-icon">{a.icon}</div>
                    <div className="ach-card-body">
                      <div className="ach-card-name">{a.name}</div>
                      <div className="ach-card-desc">{a.desc}</div>
                      <div className="ach-card-xp">+{a.xpReward.toLocaleString()} XP</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {locked.length > 0 && (
            <div className="ach-group">
              <div className="ach-group-title">🔒 Locked ({locked.length})</div>
              <div className="ach-grid">
                {locked.map(a => (
                  <div key={a.id} className="ach-card ach-card--locked">
                    <div className="ach-card-icon">{a.icon}</div>
                    <div className="ach-card-body">
                      <div className="ach-card-name">{a.name}</div>
                      <div className="ach-card-desc">{a.desc}</div>
                      <div className="ach-card-xp">+{a.xpReward.toLocaleString()} XP</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isLoggedIn && (
            <div className="ach-login-note">
              <Link to="/auth">Log in</Link> to track your achievements
            </div>
          )}
        </>
      )}
    </div>
  );
}
