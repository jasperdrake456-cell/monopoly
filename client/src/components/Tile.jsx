import React from 'react';
import { GROUP_COLORS, TOKENS, TOKEN_COLORS, getTileOrientation } from '../boardData';

const TYPE_ICONS = {
  railroad: '🚂',
  utility: '⚡',
  chance: '❓',
  community_chest: '🎁',
  tax: '💰',
  go: null,
  go_to_jail: '👮',
  jail: null,
  free_parking: '🅿️',
};

export default function Tile({ space, propertyState, playersHere, isHighlighted, size = 'normal' }) {
  const orient = getTileOrientation(space.id);
  const isCorner = orient === 'corner';
  const colorBar = space.group ? GROUP_COLORS[space.group] : null;

  // Which direction does the color bar face?
  const barStyle = {};
  if (colorBar) {
    if (orient === 'bottom') barStyle.borderTop = `8px solid ${colorBar}`;
    else if (orient === 'top')    barStyle.borderBottom = `8px solid ${colorBar}`;
    else if (orient === 'left')   barStyle.borderRight = `8px solid ${colorBar}`;
    else if (orient === 'right')  barStyle.borderLeft = `8px solid ${colorBar}`;
  }

  const tileClass = [
    'tile',
    `tile--${orient}`,
    `tile--${space.type}`,
    isHighlighted ? 'tile--highlighted' : '',
    propertyState?.mortgaged ? 'tile--mortgaged' : '',
  ].filter(Boolean).join(' ');

  const houseCount = propertyState?.houses || 0;
  const isHotel = houseCount === 5;

  return (
    <div className={tileClass} style={barStyle} title={space.name}>
      {/* Corner tiles have special layouts */}
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

          {/* Ownership indicator */}
          {propertyState?.owner && (
            <div
              className="tile-owner-dot"
              style={{ background: propertyState.ownerColor || '#fff' }}
            />
          )}

          {/* Houses/hotel */}
          {houseCount > 0 && (
            <div className="tile-buildings">
              {isHotel
                ? <span className="building hotel">H</span>
                : Array.from({ length: houseCount }).map((_, i) => (
                    <span key={i} className="building house">■</span>
                  ))
              }
            </div>
          )}

          {/* Mortgage overlay */}
          {propertyState?.mortgaged && <div className="mortgage-overlay">MORTGAGED</div>}
        </>
      )}

      {/* Player tokens */}
      {playersHere.length > 0 && (
        <div className="tile-tokens">
          {playersHere.map(p => (
            <span key={p.id} className="tile-token" style={{ color: TOKEN_COLORS[p.token] }} title={p.name}>
              {TOKENS[p.token]}
            </span>
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
      <div className="jail-visiting">Just<br/>Visiting</div>
      <div className="jail-box">
        <span>JAIL</span>
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
      <span>Go To</span>
      <span className="corner-icon">👮</span>
      <span>JAIL!</span>
    </div>
  );
  return null;
}
