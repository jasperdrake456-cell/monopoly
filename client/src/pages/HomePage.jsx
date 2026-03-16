import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const SOLO_GAMES = [
  { path: '/2048', name: '2048', desc: 'Slide tiles to reach 2048', icon: '🔢', players: '1 player' },
  { path: '/snake', name: 'Snake', desc: 'Eat food, grow longer, survive', icon: '🐍', players: '1 player' },
  { path: '/minesweeper', name: 'Minesweeper', desc: 'Clear the minefield without exploding', icon: '💣', players: '1 player' },
  { path: '/tetris', name: 'Tetris', desc: 'Clear lines before blocks reach the top', icon: '🧱', players: '1 player' },
  { path: '/wordle', name: 'Wordle', desc: 'Guess the 5-letter word in 6 tries', icon: '🟩', players: '1 player' },
  { path: '/sudoku', name: 'Sudoku', desc: 'Fill the grid — 4 difficulty levels, notes & hints', icon: '🔲', players: '1 player' },
  { path: '/space-invaders', name: 'Space Invaders', desc: 'Defend Earth from waves of alien attackers', icon: '👾', players: '1 player' },
  { path: '/flappy-bird', name: 'Flappy Bird', desc: 'Tap to flap through the pipes', icon: '🐦', players: '1 player' },
  { path: '/memory-match', name: 'Memory Match', desc: 'Flip cards and find all matching pairs', icon: '🃏', players: '1 player' },
  { path: '/typing-speed', name: 'Typing Speed', desc: 'Race to type the passage — track your WPM', icon: '⌨️', players: '1 player' },
];

const MULTI_GAMES = [
  { path: '/chess', name: 'Chess', desc: 'Classic strategy board game', icon: '♟️', players: '2 players' },
  { path: '/connect4', name: 'Connect 4', desc: 'Drop discs to get 4 in a row', icon: '🟡', players: '2 players' },
  { path: '/checkers', name: 'Checkers', desc: 'Jump and capture all enemy pieces', icon: '⬛', players: '2 players' },
  { path: '/battleship', name: 'Battleship', desc: 'Sink the enemy fleet', icon: '🚢', players: '2 players' },
  { path: '/monopoly', name: 'Monopoly', desc: 'Buy properties, build houses, bankrupt opponents', icon: '🎩', players: '2-6 players' },
  { path: '/pong', name: 'Pong', desc: 'Classic paddle battle — first to 7 wins', icon: '🏓', players: '2 players' },
  { path: '/tic-tac-toe', name: 'Tic-Tac-Toe', desc: 'Get 3 in a row to win', icon: '❌', players: '2 players' },
];

export default function HomePage() {
  return (
    <div className="home">
      <header className="home-header">
        <div className="home-logo">🎮 Game Hub</div>
        <Link to="/trivia" className="home-trivia-btn">🎯 Daily Trivia</Link>
        <Link to="/leaderboard" className="home-trivia-btn">🏆 Leaderboard</Link>
      </header>

      <main className="home-main">
        <section className="home-section">
          <h2 className="home-section-title">Solo Games</h2>
          <div className="home-grid">
            {SOLO_GAMES.map(g => (
              <Link key={g.path} to={g.path} className="game-card">
                <div className="game-card-icon">{g.icon}</div>
                <div className="game-card-body">
                  <div className="game-card-name">{g.name}</div>
                  <div className="game-card-desc">{g.desc}</div>
                  <div className="game-card-players">{g.players}</div>
                </div>
                <div className="game-card-play">Play</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">Multiplayer Games</h2>
          <div className="home-grid">
            {MULTI_GAMES.map(g => (
              <Link key={g.path} to={g.path} className="game-card">
                <div className="game-card-icon">{g.icon}</div>
                <div className="game-card-body">
                  <div className="game-card-name">{g.name}</div>
                  <div className="game-card-desc">{g.desc}</div>
                  <div className="game-card-players">{g.players}</div>
                </div>
                <div className="game-card-play game-card-play--multi">Play</div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
