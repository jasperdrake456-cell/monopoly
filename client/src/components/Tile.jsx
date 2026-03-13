import React from 'react';
import { GROUP_COLORS, TOKENS, TOKEN_COLORS, getTileOrientation } from '../boardData';

const TYPE_ICONS = {
  railroad:        '🚂',
  utility:         '⚡',
  chance:          '❓',
  community_chest: '🎁',
  tax:             '💰',
  go_to_jail:      '👮',
  free_parking:    '🅿️',
};

export default function Tile({ space, propertyState, playersHere, isHighlighted, currentPlayerId }) {
  const orient = getTileOrientation(space.id);
  const isCorner = orient === 'corner';
  const colorBar = space.group ? GROUP_COLORS[space.group] : null;

  // Thick color bar as a border on the outer edge of the tile
  const barStyle = {};
  if (colorBar) {
    const thickness = '14px';
    if      (orient === 'bottom') barStyle.borderTop    = `${thickness} solid ${colorBar}`;
    else if (orient === 'top')    barStyle.borderBottom = `${thickness} solid ${colorBar}`;
    else if (orient === 'left')   barStyle.borderRight  = `${thickness} solid ${colorBar}`;
    else if (orient === 'right')  barStyle.borderLeft   = `${thickness} solid ${colorBar}`;
  }

  const tileClass = [
    'tile',
    `tile--${orient}`,
    `tile--${space.type}`,
    isHighlighted ? 'tile--highlighted' : '',
  ].filter(Boolean).join(' ');

  const houseCount = propertyState?.houses || 0;
  const isHotel = houseCount === 5;
  const ownerColor = propertyState?.ownerColor;

  return (
    <div className={tileClass} style={barStyle} title={space.name}>
      {isCorner ? <CornerContent space={space} /> : (
        <>
          <div className="tile-name">{space.name}</div>

          {space.type === 'property' && (
            <div className="tile-price">${space.price}</div>
          )}
          {(space.type === 'railroad' || space.type === 'utility') && (
            <>
              <div className="tile-icon">{TYPE_ICONS[space.type]}</div>
              <div className="tile-price">${space.price}</div>
            </>
          )}
          {(space.type === 'chance' || space.type === 'community_chest') && (
            <div className="tile-icon">{TYPE_ICONS[space.type]}</div>
          )}
          {space.type === 'tax' && (
            <>
              <div className="tile-icon">{TYPE_ICONS.tax}</div>
              <div className="tile-price">Pay ${space.amount}</div>
            </>
          )}

          {/* Houses / hotel */}
          {houseCount > 0 && (
            <div className="tile-buildings">
              {isHotel
                ? <span className="building hotel">🏨</span>
                : Array.from({ length: houseCount }).map((_, i) => (
                    <span key={i} className="building house">🏠</span>
                  ))
              }
            </div>
          )}

          {/* Mortgage overlay */}
          {propertyState?.mortgaged && <div className="mortgage-overlay">MORTGAGED</div>}

          {/* Owner color strip at bottom */}
          {ownerColor && !propertyState?.mortgaged && (
            <div className="tile-owner-strip" style={{ background: ownerColor }} />
          )}
        </>
      )}

      {/* Player token badges */}
      {playersHere.length > 0 && (
        <div className="tile-tokens">
          {playersHere.map(p => (
            <div
              key={p.id}
              className={`tile-token-badge ${p.id === currentPlayerId ? 'is-current' : ''}`}
              style={{ background: TOKEN_COLORS[p.token] + '33', borderColor: TOKEN_COLORS[p.token] }}
              title={p.name}
            >
              <span style={{ fontSize: '1rem' }}>{TOKENS[p.token]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CornerContent({ space }) {
  if (space.type === 'go') return (
    <div className="corner-content corner-go">
      <span className="corner-arrow">→</span>
      <span className="corner-title">GO</span>
      <span className="corner-sub">Collect $200 salary as you pass</span>
    </div>
  );
  if (space.type === 'jail') return (
    <div className="corner-content corner-jail">
      <div className="jail-visiting">Just Visiting</div>
      <div className="jail-box">
        <span className="jail-bars">🔒</span>
        <span className="jail-label">JAIL</span>
      </div>
    </div>
  );
  if (space.type === 'free_parking') return (
    <div className="corner-content corner-fp">
      <span className="corner-title">FREE</span>
      <span className="corner-icon">🅿️</span>
      <span className="corner-title">PARKING</span>
    </div>
  );
  if (space.type === 'go_to_jail') return (
    <div className="corner-content corner-gtj">
      <span className="corner-title" style={{ fontSize: '0.75rem' }}>Go To</span>
      <span className="corner-icon">👮</span>
      <span className="corner-title">JAIL!</span>
    </div>
  );
  return null;
}
