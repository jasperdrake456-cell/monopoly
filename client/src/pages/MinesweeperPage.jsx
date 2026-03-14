import React from 'react';
import { useNavigate } from 'react-router-dom';
import Minesweeper from '../games/Minesweeper';

export default function MinesweeperPage() {
  const navigate = useNavigate();
  return <Minesweeper onBack={() => navigate('/')} />;
}
