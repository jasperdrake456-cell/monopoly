import React from 'react';
import { useNavigate } from 'react-router-dom';
import Game2048 from '../games/Game2048';

export default function Game2048Page() {
  const navigate = useNavigate();
  return <Game2048 onBack={() => navigate('/')} />;
}
