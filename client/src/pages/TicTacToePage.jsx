import React from 'react';
import { Link } from 'react-router-dom';
import TicTacToe from '../games/TicTacToe';

export default function TicTacToePage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid #21262d', display:'flex', alignItems:'center', gap:12 }}>
        <Link to="/" style={{ color:'#8b949e', textDecoration:'none', fontSize:'0.9rem' }}>← Hub</Link>
        <span style={{ color:'#e6edf3', fontWeight:700 }}>❌ Tic-Tac-Toe</span>
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <TicTacToe />
      </div>
    </div>
  );
}
