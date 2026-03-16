import React from 'react';
import { Link } from 'react-router-dom';
import TypingSpeed from '../games/TypingSpeed';

export default function TypingSpeedPage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid #21262d', display:'flex', alignItems:'center', gap:12 }}>
        <Link to="/" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.9rem' }}>← Game Vault</Link>
        <span style={{ color:'#e6edf3', fontWeight:700 }}>⌨️ Typing Speed</span>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <TypingSpeed />
      </div>
    </div>
  );
}
