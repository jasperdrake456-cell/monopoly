import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './VIPPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export default function VIPPage() {
  const { user, token } = useAuth();
  const [vip, setVip] = useState(null);
  const [tiers, setTiers] = useState([]);

  useEffect(() => {
    // /api/vip/tiers route must be fetched after auth routes; server has it ordered correctly
    if (user && token) {
      // Get personal VIP status
      fetch(`${SERVER_URL}/api/vip`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(d => { if (d.ok) setVip(d.vip); });
    }
    // Fetch tiers list (public, no auth needed)
    fetch(`${SERVER_URL}/api/vip/tiers`).then(r => r.json()).then(d => {
      if (d.ok && d.tiers) setTiers(d.tiers);
    });
  }, [user, token]);

  return (
    <div className="vip-page">
      <div className="vip-hero">
        <div className="vip-hero-icon">👑</div>
        <div>
          <h1 className="vip-hero-title">VIP Status</h1>
          <p className="vip-hero-sub">Wager more to unlock exclusive perks and bonuses</p>
        </div>
      </div>

      {/* My status */}
      {user && vip && (
        <div className="vip-my-status" style={{ '--tier-color': vip.color }}>
          <div className="vip-my-icon">{vip.icon}</div>
          <div className="vip-my-info">
            <div className="vip-my-tier-name">{vip.name}</div>
            <div className="vip-my-wagered">Total wagered: <strong>${vip.totalWagered?.toLocaleString()}</strong></div>
            {vip.toNext != null ? (
              <>
                <div className="vip-progress-bar">
                  <div className="vip-progress-fill" style={{ width: `${vip.progress}%` }} />
                </div>
                <div className="vip-to-next">${vip.toNext?.toLocaleString()} more to {vip.nextTier?.name}</div>
              </>
            ) : (
              <div className="vip-maxed">🏆 Maximum tier reached!</div>
            )}
          </div>
        </div>
      )}
      {!user && (
        <div className="vip-login-prompt">
          Log in to see your VIP status
        </div>
      )}

      {/* Tiers grid */}
      <h3 className="vip-tiers-heading">All VIP Tiers</h3>
      <div className="vip-tiers">
        {tiers.map(t => {
          const isActive = vip?.tier === t.tier;
          const isPast   = vip && vip.tier > t.tier;
          return (
            <div
              key={t.tier}
              className={`vip-tier-card ${isActive ? 'vip-tier-card--active' : ''} ${isPast ? 'vip-tier-card--past' : ''}`}
              style={{ '--tc': t.color }}
            >
              {isActive && <div className="vip-you-here">YOUR TIER</div>}
              <div className="vip-tier-icon">{t.icon}</div>
              <div className="vip-tier-name">{t.name}</div>
              <div className="vip-tier-req">
                {t.minWagered === 0 ? 'Default' : `Wager $${t.minWagered.toLocaleString()}+`}
              </div>
              {t.perks.length === 0 ? (
                <div className="vip-tier-perk" style={{ color: '#475569' }}>No special perks</div>
              ) : (
                t.perks.map((p, i) => (
                  <div key={i} className="vip-tier-perk">✓ {p}</div>
                ))
              )}
              {t.dailySpinBonus > 0 && (
                <div className="vip-tier-bonus">🎯 +${t.dailySpinBonus.toLocaleString()} daily spin</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
