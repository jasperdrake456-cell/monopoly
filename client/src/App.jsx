import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PasswordGate from './components/PasswordGate';
import HomePage from './pages/HomePage';
import MonopolyPage from './pages/MonopolyPage';
import Game2048Page from './pages/Game2048Page';
import SnakePage from './pages/SnakePage';
import MinesweeperPage from './pages/MinesweeperPage';
import TetrisPage from './pages/TetrisPage';
import ChessPage from './pages/ChessPage';
import Connect4Page from './pages/Connect4Page';
import CheckersPage from './pages/CheckersPage';
import BattleshipPage from './pages/BattleshipPage';
import './App.css';

export default function App() {
  return (
    <PasswordGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/monopoly" element={<MonopolyPage />} />
        <Route path="/2048" element={<Game2048Page />} />
        <Route path="/snake" element={<SnakePage />} />
        <Route path="/minesweeper" element={<MinesweeperPage />} />
        <Route path="/tetris" element={<TetrisPage />} />
        <Route path="/chess" element={<ChessPage />} />
        <Route path="/connect4" element={<Connect4Page />} />
        <Route path="/checkers" element={<CheckersPage />} />
        <Route path="/battleship" element={<BattleshipPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PasswordGate>
  );
}
