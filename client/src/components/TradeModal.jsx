import React, { useState } from 'react';
import { BOARD, GROUP_COLORS, TOKENS, TOKEN_COLORS } from '../boardData';
import './TradeModal.css';

export default function TradeModal({ gameState, myId, roomCode, emit, onClose }) {
  const { players, propertyStates } = gameState;
  const myPlayer = players.find(p => p.id === myId);
  const otherPlayers = players.filter(p => p.id !== myId && !p.bankrupt);

  const [targetId, setTargetId] = useState(otherPlayers[0]?.id || '');
  const [offerProps, setOfferProps] = useState([]);
  const [offerCash, setOfferCash] = useState(0);
  const [offerJailCard, setOfferJailCard] = useState(false);
  const [requestProps, setRequestProps] = useState([]);
  const [requestCash, setRequestCash] = useState(0);
  const [requestJailCard, setRequestJailCard] = useState(false);

  const targetPlayer = players.find(p => p.id === targetId);

  function toggleProp(list, setList, propId) {
    setList(prev => prev.includes(propId) ? prev.filter(x => x !== propId) : [...prev, propId]);
  }

  function handleSubmit() {
    emit('proposeTrade', {
      roomCode,
      toId: targetId,
      offer:   { properties: offerProps,   cash: parseInt(offerCash)   || 0, jailCards: offerJailCard   ? 1 : 0 },
      request: { properties: requestProps, cash: parseInt(requestCash) || 0, jailCards: requestJailCard ? 1 : 0 },
    });
    onClose();
  }

  const isEmpty =
    offerProps.length === 0 && parseInt(offerCash) === 0 && !offerJailCard &&
    requestProps.length === 0 && parseInt(requestCash) === 0 && !requestJailCard;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="trade-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Propose Trade</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="trade-target">
          <label>Trade with:
            <select value={targetId} onChange={e => { setTargetId(e.target.value); setRequestProps([]); setRequestJailCard(false); }}>
              {otherPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {TOKENS[p.token]} {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="trade-cols">
          {/* My offer */}
          <div className="trade-col">
            <h3>You Offer</h3>
            <div className="trade-props">
              {myPlayer.properties.map(id => {
                const space = BOARD[id];
                const selected = offerProps.includes(id);
                return (
                  <button
                    key={id}
                    className={`trade-prop-btn ${selected ? 'selected' : ''}`}
                    style={{ borderLeftColor: space.group ? GROUP_COLORS[space.group] : '#999' }}
                    onClick={() => toggleProp(offerProps, setOfferProps, id)}
                  >
                    {space.name}
                  </button>
                );
              })}
              {myPlayer.properties.length === 0 && <span className="no-props-msg">No properties</span>}
            </div>
            {myPlayer.getOutOfJailCards > 0 && (
              <label className="jail-card-label">
                <input
                  type="checkbox"
                  checked={offerJailCard}
                  onChange={e => setOfferJailCard(e.target.checked)}
                />
                🃏 Get Out of Jail Free card
              </label>
            )}
            <label className="cash-label">Cash to offer:
              <input
                type="number"
                min={0}
                max={myPlayer.cash}
                value={offerCash}
                onChange={e => setOfferCash(e.target.value)}
                className="cash-input"
              />
            </label>
          </div>

          <div className="trade-vs">⟷</div>

          {/* Their offer */}
          <div className="trade-col">
            <h3>You Request</h3>
            <div className="trade-props">
              {targetPlayer?.properties.map(id => {
                const space = BOARD[id];
                const selected = requestProps.includes(id);
                return (
                  <button
                    key={id}
                    className={`trade-prop-btn ${selected ? 'selected' : ''}`}
                    style={{ borderLeftColor: space.group ? GROUP_COLORS[space.group] : '#999' }}
                    onClick={() => toggleProp(requestProps, setRequestProps, id)}
                  >
                    {space.name}
                  </button>
                );
              })}
              {(!targetPlayer || targetPlayer.properties.length === 0) && <span className="no-props-msg">No properties</span>}
            </div>
            {targetPlayer?.getOutOfJailCards > 0 && (
              <label className="jail-card-label">
                <input
                  type="checkbox"
                  checked={requestJailCard}
                  onChange={e => setRequestJailCard(e.target.checked)}
                />
                🃏 Get Out of Jail Free card
              </label>
            )}
            <label className="cash-label">Cash to request:
              <input
                type="number"
                min={0}
                max={targetPlayer?.cash || 0}
                value={requestCash}
                onChange={e => setRequestCash(e.target.value)}
                className="cash-input"
              />
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="ap-btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="ap-btn primary"
            onClick={handleSubmit}
            disabled={!targetId || isEmpty}
          >
            Send Offer
          </button>
        </div>
      </div>
    </div>
  );
}
