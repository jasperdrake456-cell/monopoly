import React from 'react';
import { Link } from 'react-router-dom';
import Plinko from '../games/Plinko';
import DailyRewardBanner from '../components/DailyRewardBanner';

export default function PlinkoPage() {
  return (
    <>
      <DailyRewardBanner />
      <div style={{ position: 'fixed', top: 12, left: 12, zIndex: 100 }}>
        <Link to="/" style={{
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontSize: '0.85rem',
          fontFamily: 'Roboto, sans-serif',
        }}>← Game Vault</Link>
      </div>
      <Plinko />
    </>
  );
}
