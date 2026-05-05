import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './NavMenu.css';

/**
 * Compact site nav. Replaces the previous wall of 30+ pill buttons with:
 *   - 4 highlight pills (CASES, JOKERS, Tournaments, Leaderboard)
 *   - one "More ▾" dropdown with everything else, grouped by section
 *
 * Conditional links (logged-in only, champion-only, admin-only) get filtered
 * before render so the menu doesn't show empty rows.
 */
export default function NavMenu({ isLoggedIn, isAdmin, isChampion }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Sections — each row is [path, emoji, label, optional condition]
  // Conditions: 'auth' = requires login, 'admin' = admin only, 'champion' = champion only.
  const sections = [
    {
      title: 'Play',
      items: [
        ['/daily-spin',   '🎡', 'Daily Spin'],
        ['/lottery',      '🎟️', 'Lottery'],
        ['/wager-race',   '🏁', 'Wager Race'],
        ['/pvp',          '🪙', 'PvP Flip'],
        ['/duels',        '⚔️', 'Duels'],
        ['/trivia',       '🎯', 'Trivia'],
        ['/predictions',  '🔮', 'Predictions'],
        ['/meme-coins',   '🚀', 'Meme Coins'],
      ],
    },
    {
      title: 'Markets',
      items: [
        ['/auction', '🏛️', 'Auction'],
        ['/trading', '🤝', 'Trade',   'auth'],
        ['/crypto',  '📈', 'Crypto',  'auth'],
        ['/bank',    '🏦', 'Bank',    'auth'],
      ],
    },
    {
      title: 'Progress',
      items: [
        ['/vip',                '👑', 'VIP'],
        ['/joker-leaderboard',  '🃏', 'Joker Ranks'],
        ['/achievements',       '🏅', 'Achievements'],
        ['/prestige',           '⭐', 'Prestige', 'auth'],
        ['/titles',             '🏷️', 'Titles',   'auth'],
        ['/season-pass',        '🎫', 'Season Pass'],
        ['/boost',              '🚀', 'Boost',    'auth'],
        ['/win-streaks',        '🔥', 'Streaks'],
        ['/pets',               '🐾', 'Pets',     'auth'],
        ['/factory',            '🏭', 'Factory',  'auth'],
      ],
    },
    {
      title: 'Stats & Account',
      items: [
        ['/leaderboard',  '🏆', 'Leaderboard'],
        ['/stats',        '📊', 'Stats'],
        ['/house-stats',  '🏛️', 'House Stats'],
        ['/transactions', '📜', 'History',   'auth'],
        ['/profile',      '👤', 'Profile',   'auth'],
        ['/search',       '🔍', 'Search'],
        ['/redeem',       '🎁', 'Redeem'],
      ],
    },
  ];

  function passes(cond) {
    if (!cond) return true;
    if (cond === 'auth')     return isLoggedIn;
    if (cond === 'admin')    return isAdmin;
    if (cond === 'champion') return isChampion;
    return true;
  }

  return (
    <>
      {/* Highlight pills — always on the bar */}
      <Link to="/cases" className="navmenu-pill navmenu-pill--cases">
        <span className="navmenu-pill-emoji">📦</span>
        <span>CASES</span>
      </Link>
      <Link to="/jokers" className="navmenu-pill navmenu-pill--jokers">
        <span className="navmenu-pill-emoji">🃏</span>
        <span>JOKERS</span>
      </Link>
      <Link to="/tournaments" className="navmenu-pill navmenu-pill--tournaments">
        <span className="navmenu-pill-emoji">🏆</span>
        <span>Tournaments</span>
      </Link>
      <Link to="/leaderboard" className="navmenu-pill navmenu-pill--leaderboard">
        <span className="navmenu-pill-emoji">📈</span>
        <span>Leaders</span>
      </Link>

      {/* More dropdown */}
      <div className="navmenu-wrap" ref={ref}>
        <button
          className={`navmenu-trigger${open ? ' navmenu-trigger--open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          <span>☰ More</span>
          <span className="navmenu-trigger-caret">▾</span>
        </button>

        {open && (
          <div className="navmenu-panel" role="menu">
            <div className="navmenu-grid">
              {sections.map(sec => {
                const visible = sec.items.filter(it => passes(it[3]));
                if (visible.length === 0) return null;
                return (
                  <div key={sec.title} className="navmenu-col">
                    <div className="navmenu-col-title">{sec.title}</div>
                    {visible.map(([to, emoji, label]) => (
                      <Link key={to} to={to} className="navmenu-item" onClick={() => setOpen(false)}>
                        <span className="navmenu-item-emoji">{emoji}</span>
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Conditional one-offs — kept separate so they're prominent */}
      {isChampion && (
        <Link to="/champion-panel" className="navmenu-pill navmenu-pill--champion">
          <span className="navmenu-pill-emoji">👑</span>
          <span>Champion</span>
        </Link>
      )}
      {isAdmin && (
        <Link to="/admin" className="navmenu-pill navmenu-pill--admin">
          <span className="navmenu-pill-emoji">🛡️</span>
          <span>Admin</span>
        </Link>
      )}
    </>
  );
}
