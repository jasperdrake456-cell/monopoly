import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './JokersPage.css';

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

export default function JokersPage() {
  const { token, balance } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [rarities, setRarities] = useState({});
  const [cratePrice, setCratePrice] = useState(1_000_000);
  const [maxEquipped, setMaxEquipped] = useState(3);
  const [inventory, setInventory] = useState({ owned: [], equipped: [], abilities: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [pullResult, setPullResult] = useState(null);
  const [view, setView] = useState('inventory'); // 'inventory' | 'catalog'

  // Fetch catalog + inventory
  const refresh = useCallback(async () => {
    try {
      const cat = await fetch(`${SERVER_URL}/api/jokers/catalog`).then(r => r.json());
      if (cat.ok) {
        setCatalog(cat.jokers);
        setRarities(cat.rarities);
        setCratePrice(cat.cratePrice);
        setMaxEquipped(cat.maxEquipped);
      }
      if (token) {
        const inv = await fetch(`${SERVER_URL}/api/jokers/inventory`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(r => r.json());
        if (inv.ok) {
          setInventory({ owned: inv.owned, equipped: inv.equipped, abilities: inv.abilities });
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  async function openCrate() {
    if (opening) return;
    setError('');
    setPullResult(null);
    if (!token) { setError('Log in to open crates'); return; }
    if ((balance || 0) < cratePrice) { setError(`Need ${fmt(cratePrice)} to open a Joker Crate`); return; }
    setOpening(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/jokers/crate/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const d = await res.json();
      if (!d.ok) { setError(d.error || 'Crate failed'); setOpening(false); return; }
      // delay reveal ~2.4s for suspense
      setTimeout(async () => {
        setPullResult(d.joker);
        setOpening(false);
        await refresh();
        const tier = d.joker.rarity;
        if (['epic', 'legendary', 'mythic'].includes(tier)) burstConfetti(tier);
      }, 2400);
    } catch (e) {
      setError('Network error');
      setOpening(false);
    }
  }

  async function equip(instanceId) {
    setError('');
    try {
      const d = await fetch(`${SERVER_URL}/api/jokers/equip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instanceId }),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error); return; }
      await refresh();
    } catch { setError('Network error'); }
  }
  async function unequip(instanceId) {
    try {
      await fetch(`${SERVER_URL}/api/jokers/unequip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instanceId }),
      });
      await refresh();
    } catch { setError('Network error'); }
  }

  if (loading) return <div className="jkr-loading">Loading…</div>;

  const equippedOwned = inventory.owned.filter(o => inventory.equipped.includes(o.instanceId));
  const unequippedOwned = inventory.owned.filter(o => !inventory.equipped.includes(o.instanceId));

  return (
    <div className="jkr-page">
      <div className="jkr-header">
        <Link to="/" className="jkr-back">← Home</Link>
        <div className="jkr-title">
          <span className="jkr-title-emoji">🃏</span>
          <h1>Jokers</h1>
        </div>
        <div className="jkr-balance">💰 {fmt(balance)}</div>
      </div>

      <div className="jkr-hero">
        <div className="jkr-hero-text">
          <h2>Collect. Equip. Dominate.</h2>
          <p>Pull Jokers from Crates. Equip up to <strong>{maxEquipped}</strong> for passive bonuses in every game. Sell on the auction house or trade with friends.</p>
        </div>
        <div className="jkr-hero-actions">
          <button className="jkr-open-btn" onClick={openCrate} disabled={opening || (balance || 0) < cratePrice}>
            {opening ? '🃏 Opening…' : `🎁 Open Joker Crate (${fmt(cratePrice)})`}
          </button>
          <div className="jkr-hero-links">
            <Link to="/auction" className="jkr-secondary-btn">🏛️ Auction House</Link>
            <Link to="/trading" className="jkr-secondary-btn">🤝 Trading</Link>
          </div>
        </div>
      </div>

      {error && <div className="jkr-error">{error}</div>}

      {/* Opening animation */}
      {opening && (
        <div className="jkr-opening-overlay">
          <div className="jkr-opening-box">
            <div className="jkr-opening-emoji">🎁</div>
            <div className="jkr-opening-label">Opening Joker Crate…</div>
          </div>
        </div>
      )}

      {/* Pull result modal */}
      {pullResult && (() => {
        const rs = rarityStyle(rarities, pullResult.rarity);
        return (
          <div className="jkr-pull-overlay" onClick={() => setPullResult(null)}>
            <div className="jkr-pull-card" style={{ boxShadow: `0 0 60px ${rs.glow}` }} onClick={e => e.stopPropagation()}>
              <div className="jkr-pull-rarity" style={{ color: rs.color, textShadow: `0 0 12px ${rs.glow}` }}>{rs.label}</div>
              <div className="jkr-pull-emoji">{pullResult.emoji}</div>
              <div className="jkr-pull-name" style={{ color: rs.color }}>{pullResult.name}</div>
              <div className="jkr-pull-desc">{pullResult.description}</div>
              <div className="jkr-pull-value">{fmt(pullResult.baseValue)} base value</div>
              <button className="jkr-pull-close" onClick={() => setPullResult(null)}>Sweet</button>
            </div>
          </div>
        );
      })()}

      {/* Equipped slots */}
      <div className="jkr-section">
        <h3>⚡ Equipped ({equippedOwned.length}/{maxEquipped})</h3>
        <div className="jkr-slots">
          {Array.from({ length: maxEquipped }).map((_, i) => {
            const owned = equippedOwned[i];
            if (!owned) {
              return (
                <div key={i} className="jkr-slot jkr-slot-empty">
                  <div className="jkr-slot-empty-icon">＋</div>
                  <div>Empty slot</div>
                </div>
              );
            }
            const rs = rarityStyle(rarities, owned.def.rarity);
            return (
              <div key={owned.instanceId} className="jkr-slot jkr-slot-filled" style={{ borderColor: rs.color, boxShadow: `0 0 18px ${rs.glow}` }}>
                <div className="jkr-slot-emoji">{owned.def.emoji}</div>
                <div className="jkr-slot-name" style={{ color: rs.color }}>{owned.def.name}</div>
                <div className="jkr-slot-desc">{owned.def.description}</div>
                <button className="jkr-unequip-btn" onClick={() => unequip(owned.instanceId)}>Unequip</button>
              </div>
            );
          })}
        </div>
        {Object.keys(inventory.abilities).length > 0 && (
          <div className="jkr-bonuses">
            <strong>Active bonuses: </strong>
            {inventory.abilities.payoutMultiplier > 0 && <span className="jkr-bonus-pill">+{(inventory.abilities.payoutMultiplier * 100).toFixed(0)}% payouts</span>}
            {inventory.abilities.luckBoost > 0        && <span className="jkr-bonus-pill">+{(inventory.abilities.luckBoost * 100).toFixed(0)}% luck</span>}
            {inventory.abilities.cashbackPct > 0      && <span className="jkr-bonus-pill">{(inventory.abilities.cashbackPct * 100).toFixed(0)}% cashback</span>}
            {inventory.abilities.xpMultiplier > 0     && <span className="jkr-bonus-pill">+{(inventory.abilities.xpMultiplier * 100).toFixed(0)}% XP</span>}
            {inventory.abilities.crateDiscountPct > 0 && <span className="jkr-bonus-pill">{(inventory.abilities.crateDiscountPct * 100).toFixed(0)}% crate disc.</span>}
            {inventory.abilities.jackpotChance > 0    && <span className="jkr-bonus-pill">{(inventory.abilities.jackpotChance * 100).toFixed(1)}% jackpot</span>}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="jkr-tabs">
        <button className={`jkr-tab ${view === 'inventory' ? 'jkr-tab-active' : ''}`} onClick={() => setView('inventory')}>
          🎒 My Collection ({inventory.owned.length})
        </button>
        <button className={`jkr-tab ${view === 'catalog' ? 'jkr-tab-active' : ''}`} onClick={() => setView('catalog')}>
          📖 Catalog ({catalog.length})
        </button>
      </div>

      {view === 'inventory' && (
        <div className="jkr-grid">
          {unequippedOwned.length === 0 && equippedOwned.length === 0 && (
            <div className="jkr-empty">No jokers yet — open a crate above to get started!</div>
          )}
          {unequippedOwned.map(o => (
            <JokerCard
              key={o.instanceId}
              def={o.def}
              rarities={rarities}
              instanceId={o.instanceId}
              marketValue={o.marketValue}
              onEquip={() => equip(o.instanceId)}
              owned
              equippedCount={inventory.equipped.length}
              maxEquipped={maxEquipped}
            />
          ))}
        </div>
      )}

      {view === 'catalog' && (
        <div className="jkr-grid">
          {catalog.map(j => (
            <JokerCard
              key={j.id}
              def={j}
              rarities={rarities}
              marketValue={j.marketValue}
              odds={j.odds}
              catalog
            />
          ))}
        </div>
      )}
    </div>
  );
}

function JokerCard({ def, rarities, instanceId, marketValue, onEquip, owned, catalog, odds, equippedCount, maxEquipped }) {
  const rs = rarityStyle(rarities, def.rarity);
  return (
    <div className="jkr-card" style={{ borderColor: rs.color, boxShadow: `0 0 12px ${rs.glow}` }}>
      <div className="jkr-card-rarity" style={{ color: rs.color }}>{rs.label}</div>
      <div className="jkr-card-emoji">{def.emoji}</div>
      <div className="jkr-card-name" style={{ color: rs.color }}>{def.name}</div>
      <div className="jkr-card-desc">{def.description}</div>
      <div className="jkr-card-stats">
        <div>Base: <strong>{fmt(def.baseValue)}</strong></div>
        <div>Market: <strong style={{ color: marketValue > def.baseValue ? '#4ade80' : marketValue < def.baseValue ? '#fca5a5' : '#fff' }}>{fmt(marketValue || def.baseValue)}</strong></div>
        {catalog && odds !== undefined && (
          <div className="jkr-card-odds">Pull odds: {(odds * 100).toFixed(odds < 0.005 ? 3 : 2)}%</div>
        )}
      </div>
      {owned && (
        <button className="jkr-card-equip" onClick={onEquip} disabled={equippedCount >= maxEquipped}>
          {equippedCount >= maxEquipped ? 'Equip slots full' : 'Equip'}
        </button>
      )}
    </div>
  );
}

function burstConfetti(tier) {
  const colors = tier === 'mythic'
    ? ['#f472b6', '#fbbf24', '#c084fc', '#60a5fa', '#fff']
    : tier === 'legendary'
      ? ['#fbbf24', '#fde047', '#fff', '#f59e0b']
      : ['#c084fc', '#a78bfa', '#fff'];
  const container = document.createElement('div');
  container.className = 'jkr-confetti';
  document.body.appendChild(container);
  const count = tier === 'mythic' ? 180 : tier === 'legendary' ? 120 : 60;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'jkr-confetti-piece';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (1.8 + Math.random() * 2.4) + 's';
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 5000);
}
