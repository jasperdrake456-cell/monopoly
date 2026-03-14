import React from 'react';
import { useNavigate } from 'react-router-dom';
import Sudoku from '../games/Sudoku';

export default function SudokuPage() {
  const navigate = useNavigate();
  return <Sudoku onBack={() => navigate('/')} />;
}
