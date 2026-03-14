import React from 'react';
import { useNavigate } from 'react-router-dom';
import Tetris from '../games/Tetris';

export default function TetrisPage() {
  const navigate = useNavigate();
  return <Tetris onBack={() => navigate('/')} />;
}
