import React from 'react';
import { GROUP_COLORS, TOKENS, TOKEN_COLORS, getTileOrientation } from '../boardData';

// Convert a hex color like "#ff8800" to an rgba glow string with given alpha.
function hexToGlow(hex, alpha = 0.5) {
  if (!hex || typeof hex !== 'string') return `rgba(255,215,0,${alpha})`;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(255,215,0,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function Tile({ space, propertyState, playersHere, isHighlighted, currentPlayerId }) {
  const orient = getTileOrientation(space.id);
  const isCorner = orient === 'corner';
  const colorBar = space.group ? GROUP_COLORS[space.group] : null;

  // Color band as a border on the OUTER edge
  const barStyle = {};
  if (colorBar) {
    const t = '16px';
    if      (orient === 'bottom') barStyle.borderTop    = `${t} solid ${colorBar}`;
    else if (orient === 'top')    barStyle.borderBottom = `${t} solid ${colorBar}`;
    else if (orient === 'left')   barStyle.borderRight  = `${t} solid ${colorBar}`;
    else if (orient === 'right')  barStyle.borderLeft   = `${t} solid ${colorBar}`;
  }

  const houseCount = propertyState?.houses || 0;
  const isHotel    = houseCount === 5;
  const ownerColor = propertyState?.ownerColor;
  const isOwned    = !!ownerColor && !propertyState?.mortgaged;

  const tileClass = [
    'tile',
    `tile--${orient}`,
    `tile--${space.type}`,
    isHighlighted ? 'tile--highlighted' : '',
    isOwned ? 'tile--owned' : '',
  ].filter(Boolean).join(' ');

  const style = { ...barStyle };
  if (isOwned && ownerColor) {
    style['--owner-color'] = ownerColor;
    style['--owner-glow']  = hexToGlow(ownerColor, 0.55);
  }

  return (
    <div className={tileClass} style={style} title={space.name}>
      {isCorner ? <CornerContent space={space} /> : (
        <div className="tile-inner">
          <div className="tile-name">{space.name}</div>

          {space.flag && (
            <div className="tile-flag">{space.flag}</div>
          )}

          {space.type === 'property' && space.landmark && (
            <div className="tile-landmark">{space.landmark}</div>
          )}

          {space.type === 'property' && (
            <div className="tile-price">${space.price}</div>
          )}

          {space.type === 'railroad' && (
            <>
              <div className="tile-icon">{space.landmark || '🚂'}</div>
              <div className="tile-price">${space.price}</div>
            </>
          )}

          {space.type === 'utility' && (
            <>
              <div className="tile-icon">{space.landmark || (space.id === 12 ? '💡' : '🚿')}</div>
              <div className="tile-price">${space.price}</div>
            </>
          )}

          {space.type === 'chance' && (
            <>
              <div className="tile-icon">?</div>
              <div className="tile-card-label">CHANCE</div>
            </>
          )}
          {space.type === 'community_chest' && (
            <>
              <div className="tile-icon tile-icon--cc">CC</div>
              <div className="tile-card-label">COMMUNITY</div>
            </>
          )}

          {space.type === 'tax' && (
            <>
              <div className="tile-icon">$</div>
              <div className="tile-price">Pay ${space.amount}</div>
            </>
          )}

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

          {propertyState?.mortgaged && <div className="mortgage-overlay">MORTGAGED</div>}

          {ownerColor && !propertyState?.mortgaged && (
            <div className="tile-owner-strip" style={{ background: ownerColor }} />
          )}
        </div>
      )}

      {playersHere.length > 0 && (
        <div className="tile-tokens">
          {playersHere.map(p => (
            <div
              key={p.id}
              className={[
                'tile-token-badge',
                p.id === currentPlayerId ? 'is-current' : '',
                p.isThrowing ? 'throwing' : (p.isHopping ? 'hopping' : ''),
              ].filter(Boolean).join(' ')}
              style={{ background: TOKEN_COLORS[p.token] + '22', borderColor: TOKEN_COLORS[p.token] }}
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
      <div className="go-arrow">→</div>
      <div className="go-label">GO</div>
      <div className="go-sub">Collect $200 salary as you pass</div>
    </div>
  );
  if (space.type === 'jail') return (
    <div className="corner-content corner-jail">
      <div className="jail-just-visiting">Just Visiting</div>
      <div className="jail-box">
        <span className="jail-bars">|||</span>
        <span className="jail-box-label">JAIL</span>
      </div>
    </div>
  );
  if (space.type === 'free_parking') return (
    <div className="corner-content corner-fp">
      <div className="fp-label">Free</div>
      <div className="fp-icon">P</div>
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
