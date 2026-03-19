import React from 'react';
import { Link } from 'react-router-dom';
import CrossyRoad from '../games/CrossyRoad';

export default function CrossyRoadPage() {
  return (
    <>
      <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 200 }}>
        <Link to="/" style={{
          background:    'rgba(0,0,0,0.6)',
          border:        '1px solid rgba(255,255,255,0.2)',
          color:         '#fff',
          padding:       '6px 14px',
          borderRadius:  '8px',
          textDecoration:'none',
          fontSize:      '0.85rem',
          fontFamily:    'Roboto, sans-serif',
          backdropFilter:'blur(4px)',
        }}>← Game Vault</Link>
      </div>
      <CrossyRoad />
    </>
  );
}
