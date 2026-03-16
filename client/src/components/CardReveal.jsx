import React, { useEffect, useState } from 'react';
import './CardReveal.css';

// Map card actions to emojis / context lines
const ACTION_META = {
  advance_to:               { icon: '🚶', label: 'Move' },
  advance_nearest_railroad: { icon: '🚂', label: 'Nearest Railroad' },
  advance_nearest_utility:  { icon: '⚡', label: 'Nearest Utility' },
  collect:                  { icon: '💰', label: 'Collect' },
  collect_from_each:        { icon: '🎂', label: 'Collect from each player' },
  pay:                      { icon: '💸', label: 'Pay' },
  pay_each:                 { icon: '👑', label: 'Pay each player' },
  go_to_jail:               { icon: '🚔', label: 'Go to Jail!' },
  get_out_of_jail:          { icon: '🔑', label: 'Get Out of Jail Free' },
  repairs:                  { icon: '🔨', label: 'Pay for repairs' },
  go_back:                  { icon: '↩️', label: 'Go back' },
};

export default function CardReveal({ activeCard, isMyTurn, roomCode, emit, currentPlayerName, currentPlayerToken }) {
  const [flipped, setFlipped] = useState(false);
  const [acting, setActing] = useState(false);

  // Flip after a short delay so the face-down card is visible first
  useEffect(() => {
    setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 180);
    return () => clearTimeout(t);
  }, [activeCard]);

  if (!activeCard) return null;

  const isChance = activeCard.deck === 'chance';
  const card = activeCard.cardData;
  const meta = ACTION_META[card?.action] || { icon: '🃏', label: '' };

  function handleResolve() {
    if (acting) return;
    setActing(true);
    emit('resolveCard', { roomCode });
  }

  return (
    <div className="cr-overlay">
      {/* Pulsing background glow */}
      <div className={`cr-glow ${isChance ? 'cr-glow--chance' : 'cr-glow--community'}`} />

      {/* Who drew the card */}
      <div className="cr-who">
        {currentPlayerToken} <strong>{currentPlayerName}</strong> drew a card
      </div>

      {/* The card with flip animation */}
      <div className={`cr-scene ${flipped ? 'cr-scene--flipped' : ''}`}>
        {/* Back of card */}
        <div className={`cr-card cr-card--back ${isChance ? 'cr-back--chance' : 'cr-back--community'}`}>
          <div className="cr-back-symbol">{isChance ? '?' : '🏛'}</div>
        </div>

        {/* Front of card */}
        <div className={`cr-card cr-card--front ${isChance ? 'cr-front--chance' : 'cr-front--community'}`}>
          <div className="cr-deck-label">
            {isChance ? 'CHANCE' : 'COMMUNITY CHEST'}
          </div>
          <div className="cr-action-icon">{meta.icon}</div>
          <div className="cr-card-text">{card?.text}</div>
          {meta.label && card?.action !== 'collect' && card?.action !== 'pay' && (
            <div className="cr-card-sublabel">{meta.label}</div>
          )}
          {(card?.amount != null) && (
            <div className={`cr-amount ${card.action?.startsWith('collect') ? 'cr-amount--gain' : 'cr-amount--loss'}`}>
              {card.action?.startsWith('collect') ? '+' : '-'}${card.amount}
            </div>
          )}
        </div>
      </div>

      {/* Action button — only current player can resolve */}
      {isMyTurn ? (
        <button
          className="cr-resolve-btn"
          onClick={handleResolve}
          disabled={acting || !flipped}
        >
          {acting ? 'Resolving…' : 'OK, Continue →'}
        </button>
      ) : (
        <div className="cr-waiting">Waiting for {currentPlayerName} to continue…</div>
      )}
    </div>
  );
}
