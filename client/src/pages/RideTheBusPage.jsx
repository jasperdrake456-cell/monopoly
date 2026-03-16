import React from 'react';
import { Link } from 'react-router-dom';
import RideTheBus from '../games/RideTheBus';
import DailyRewardBanner from '../components/DailyRewardBanner';

export default function RideTheBusPage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#0d3b0e' }}>
      <DailyRewardBanner />
      <div style={{ padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', gap:12, background:'rgba(0,0,0,.3)' }}>
        <Link to="/" style={{ color:'#a5d6a7', textDecoration:'none', fontSize:'0.9rem' }}>← Game Vault</Link>
        <span style={{ color:'#FFD700', fontWeight:700 }}>🚌 Ride the Bus</span>
      </div>
      <div style={{ flex:1 }}>
        <RideTheBus />
      </div>
    </div>
  );
}
