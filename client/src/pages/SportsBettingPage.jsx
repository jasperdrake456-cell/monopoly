import React from 'react';
import { Link } from 'react-router-dom';
import SportsBetting from '../games/SportsBetting';

export default function SportsBettingPage() {
  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 16, zIndex: 100,
      }}>
        <Link
          to="/"
          style={{
            color: '#8b949e', textDecoration: 'none', fontSize: '0.85rem',
            background: '#161b22', padding: '6px 12px', borderRadius: '6px',
            border: '1px solid #30363d', display: 'inline-block',
          }}
        >
          ← Game Vault
        </Link>
      </div>
      <SportsBetting />
    </>
  );
}
