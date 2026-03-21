import React from 'react';
import { Link } from 'react-router-dom';
import DailyRewardBanner from '../components/DailyRewardBanner';
import CoinFlip from '../games/CoinFlip';

export default function CoinFlipPage() {
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
        }}>← Game Vault</Link>
      </div>
      <CoinFlip />
    </>
  );
}
