import React from 'react';
import { Link } from 'react-router-dom';
import DailyRewardBanner from '../components/DailyRewardBanner';
import Slots from '../games/Slots';

export default function SlotsPage() {
  return (
    <>
      <DailyRewardBanner />
      <div style={{ position: 'fixed', top: 12, left: 12, zIndex: 100 }}>
        <Link to="/" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: '0.9rem' }}>← Game Vault</Link>
      </div>
      <Slots />
    </>
  );
}
