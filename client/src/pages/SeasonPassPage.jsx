import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getBalance, setBalanceFromServer } from '../utils/casinoBalance';
import './SeasonPassPage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

const fmt = (n) => '$' + Math.floor(n || 0).toLocaleString();

function ms2days(ms) {
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return `${d}d ${h}h`;
}

export default function SeasonPassPage() {
  const { token, isLoggedIn } = useAuth();
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/season-pass`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = await r.json();
      if (d.ok) setStatus(d);
    } catch {}
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function upgrade() {
    if (busy) return;
    if (!window.confirm(`Upgrade to Premium for ${fmt(status.premiumCost)}?`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/season-pass/upgrade`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok) {
        setBalanceFromServer(d.balance);
        setMsg('💎 Premium activated! All premium rewards unlocked.');
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  async function claim(tier, track) {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`${SERVER_URL}/api/season-pass/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier, track }),
      });
      const d = await r.json();
      if (d.ok) {
        if (d.balance) setBalanceFromServer(d.balance);
        setMsg(`✅ Claimed T${d.tier} (${d.track}): ${d.reward.label}`);
        refresh();
      } else setMsg(`❌ ${d.error}`);
    } catch { setMsg('❌ Error'); }
    setBusy(false);
  }

  if (!status) {
    return (
      <div className="sp-page">
        <div className="sp-header">
          <Link to="/" className="sp-back">← Home</Link>
          <div className="sp-title">🎫 Season Pass</div>
        </div>
        <div className="sp-loading">Loading…</div>
      </div>
    );
  }

  const you = status.you;
  const tiers = status.tiers;
  const pct = you ? Math.min(100, (you.xp / (tiers.length * status.season.endsAt ? 1 : 1) )) : 0;
  const curTier = you?.currentTier || 0;
  const nextTier = Math.min(tiers.length, curTier + 1);
  const xpForNext = nextTier <= tiers.length ? tiers[nextTier - 1].xpRequired : tiers[tiers.length - 1].xpRequired;
  const xpForCur  = curTier > 0 ? tiers[curTier - 1].xpRequired : 0;
  const tierPct = you ? Math.min(100, ((you.xp - xpForCur) / (xpForNext - xpForCur)) * 100) : 0;

  const isClaimed = (tier, track) => you?.claimed.includes(`${tier}:${track}`);
  const canClaim  = (tier, track) => you && tier <= curTier && !isClaimed(tier, track) && (track === 'free' || you.premium);

  return (
    <div className="sp-page">
      <div className="sp-header">
        <Link to="/" className="sp-back">← Home</Link>
        <div className="sp-title">🎫 Season Pass</div>
        {isLoggedIn && <div className="sp-bal">Balance: <b>{fmt(getBalance())}</b></div>}
      </div>

      <div className="sp-hero">
        <div className="sp-hero-left">
          <div className="sp-hero-season">{status.season.name}</div>
          <div className="sp-hero-time">⏰ Ends in {ms2days(status.season.timeLeftMs)}</div>
        </div>
        {you && (
          <div className="sp-hero-right">
            <div className="sp-hero-tier">Tier <b>{curTier}</b> / {tiers.length}</div>
            <div className="sp-progress">
              <div className="sp-progress-bar" style={{ width: `${tierPct}%` }} />
              <span className="sp-progress-label">
                {(you.xp - xpForCur).toLocaleString()} / {(xpForNext - xpForCur).toLocaleString()} SXP
              </span>
            </div>
            <div className="sp-hero-hint">Earn 1 SXP per $100 wagered</div>
          </div>
        )}
      </div>

      {isLoggedIn && you && !you.premium && (
        <div className="sp-upgrade-banner">
          <div className="sp-upgrade-text">
            <div className="sp-upgrade-title">✨ Unlock Premium Track</div>
            <div className="sp-upgrade-sub">Massive rewards, legendary boxes, exclusive titles.</div>
          </div>
          <button className="gv-btn gv-btn--gold" disabled={busy} onClick={upgrade}>
            💎 Upgrade {fmt(status.premiumCost)}
          </button>
        </div>
      )}

      {msg && <div className="sp-msg">{msg}</div>}

      <div className="sp-track-labels">
        <div className="sp-track-label sp-track-label--premium">💎 PREMIUM</div>
        <div className="sp-track-label sp-track-label--free">🎁 FREE</div>
      </div>

      <div className="sp-track">
        {tiers.map(t => (
          <div key={t.tier} className={`sp-tier ${curTier >= t.tier ? 'sp-tier--reached' : ''}`}>
            <div className={`sp-reward sp-reward--premium ${canClaim(t.tier, 'premium') ? 'sp-reward--claimable' : ''}`}>
              <div className="sp-reward-label">{t.premium.label}</div>
              {you && (
                isClaimed(t.tier, 'premium') ? <div className="sp-reward-claimed">✓ Claimed</div>
                : canClaim(t.tier, 'premium') ? <button className="gv-btn gv-btn--gold" disabled={busy} onClick={() => claim(t.tier, 'premium')}>Claim</button>
                : !you.premium ? <div className="sp-reward-locked">🔒 Premium</div>
                : <div className="sp-reward-locked">Locked</div>
              )}
            </div>
            <div className="sp-tier-num">
              <div className="sp-tier-badge">{t.tier}</div>
              <div className="sp-tier-xp">{t.xpRequired.toLocaleString()}</div>
            </div>
            <div className={`sp-reward sp-reward--free ${canClaim(t.tier, 'free') ? 'sp-reward--claimable' : ''}`}>
              <div className="sp-reward-label">{t.free.label}</div>
              {you && (
                isClaimed(t.tier, 'free') ? <div className="sp-reward-claimed">✓ Claimed</div>
                : canClaim(t.tier, 'free') ? <button className="gv-btn gv-btn--gold" disabled={busy} onClick={() => claim(t.tier, 'free')}>Claim</button>
                : <div className="sp-reward-locked">Locked</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
