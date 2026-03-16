import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import PasswordGate from './components/PasswordGate';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import TransferPage from './pages/TransferPage';
import AdminPage from './pages/AdminPage';
import MonopolyPage from './pages/MonopolyPage';
import Game2048Page from './pages/Game2048Page';
import SnakePage from './pages/SnakePage';
import MinesweeperPage from './pages/MinesweeperPage';
import TetrisPage from './pages/TetrisPage';
import ChessPage from './pages/ChessPage';
import Connect4Page from './pages/Connect4Page';
import CheckersPage from './pages/CheckersPage';
import BattleshipPage from './pages/BattleshipPage';
import WordlePage from './pages/WordlePage';
import SudokuPage from './pages/SudokuPage';
import SpaceInvadersPage from './pages/SpaceInvadersPage';
import TriviaPage from './pages/TriviaPage';
import FlappyBirdPage from './pages/FlappyBirdPage';
import MemoryMatchPage from './pages/MemoryMatchPage';
import PongPage from './pages/PongPage';
import TicTacToePage from './pages/TicTacToePage';
import TypingSpeedPage from './pages/TypingSpeedPage';
import LeaderboardPage from './pages/LeaderboardPage';
import RideTheBusPage from './pages/RideTheBusPage';
import BlackjackPage from './pages/BlackjackPage';
import BaccaratPage from './pages/BaccaratPage';
import MinesPage from './pages/MinesPage';
import RequireAuth from './components/RequireAuth';
import './App.css';

export default function App() {
  return (
    <AuthProvider>
      <PasswordGate>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/monopoly"      element={<RequireAuth><MonopolyPage /></RequireAuth>} />
        <Route path="/2048"          element={<RequireAuth><Game2048Page /></RequireAuth>} />
        <Route path="/snake"         element={<RequireAuth><SnakePage /></RequireAuth>} />
        <Route path="/minesweeper"   element={<RequireAuth><MinesweeperPage /></RequireAuth>} />
        <Route path="/tetris"        element={<RequireAuth><TetrisPage /></RequireAuth>} />
        <Route path="/chess"         element={<RequireAuth><ChessPage /></RequireAuth>} />
        <Route path="/connect4"      element={<RequireAuth><Connect4Page /></RequireAuth>} />
        <Route path="/checkers"      element={<RequireAuth><CheckersPage /></RequireAuth>} />
        <Route path="/battleship"    element={<RequireAuth><BattleshipPage /></RequireAuth>} />
        <Route path="/wordle"        element={<RequireAuth><WordlePage /></RequireAuth>} />
        <Route path="/sudoku"        element={<RequireAuth><SudokuPage /></RequireAuth>} />
        <Route path="/space-invaders" element={<RequireAuth><SpaceInvadersPage /></RequireAuth>} />
        <Route path="/trivia"        element={<RequireAuth><TriviaPage /></RequireAuth>} />
        <Route path="/flappy-bird"   element={<RequireAuth><FlappyBirdPage /></RequireAuth>} />
        <Route path="/memory-match"  element={<RequireAuth><MemoryMatchPage /></RequireAuth>} />
        <Route path="/pong"          element={<RequireAuth><PongPage /></RequireAuth>} />
        <Route path="/tic-tac-toe"   element={<RequireAuth><TicTacToePage /></RequireAuth>} />
        <Route path="/typing-speed"  element={<RequireAuth><TypingSpeedPage /></RequireAuth>} />
        <Route path="/leaderboard"   element={<LeaderboardPage />} />
        <Route path="/ride-the-bus"  element={<RequireAuth><RideTheBusPage /></RequireAuth>} />
        <Route path="/blackjack"     element={<RequireAuth><BlackjackPage /></RequireAuth>} />
        <Route path="/baccarat"      element={<RequireAuth><BaccaratPage /></RequireAuth>} />
        <Route path="/mines"         element={<RequireAuth><MinesPage /></RequireAuth>} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/transfer" element={<TransferPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PasswordGate>
    </AuthProvider>
  );
}
