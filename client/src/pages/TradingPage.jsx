import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './TradingPage.css';

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

export default function TradingPage() {
  const { token, user, balance } = useAuth();
  const [offers, setOffers]   = useState([]);
  const [myInv, setMyInv]     = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rarities, setRarities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Builder state
  const [receiver, setReceiver]             = useState('');
  const [offerInstances, setOfferInstances] = useState([]); // array of instanceIds
  const [offerCoins, setOfferCoins]         = useState('');
  const [requestIds, setRequestIds]         = useState([]); // array of jokerIds
  const [requestCoins, setRequestCoins]     = useState('');
  const [message, setMessage]               = useState('');

  const refresh = useCallback(async () => {
    try {
      const cat = await fetch(`${SERVER_URL}/api/jokers/catalog`).then(r => r.json());
      if (cat.ok) { setCatalog(cat.jokers); setRarities(cat.rarities); }
      if (token) {
        const [inv, mine] = await Promise.all([
          fetch(`${SERVER_URL}/api/jokers/inventory`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${SERVER_URL}/api/trades/mine`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
        ]);
        if (inv.ok) setMyInv(inv.owned);
        if (mine.ok) setOffers(mine.offers);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const sock = window.__gameSocket;
    if (!sock) return;
    const h = () => refresh();
    sock.on('tradeCreated', h);
    sock.on('tradeResolved', h);
    return () => { sock.off('tradeCreated', h); sock.off('tradeResolved', h); };
  }, [refresh]);

  function toggleOfferInstance(id) {
    setOfferInstances(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }
  function toggleRequestId(id) {
    setRequestIds(arr => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  async function sendOffer() {
    setError('');
    if (!receiver) { setError('Enter a receiver username'); return; }
    if (offerInstances.length === 0 && !Number(offerCoins)) { setError('Offer at least one joker or some coins'); return; }
    try {
      const d = await fetch(`${SERVER_URL}/api/trades/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          receiver,
          offererInstanceIds: offerInstances,
          offererCoins: Number(offerCoins) || 0,
          requestedJokerIds: requestIds,
          requestedCoins: Number(requestCoins) || 0,
          message,
        }),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error || 'Offer failed'); return; }
      // Reset
      setReceiver(''); setOfferInstances([]); setOfferCoins('');
      setRequestIds([]); setRequestCoins(''); setMessage('');
      await refresh();
    } catch { setError('Network error'); }
  }

  async function actOnOffer(action, offerId, suppliedInstanceIds) {
    setError('');
    try {
      const body = { offerId };
      if (suppliedInstanceIds) body.suppliedInstanceIds = suppliedInstanceIds;
      const d = await fetch(`${SERVER_URL}/api/trades/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      }).then(r => r.json());
      if (!d.ok) { setError(d.error || 'Action failed'); return; }
      await refresh();
    } catch { setError('Network error'); }
  }

  if (loading) return <div className="trd-loading">Loading…</div>;

  return (
    <div className="trd-page">
      <div className="trd-header">
        <Link to="/jokers" className="trd-back">← Jokers</Link>
        <div className="trd-title">
          <span className="trd-title-emoji">🤝</span>
          <h1>Trading</h1>
        </div>
        <div className="trd-balance">💰 {fmt(balance)}</div>
      </div>

      {error && <div className="trd-error">{error}</div>}

      {/* Offer builder */}
      <div className="trd-builder">
        <h3>📝 New Trade Offer</h3>
        <div className="trd-builder-row">
          <label>To user:</label>
          <input className="trd-input" value={receiver} onChange={e => setReceiver(e.target.value)} placeholder="username" />
        </div>

        <div className="trd-builder-split">
          <div className="trd-builder-col">
            <div className="trd-col-title" style={{ color:'#4ade80' }}>You offer</div>
            <div className="trd-builder-row">
              <label>Coins:</label>
              <input className="trd-input" type="number" value={offerCoins} onChange={e => setOfferCoins(e.target.value)} placeholder="0" />
            </div>
            <div className="trd-subtitle">Your jokers (click to toggle):</div>
            <div className="trd-picker">
              {myInv.length === 0 && <div className="trd-empty">You have no jokers</div>}
              {myInv.map(o => {
                const rs = rarityStyle(rarities, o.def.rarity);
                const active = offerInstances.includes(o.instanceId);
                return (
                  <div
                    key={o.instanceId}
                    className={`trd-pick ${active ? 'trd-pick-active' : ''}`}
                    style={{ borderColor: active ? rs.color : 'rgba(255,255,255,0.15)' }}
                    onClick={() => toggleOfferInstance(o.instanceId)}
                  >
                    <span className="trd-pick-emoji">{o.def.emoji}</span>
                    <span className="trd-pick-name" style={{ color: rs.color }}>{o.def.name}</span>
                    <span className="trd-pick-val">{fmt(o.marketValue || o.def.baseValue)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="trd-builder-col">
            <div className="trd-col-title" style={{ color:'#f472b6' }}>You want</div>
            <div className="trd-builder-row">
              <label>Coins:</label>
              <input className="trd-input" type="number" value={requestCoins} onChange={e => setRequestCoins(e.target.value)} placeholder="0" />
            </div>
            <div className="trd-subtitle">Any joker types from their collection (click to toggle):</div>
            <div className="trd-picker">
              {catalog.map(j => {
                const rs = rarityStyle(rarities, j.rarity);
                const active = requestIds.includes(j.id);
                return (
                  <div
                    key={j.id}
                    className={`trd-pick ${active ? 'trd-pick-active' : ''}`}
                    style={{ borderColor: active ? rs.color : 'rgba(255,255,255,0.15)' }}
                    onClick={() => toggleRequestId(j.id)}
                  >
                    <span className="trd-pick-emoji">{j.emoji}</span>
                    <span className="trd-pick-name" style={{ color: rs.color }}>{j.name}</span>
                    <span className="trd-pick-val">{fmt(j.marketValue || j.baseValue)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="trd-builder-row">
          <label>Message:</label>
          <input className="trd-input" value={message} onChange={e => setMessage(e.target.value)} placeholder="(optional)" maxLength={200} />
        </div>
        <button className="trd-send-btn" onClick={sendOffer} disabled={!token}>Send Offer</button>
      </div>

      {/* My offers */}
      <div className="trd-section">
        <h3>📬 My Offers ({offers.length})</h3>
        {offers.length === 0 && <div className="trd-empty">No active offers</div>}
        <div className="trd-offers">
          {offers.map(o => {
            const isMine = o.offerer === user?.username;
            return (
              <OfferCard
                key={o.id}
                offer={o}
                rarities={rarities}
                isMine={isMine}
                myInventory={myInv}
                onCancel={() => actOnOffer('cancel', o.id)}
                onReject={() => actOnOffer('reject', o.id)}
                onAccept={(supplied) => actOnOffer('accept', o.id, supplied)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OfferCard({ offer, rarities, isMine, myInventory, onCancel, onReject, onAccept }) {
  const [picks, setPicks] = useState([]); // one instanceId per requested

  function setPick(i, instanceId) {
    setPicks(arr => {
      const next = [...arr];
      next[i] = instanceId;
      return next;
    });
  }

  function doAccept() {
    if (picks.length !== offer.requestedJokerIds.length || picks.some(x => !x)) {
      alert('Pick one of your jokers to satisfy each requested slot');
      return;
    }
    onAccept(picks);
  }

  const totalOfferValue  = offer.offererJokers.reduce((s, x) => s + (x.def?.baseValue || 0), 0) + (offer.offererCoins || 0);
  const totalRequestVal  = offer.requestedJokers.reduce((s, x) => s + (x?.baseValue || 0), 0) + (offer.requestedCoins || 0);

  return (
    <div className="trd-offer">
      <div className="trd-offer-header">
        {isMine ? (
          <span>You → <strong>{offer.receiver}</strong></span>
        ) : (
          <span><strong>{offer.offerer}</strong> → You</span>
        )}
        <span className="trd-offer-time">{new Date(offer.createdAt).toLocaleString()}</span>
      </div>

      {offer.message && <div className="trd-offer-message">💬 "{offer.message}"</div>}

      <div className="trd-offer-split">
        <div className="trd-offer-side">
          <div className="trd-offer-label">{isMine ? 'Your offer' : `${offer.offerer} offers`}</div>
          {offer.offererCoins > 0 && <div className="trd-offer-coin">💰 {fmt(offer.offererCoins)}</div>}
          <div className="trd-offer-jokers">
            {offer.offererJokers.map((j, i) => {
              const rs = rarityStyle(rarities, j.def.rarity);
              return (
                <div key={i} className="trd-offer-chip" style={{ borderColor: rs.color, color: rs.color }}>
                  {j.def.emoji} {j.def.name}
                </div>
              );
            })}
            {offer.offererJokers.length === 0 && offer.offererCoins === 0 && <div className="trd-offer-none">—</div>}
          </div>
          <div className="trd-offer-value">~{fmt(totalOfferValue)} value</div>
        </div>

        <div className="trd-offer-arrow">⇄</div>

        <div className="trd-offer-side">
          <div className="trd-offer-label">{isMine ? `${offer.receiver} returns` : 'You return'}</div>
          {offer.requestedCoins > 0 && <div className="trd-offer-coin">💰 {fmt(offer.requestedCoins)}</div>}
          <div className="trd-offer-jokers">
            {offer.requestedJokers.map((j, i) => {
              const rs = rarityStyle(rarities, j.rarity);
              return (
                <div key={i}>
                  <div className="trd-offer-chip" style={{ borderColor: rs.color, color: rs.color }}>
                    {j.emoji} {j.name}
                  </div>
                  {!isMine && (
                    <select
                      className="trd-select"
                      value={picks[i] || ''}
                      onChange={e => setPick(i, e.target.value)}
                    >
                      <option value="">Pick one of your {j.name}…</option>
                      {myInventory.filter(o => o.def.id === j.id).map(o => (
                        <option key={o.instanceId} value={o.instanceId}>
                          {o.def.emoji} acquired {new Date(o.acquiredAt).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
            {offer.requestedJokers.length === 0 && offer.requestedCoins === 0 && <div className="trd-offer-none">—</div>}
          </div>
          <div className="trd-offer-value">~{fmt(totalRequestVal)} value</div>
        </div>
      </div>

      <div className="trd-offer-actions">
        {isMine ? (
          <button className="trd-btn trd-btn-cancel" onClick={onCancel}>Cancel Offer</button>
        ) : (
          <>
            <button className="trd-btn trd-btn-reject" onClick={onReject}>Reject</button>
            <button className="trd-btn trd-btn-accept" onClick={doAccept}>Accept Trade</button>
          </>
        )}
      </div>
    </div>
  );
}
