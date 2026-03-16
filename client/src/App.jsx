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
        <Route path="/wordle" element={<WordlePage />} />
        <Route path="/sudoku" element={<SudokuPage />} />
        <Route path="/space-invaders" element={<SpaceInvadersPage />} />
        <Route path="/trivia" element={<TriviaPage />} />
        <Route path="/flappy-bird" element={<FlappyBirdPage />} />
        <Route path="/memory-match" element={<MemoryMatchPage />} />
        <Route path="/pong" element={<PongPage />} />
        <Route path="/tic-tac-toe" element={<TicTacToePage />} />
        <Route path="/typing-speed" element={<TypingSpeedPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/ride-the-bus" element={<RideTheBusPage />} />
        <Route path="/blackjack" element={<BlackjackPage />} />
        <Route path="/baccarat" element={<BaccaratPage />} />
        <Route path="/mines" element={<MinesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PasswordGate>
  );
}
