import React from 'react';
import { Link } from 'react-router-dom';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { GAME_BY_SLUG } from '../utils/gameList';
import './GameGuard.css';

/**
 * Wraps a game page. Shows a maintenance or testing-mode screen when:
 *   - the game's slug is in closedGames   (and user is not admin)
 *   - the game's slug is in testingGames  (and user is not admin / approved tester)
 * Admins always bypass both gates.
 */
export default function GameGuard({ slug, children }) {
  const { closedGames, testingGames, approvedTesters } = useSiteConfig();
  const { user, isAdmin } = useAuth();

  // Admins always pass through
  if (isAdmin) return children;

  const gameName = GAME_BY_SLUG[slug]?.name ?? slug;

  // Per-game testing mode gate
  if (testingGames.includes(slug)) {
    const username = user?.username?.toLowerCase() ?? '';
    const allowed  = approvedTesters.map(t => t.toLowerCase()).includes(username);
    if (!allowed) {
      return (
        <div className="gameguard-screen gameguard-testing">
          <div className="gameguard-icon">🔬</div>
          <h1 className="gameguard-title">{gameName} — Testing in Progress</h1>
          <p className="gameguard-sub">
            This game is currently in testing and is only accessible to
            authorised testers. Check back soon!
          </p>
          <Link to="/" className="gameguard-btn">← Back to Hub</Link>
        </div>
      );
    }
  }

  // Game-closed gate
  if (closedGames.includes(slug)) {
    return (
      <div className="gameguard-screen gameguard-closed">
        <div className="gameguard-icon">🔧</div>
        <h1 className="gameguard-title">{gameName} is Temporarily Closed</h1>
        <p className="gameguard-sub">
          This game is currently down for maintenance. It'll be back shortly!
        </p>
        <Link to="/" className="gameguard-btn">← Back to Hub</Link>
      </div>
    );
  }

  return children;
}
