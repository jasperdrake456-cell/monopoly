import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import AccountWidget from '../components/AccountWidget';
import { useAuth } from '../contexts/AuthContext';
import { useChampion, invalidateChampionCache } from '../hooks/useChampion';
import './HomePage.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

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

const CASINO_GAMES = [
  { path: '/crash',        name: 'Crash',        desc: 'Ride the multiplier and cash out before it crashes!', icon: '🚀', players: '1 player' },
  { path: '/plinko',       name: 'Plinko',       desc: 'Drop the ball through pegs and land in a bucket', icon: '🎯', players: '1 player' },
  { path: '/dice',         name: 'Dice',         desc: 'Roll over or under your target — set your own odds', icon: '🎲', players: '1 player' },
  { path: '/roulette',     name: 'Roulette',     desc: 'Spin the wheel — bet on numbers, colors, or ranges', icon: '🎡', players: '1 player' },
  { path: '/blackjack',    name: 'Blackjack',    desc: 'Beat the dealer to 21 — Hit, Stand, Double', icon: '♠', players: '1 player' },
  { path: '/baccarat',     name: 'Baccarat',     desc: 'Bet Player, Banker or Tie. Natural 8 or 9 wins!', icon: '🎴', players: '1 player' },
  { path: '/mines',        name: 'Mines',        desc: 'Reveal gems, dodge bombs — cash out before you explode!', icon: '💣', players: '1 player' },
  { path: '/ride-the-bus', name: 'Ride the Bus', desc: 'Guess Red/Black → Hi/Lo → In/Out → Suit. Win up to 20×!', icon: '🚌', players: '1 player' },
  { path: '/slots',         name: 'Slots',         desc: 'Spin the reels — hit 💎💎💎 for 1000× your bet!', icon: '🎰', players: '1 player' },
  { path: '/chicken-cross', name: 'Chicken Cross', desc: 'Cross 8 lanes of cars row by row — cash out before you get hit!', icon: '🐔', players: '1 player' },
  { path: '/texas-holdem',  name: "Texas Hold'em",  desc: 'Community card poker — bet, raise, bluff your way to the pot', icon: '🃏', players: '2-6 players' },
  { path: '/hilo',          name: 'HiLo',           desc: 'Guess higher or lower each flip — compound your multiplier and cash out!', icon: '🃏', players: '1 player' },
  { path: '/tower',         name: 'Tower',           desc: 'Pick a safe tile each floor — climb higher for bigger multipliers!', icon: '🗼', players: '1 player' },
  { path: '/wheel',         name: 'Wheel',           desc: 'Spin the wheel — pick your colour and risk level to win big!', icon: '🎡', players: '1 player' },
  { path: '/video-poker',  name: 'Video Poker',     desc: 'Hold your best cards, draw the rest — Jacks or Better pays!', icon: '🂡', players: '1 player' },
  { path: '/keno',         name: 'Keno',            desc: 'Pick up to 10 numbers — match as many as you can from the draw!', icon: '🎱', players: '1 player' },
  { path: '/dragon-tiger', name: 'Dragon Tiger',    desc: 'One card each — Dragon vs Tiger. Highest card wins. Simple & fast!', icon: '🐉', players: '1 player' },
  { path: '/crossy-road',    name: 'Crossy Road',   desc: 'Hop across roads, rivers and rails — how far can you go?', icon: '🐔', players: '1 player' },
  { path: '/horse-racing',   name: 'Horse Racing',  desc: 'Pick a horse, place your wager, watch the race — 8 horses with real odds!', icon: '🏇', players: '1 player' },
  { path: '/sports-betting', name: 'Sports Betting', desc: 'Bet on real NFL, NBA, MLB, NHL, EPL & MMA games with live odds!', icon: '🏆', players: '1 player' },
];

const MULTI_GAMES = [
  { path: '/uno', name: 'UNO', desc: 'Be the first to empty your hand — call UNO or get caught!', icon: '🃏', players: '2-8 players' },
  { path: '/chess', name: 'Chess', desc: 'Classic strategy board game', icon: '♟️', players: '2 players' },
  { path: '/connect4', name: 'Connect 4', desc: 'Drop discs to get 4 in a row', icon: '🟡', players: '2 players' },
  { path: '/checkers', name: 'Checkers', desc: 'Jump and capture all enemy pieces', icon: '⬛', players: '2 players' },
  { path: '/battleship', name: 'Battleship', desc: 'Sink the enemy fleet', icon: '🚢', players: '2 players' },
  { path: '/monopoly', name: 'Monopoly', desc: 'Buy properties, build houses, bankrupt opponents', icon: '🎩', players: '2-6 players' },
  { path: '/pong', name: 'Pong', desc: 'Classic paddle battle — first to 7 wins', icon: '🏓', players: '2 players' },
  { path: '/tic-tac-toe', name: 'Tic-Tac-Toe', desc: 'Get 3 in a row to win', icon: '❌', players: '2 players' },
];

// Slug → display name lookup (must stay in sync with CASINO_GAMES below)
const SLUG_NAMES = {
  crash: 'Crash', plinko: 'Plinko', dice: 'Dice', roulette: 'Roulette',
  blackjack: 'Blackjack', baccarat: 'Baccarat', mines: 'Mines',
  'ride-the-bus': 'Ride the Bus', slots: 'Slots', 'chicken-cross': 'Chicken Cross',
  'texas-holdem': "Texas Hold'em", hilo: 'HiLo', tower: 'Tower',
  wheel: 'Wheel', 'video-poker': 'Video Poker', keno: 'Keno',
  'dragon-tiger': 'Dragon Tiger',
};

export default function HomePage() {
  const { user } = useAuth();
  const isAdmin = user?.username === 'jasper';
  const [champData, setChampData] = useState({ champion: null, happyHourActive: false });
  const { champion, happyHourActive } = champData;
  const isChampion = user && champion?.username === user.username?.toLowerCase();

  const [wildcard, setWildcard] = useState(null);

  const fetchWildcard = useCallback(() => {
    fetch(`${SERVER_URL}/api/game-config`)
      .then(r => r.json())
      .then(data => { if (data.wildcard) setWildcard(data); })
      .catch(() => {});
  }, []);

  const fetchChampion = useCallback(() => {
    invalidateChampionCache();
    fetch(`${SERVER_URL}/api/champion`)
      .then(r => r.json())
      .then(d => { if (d.ok) setChampData(d); })
      .catch(() => {});
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchWildcard();
    fetchChampion();
  }, [fetchWildcard, fetchChampion]);

  // Real-time updates: listen to /chat announcements (fired on GOTD + HH changes)
  useEffect(() => {
    const socket = io(SERVER_URL + '/chat', { autoConnect: false });
    socket.connect();
    socket.on('announcement', () => {
      fetchWildcard();
      fetchChampion();
    });
    return () => socket.disconnect();
  }, [fetchWildcard, fetchChampion]);

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-logo">🎮 Game Vault</div>
        <div className="home-header-right">
          <Link to="/daily-spin" className="home-trivia-btn" style={{ background: 'rgba(124,58,237,0.18)', borderColor: 'rgba(192,132,252,0.4)', color: '#c084fc' }}>🎡 Daily Spin</Link>
          <Link to="/trivia" className="home-trivia-btn">🎯 Daily Trivia</Link>
          <Link to="/leaderboard" className="home-trivia-btn">🏆 Leaderboard</Link>
          {isChampion && <Link to="/champion-panel" className="home-trivia-btn" style={{ background: 'rgba(255,215,0,0.12)', borderColor: 'rgba(255,215,0,0.45)', color: '#FFD700', fontWeight: 700 }}>👑 Champion Panel</Link>}
          {isAdmin && <Link to="/admin" className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>🛡️ Admin</Link>}
          <AccountWidget />
        </div>
      </header>

      <main className="home-main">
        <section className="home-section">
          <h2 className="home-section-title" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>🎰 Casino</span>
            <Link to="/casino-leaderboard" className="home-trivia-btn" style={{ fontSize:'0.78rem', padding:'5px 12px' }}>💰 Rich List</Link>
          </h2>
          {happyHourActive && (
            <div className="gotd-banner" style={{ background: 'linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,152,0,0.12))', borderColor: 'rgba(255,215,0,0.4)' }}>
              <span className="gotd-star">🎉</span>
              <span className="gotd-label" style={{ color: '#FFD700' }}>HAPPY HOUR</span>
              <span className="gotd-boost" style={{ color: '#FFD700' }}>All casino games pay 1.5× right now!</span>
            </div>
          )}
          {wildcard && (
            <div className="gotd-banner">
              <span className="gotd-star">⭐</span>
              <span className="gotd-label">Game of the Day:</span>
              <span className="gotd-name">
                {SLUG_NAMES[wildcard.wildcardOverride || wildcard.wildcard] || wildcard.wildcardOverride || wildcard.wildcard}
              </span>
              <span className="gotd-boost">{wildcard.wildcardBoost}× better odds today!</span>
            </div>
          )}
          <div className="home-grid">
            {CASINO_GAMES.map(g => (
              <Link key={g.path} to={g.path} className="game-card game-card--casino">
                <div className="game-card-icon">{g.icon}</div>
                <div className="game-card-body">
                  <div className="game-card-name">{g.name}</div>
                  <div className="game-card-desc">{g.desc}</div>
                  <div className="game-card-players">{g.players}</div>
                </div>
                <div className="game-card-play" style={{ background: 'linear-gradient(135deg,#FFD700,#ff9800)', color: '#1a1a1a' }}>Play</div>
              </Link>
            ))}
          </div>
        </section>

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
