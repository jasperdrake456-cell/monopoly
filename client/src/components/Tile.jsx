import React from 'react';
import { GROUP_COLORS, TOKENS, TOKEN_COLORS, getTileOrientation } from '../boardData';

export default function Tile({ space, propertyState, playersHere, isHighlighted, currentPlayerId }) {
  const orient = getTileOrientation(space.id);
  const isCorner = orient === 'corner';
  const colorBar = space.group ? GROUP_COLORS[space.group] : null;

  // Thickness of the color band (mimics real board)
  const BAND = 16;

  const tileClass = [
    'tile',
    `tile--${orient}`,
    `tile--${space.type}`,
    isHighlighted ? 'tile--highlighted' : '',
  ].filter(Boolean).join(' ');

  const houseCount = propertyState?.houses || 0;
  const isHotel = houseCount === 5;
  const ownerColor = propertyState?.ownerColor;

  // Color band style (always placed at the outer edge of the board)
  const bandStyle = colorBar ? {
    background: colorBar,
    flexShrink: 0,
    ...(orient === 'bottom' ? { width: '100%', height: `${BAND}px` } : {}),
    ...(orient === 'top'    ? { width: '100%', height: `${BAND}px` } : {}),
    ...(orient === 'left'   ? { height: '100%', width: `${BAND}px` } : {}),
    ...(orient === 'right'  ? { height: '100%', width: `${BAND}px` } : {}),
  } : null;

  return (
    <div className={tileClass} title={space.name}>
      {isCorner ? <CornerContent space={space} /> : (
        <>
          {/* Color band at outer edge */}
          {bandStyle && <div style={bandStyle} />}

          {/* Tile body */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '1px' }}>
            <div className="tile-name">{space.name}</div>

            {space.type === 'property' && (
              <div className="tile-price">${space.price}</div>
            )}

            {(space.type === 'railroad') && (
              <>
                <div className="rr-icon">🚂</div>
                <div className="tile-price">${space.price}</div>
              </>
            )}
            {space.type === 'utility' && space.id === 12 && (
              <>
                <div className="tile-icon">💡</div>
                <div className="tile-price">${space.price}</div>
              </>
            )}
            {space.type === 'utility' && space.id === 28 && (
              <>
                <div className="tile-icon">🚿</div>
                <div className="tile-price">${space.price}</div>
              </>
            )}

            {space.type === 'chance' && (
              <div className="chance-card">
                <div className="card-big-icon">❓</div>
                <div className="card-title">Chance</div>
              </div>
            )}
            {space.type === 'community_chest' && (
              <div className="community-card">
                <div className="card-big-icon">🎁</div>
                <div className="card-title">Community Chest</div>
              </div>
            )}
            {space.type === 'tax' && (
              <>
                <div className="tile-icon">💰</div>
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
          </div>

          {/* Mortgage overlay */}
          {propertyState?.mortgaged && <div className="mortgage-overlay">MORTGAGED</div>}

          {/* Owner color strip at bottom */}
          {ownerColor && !propertyState?.mortgaged && (
            <div className="tile-owner-strip" style={{ background: ownerColor }} />
          )}
        </>
      )}

      {/* Player token badges — always on top */}
      {playersHere.length > 0 && (
        <div className="tile-tokens">
          {playersHere.map(p => (
            <div
              key={p.id}
              className={`tile-token-badge ${p.id === currentPlayerId ? 'is-current' : ''}`}
              style={{ background: TOKEN_COLORS[p.token] + '22', borderColor: TOKEN_COLORS[p.token] }}
              title={p.name}
            >
              <span style={{ fontSize: '1.1rem' }}>{TOKENS[p.token]}</span>
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
      <div className="go-arrow">→</div>
      <div className="go-label">GO</div>
      <div className="go-sub">Collect $200 salary as you pass</div>
    </div>
  );

  if (space.type === 'jail') return (
    <div className="corner-content corner-jail">
      <div className="jail-just-visiting">Just Visiting</div>
      <div className="jail-box">
        <span className="jail-bars">⛓</span>
        <span className="jail-box-label">JAIL</span>
      </div>
    </div>
  );

  if (space.type === 'free_parking') return (
    <div className="corner-content corner-fp">
      <div className="fp-label">Free</div>
      <div className="fp-icon">🅿️</div>
      <div className="fp-label">Parking</div>
    </div>
  );

  if (space.type === 'go_to_jail') return (
    <div className="corner-content corner-gtj">
      <div className="gtj-label">Go To</div>
      <div className="gtj-icon">👮</div>
      <div className="gtj-label">Jail!</div>
    </div>
  );

  return null;
}
