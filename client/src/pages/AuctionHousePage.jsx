import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuctionHousePage.css';

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

export default function AuctionHousePage() {
  const { token, user, balance } = useAuth();
  const [listings, setListings] = useState([]);
  const [myInv, setMyInv] = useState([]);
  const [rarities, setRarities] = useState({});
  const [houseFee, setHouseFee] = useState(0.05);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listingInstance, setListingInstance] = useState(null); // instance to list
  const [listPrice, setListPrice] = useState('');
  const [filter, setFilter] = useState('all'); // all | mine | rarity filter
  const [catalog, setCatalog] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const lst = await fetch(`${SERVER_URL}/api/auction/listings`).then(r => r.json());
      if (lst.ok) {
        setListings(lst.listings);
        setHouseFee(lst.houseFee);
      }
      const cat = await fetch(`${SERVER_URL}/api/jokers/catalog`).then(r => r.json());
      if (cat.ok) { setRarities(cat.rarities); setCatalog(cat.jokers); }
      if (token) {
        const inv = await fetch(`${SERVER_URL}/api/jokers/inventory`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }).then(r => r.json());
        if (inv.ok) setMyInv(inv.owned);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  // Subscribe to socket updates
  useEffect(() => {
    const sock = window.__gameSocket;
    if (!sock) return;
    const onListed = () => refresh();
    const onSold   = () => refresh();
    const onCancel = () => refresh();
    sock.on('auctionListed', onListed);
    sock.on('auctionSold', onSold);
    sock.on('auctionCancelled', onCancel);
    return () => {
      sock.off('auctionListed', onListed);
      sock.off('auctionSold', onSold);
      sock.off('auctionCancelled', onCancel);
    };
  }, [refresh]);

  async function submitListing() {
    setError('');
    const priceN = parseInt(listPrice, 10);
    if (!priceN || priceN <= 0) { setError('Enter a valid price'); return; }
    try {
      const d = await fetch(`${SERVER_URL}/api/auction/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instanceId: listingInstance.instanceId, price: priceN }),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error); return; }
      setListingInstance(null); setListPrice('');
      await refresh();
    } catch { setError('Network error'); }
  }

  async function buy(listingId) {
    setError('');
    if (!token) { setError('Please log in'); return; }
    try {
      const d = await fetch(`${SERVER_URL}/api/auction/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error); return; }
      await refresh();
    } catch { setError('Network error'); }
  }

  async function cancel(listingId) {
    try {
      const d = await fetch(`${SERVER_URL}/api/auction/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error); return; }
      await refresh();
    } catch { setError('Network error'); }
  }

  const filtered = useMemo(() => {
    if (filter === 'all')  return listings;
    if (filter === 'mine') return listings.filter(l => l.seller === user?.username);
    return listings.filter(l => l.joker?.rarity === filter);
  }, [listings, filter, user]);

  // Market snapshot by rarity for top bar
  const marketAvgByRarity = useMemo(() => {
    const byR = {};
    catalog.forEach(j => {
      if (!byR[j.rarity]) byR[j.rarity] = { sum: 0, count: 0 };
      byR[j.rarity].sum += j.marketValue;
      byR[j.rarity].count++;
    });
    return byR;
  }, [catalog]);

  if (loading) return <div className="auc-loading">Loading auction house…</div>;

  return (
    <div className="auc-page">
      <div className="auc-header">
        <Link to="/jokers" className="auc-back">← Jokers</Link>
        <div className="auc-title">
          <span className="auc-title-emoji">🏛️</span>
          <h1>Auction House</h1>
        </div>
        <div className="auc-balance">💰 {fmt(balance)}</div>
      </div>

      <div className="auc-market-bar">
        <span className="auc-market-label">📊 Market avg:</span>
        {['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map(r => {
          if (!marketAvgByRarity[r]) return null;
          const rs = rarityStyle(rarities, r);
          const avg = marketAvgByRarity[r].sum / marketAvgByRarity[r].count;
          return (
            <span key={r} className="auc-market-pill" style={{ borderColor: rs.color, color: rs.color }}>
              {rs.label}: {fmt(avg)}
            </span>
          );
        })}
      </div>

      {error && <div className="auc-error">{error}</div>}

      {/* My jokers to list */}
      {token && myInv.length > 0 && (
        <div className="auc-section">
          <h3>🏷️ List Your Jokers</h3>
          <div className="auc-my-list">
            {myInv.map(o => {
              const rs = rarityStyle(rarities, o.def.rarity);
              return (
                <div key={o.instanceId} className="auc-my-item" style={{ borderColor: rs.color }}>
                  <div className="auc-my-emoji">{o.def.emoji}</div>
                  <div className="auc-my-info">
                    <div className="auc-my-name" style={{ color: rs.color }}>{o.def.name}</div>
                    <div className="auc-my-market">Market: <strong>{fmt(o.marketValue || o.def.baseValue)}</strong></div>
                  </div>
                  <button className="auc-list-btn" onClick={() => { setListingInstance(o); setListPrice(String(o.marketValue || o.def.baseValue)); }}>List</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Listing modal */}
      {listingInstance && (() => {
        const rs = rarityStyle(rarities, listingInstance.def.rarity);
        const marketVal = listingInstance.marketValue || listingInstance.def.baseValue;
        const priceN = parseInt(listPrice, 10) || 0;
        const afterFee = Math.floor(priceN * (1 - houseFee));
        return (
          <div className="auc-modal-overlay" onClick={() => setListingInstance(null)}>
            <div className="auc-modal" onClick={e => e.stopPropagation()} style={{ borderColor: rs.color }}>
              <div className="auc-modal-title">List {listingInstance.def.emoji} {listingInstance.def.name}</div>
              <div className="auc-modal-info">
                Market value: <strong style={{ color: rs.color }}>{fmt(marketVal)}</strong>
              </div>
              <input
                type="number"
                className="auc-modal-input"
                value={listPrice}
                onChange={e => setListPrice(e.target.value)}
                placeholder="Listing price"
              />
              <div className="auc-modal-fee">
                House fee: {(houseFee * 100).toFixed(0)}% ({fmt(priceN - afterFee)}) · You receive <strong>{fmt(afterFee)}</strong>
              </div>
              <div className="auc-modal-actions">
                <button className="auc-cancel-btn" onClick={() => setListingInstance(null)}>Cancel</button>
                <button className="auc-confirm-btn" onClick={submitListing}>Confirm Listing</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Filter tabs */}
      <div className="auc-filters">
        <button className={`auc-filter ${filter==='all'?'auc-filter-active':''}`} onClick={() => setFilter('all')}>All ({listings.length})</button>
        {token && <button className={`auc-filter ${filter==='mine'?'auc-filter-active':''}`} onClick={() => setFilter('mine')}>My listings</button>}
        {['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map(r => {
          const count = listings.filter(l => l.joker?.rarity === r).length;
          if (count === 0) return null;
          const rs = rarityStyle(rarities, r);
          return (
            <button
              key={r}
              className={`auc-filter ${filter===r?'auc-filter-active':''}`}
              style={{ borderColor: filter === r ? rs.color : undefined, color: filter === r ? rs.color : undefined }}
              onClick={() => setFilter(r)}
            >
              {rs.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Listings */}
      <div className="auc-listings">
        {filtered.length === 0 && (
          <div className="auc-empty">No listings {filter !== 'all' ? 'in this filter' : 'yet'} — be the first to list!</div>
        )}
        {filtered.map(l => {
          if (!l.joker) return null;
          const rs = rarityStyle(rarities, l.joker.rarity);
          const isMine = l.seller === user?.username;
          const priceVsMarket = l.marketValue > 0 ? ((l.price - l.marketValue) / l.marketValue) * 100 : 0;
          const dealColor = priceVsMarket < -10 ? '#4ade80' : priceVsMarket > 15 ? '#fca5a5' : '#94a3b8';
          return (
            <div key={l.id} className="auc-listing" style={{ borderColor: rs.color, boxShadow: `0 0 14px ${rs.glow}` }}>
              <div className="auc-listing-rarity" style={{ color: rs.color }}>{rs.label}</div>
              <div className="auc-listing-emoji">{l.joker.emoji}</div>
              <div className="auc-listing-name" style={{ color: rs.color }}>{l.joker.name}</div>
              <div className="auc-listing-desc">{l.joker.description}</div>
              <div className="auc-listing-price">
                <div className="auc-listing-price-ask">{fmt(l.price)}</div>
                <div className="auc-listing-price-market">Market: {fmt(l.marketValue)}</div>
                <div className="auc-listing-price-delta" style={{ color: dealColor }}>
                  {priceVsMarket >= 0 ? '+' : ''}{priceVsMarket.toFixed(1)}% {priceVsMarket < -10 ? '🔥 DEAL' : priceVsMarket > 15 ? '💰' : ''}
                </div>
              </div>
              <div className="auc-listing-seller">from <strong>{l.seller}</strong></div>
              {isMine ? (
                <button className="auc-listing-cancel" onClick={() => cancel(l.id)}>Cancel</button>
              ) : (
                <button className="auc-listing-buy" disabled={(balance || 0) < l.price} onClick={() => buy(l.id)}>
                  {(balance || 0) < l.price ? 'Not enough $' : `Buy ${fmt(l.price)}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
