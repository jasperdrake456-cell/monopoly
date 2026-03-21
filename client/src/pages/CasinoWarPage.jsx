import React from 'react';
import { Link } from 'react-router-dom';
import CasinoWar from '../games/CasinoWar';
import DailyRewardBanner from '../components/DailyRewardBanner';

export default function CasinoWarPage() {
  return (
    <>
      <DailyRewardBanner />
      <div style={{ padding: '12px 16px 0' }}>
        <Link
          to="/"
          style={{ color: '#8b949e', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          ← Back to Hub
        </Link>
      </div>
      <CasinoWar />
    </>
  );
}
