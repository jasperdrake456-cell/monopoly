import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './RequireAuth.css';

export default function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth();
  if (isLoggedIn) return children;

  return (
    <div className="ra-wall">
      <div className="ra-card">
        <div className="ra-lock">🔒</div>
        <div className="ra-title">Sign In to Play</div>
        <div className="ra-sub">You need a Game Vault account to play this game.</div>
        <div className="ra-perks">
          <div className="ra-perk">💰 Start with <strong>$2,000</strong> casino balance</div>
          <div className="ra-perk">🎁 <strong>$250 daily</strong> reward</div>
          <div className="ra-perk">🏆 Save scores to the leaderboard</div>
        </div>
        <div className="ra-btns">
          <Link to="/auth" className="ra-btn ra-btn--primary">Sign In</Link>
          <Link to="/auth" className="ra-btn">Create Account</Link>
        </div>
        <Link to="/" className="ra-back">← Game Vault</Link>
      </div>
    </div>
  );
}
