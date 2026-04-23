import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import AccountWidget from '../components/AccountWidget';
import { useAuth } from '../contexts/AuthContext';
import { useChampion, invalidateChampionCache } from '../hooks/useChampion';
import LiveWinsTicker from '../components/LiveWinsTicker';
import DailyMissions from '../components/DailyMissions';
import HotStreakBanner from '../components/HotStreakBanner';
import CommunityRainPool from '../components/CommunityRainPool';
import MysteryBox from '../components/MysteryBox';
import NewsBanner from '../components/NewsBanner';
import LiveJackpots from '../components/LiveJackpots';
import OnlineCount from '../components/OnlineCount';
import DailyCheckIn from '../components/DailyCheckIn';
import LuckyNumbers from '../components/LuckyNumbers';
import CryptoPrices from '../components/CryptoPrices';
import JackpotRushBanner from '../components/JackpotRushBanner';
import DailyGoals from '../components/DailyGoals';
import BigWinsBoard from '../components/BigWinsBoard';
import FlashEventBanner from '../components/FlashEventBanner';
import WishingWell from '../components/WishingWell';
import LiveFeedTicker from '../components/LiveFeedTicker';
import EggHunt from '../components/EggHunt';
import GiftButton from '../components/GiftButton';
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
  { path: '/coin-flip',      name: 'Coin Flip',      desc: '50/50 — pick heads or tails and win 1.95× your bet!', icon: '🪙', players: '1 player' },
  { path: '/limbo',          name: 'Limbo',          desc: 'Set your target multiplier — launch and win if the result clears it!', icon: '🚀', players: '1 player' },
  { path: '/scratch-card',   name: 'Scratch Card',   desc: 'Reveal all 9 tiles — match 3 symbols to win up to 50× your bet!', icon: '🎟️', players: '1 player' },
  { path: '/casino-war',     name: 'Casino War',     desc: 'Higher card wins — tie? Go to War for double the stakes!', icon: '⚔️', players: '1 player' },
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

// ── Lucky Game of the Day (per-user, deterministic by username+date) ──────────
function getLuckyGame(username) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const str = (username || 'guest') + dateStr;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash |= 0;
  }
  return CASINO_GAMES[Math.abs(hash) % CASINO_GAMES.length];
}

function LuckyGameWidget({ username }) {
  const game = getLuckyGame(username);
  return (
    <div style={{
      background: 'linear-gradient(135deg,#0a2e1a,#0a1a0a)',
      border: '1px solid rgba(34,197,94,.3)',
      borderRadius: 14,
      padding: '14px 16px',
    }}>
      <div style={{ fontSize:'0.72rem', textTransform:'uppercase', letterSpacing:'.08em', color:'#22c55e', marginBottom:6 }}>🍀 Your Lucky Game Today</div>
      <Link to={game.path} style={{ textDecoration:'none', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:'1.8rem' }}>{game.icon}</span>
        <div>
          <div style={{ fontWeight:800, color:'#e2e8f0', fontSize:'0.95rem' }}>{game.name}</div>
          <div style={{ fontSize:'0.78rem', color:'#94a3b8' }}>The stars align for you today 🌟</div>
        </div>
        <div style={{ marginLeft:'auto', background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', borderRadius:8, padding:'5px 12px', fontSize:'0.82rem', fontWeight:700 }}>Play Now</div>
      </Link>
    </div>
  );
}

// Slug → display name lookup (must stay in sync with CASINO_GAMES below)
const SLUG_NAMES = {
  crash: 'Crash', plinko: 'Plinko', dice: 'Dice', roulette: 'Roulette',
  blackjack: 'Blackjack', baccarat: 'Baccarat', mines: 'Mines',
  'ride-the-bus': 'Ride the Bus', slots: 'Slots', 'chicken-cross': 'Chicken Cross',
  'texas-holdem': "Texas Hold'em", hilo: 'HiLo', tower: 'Tower',
  wheel: 'Wheel', 'video-poker': 'Video Poker', keno: 'Keno',
  'dragon-tiger': 'Dragon Tiger',
  'coin-flip': 'Coin Flip',
  limbo: 'Limbo',
  'scratch-card': 'Scratch Card',
  'casino-war': 'Casino War',
};

export default function HomePage() {
  const { user, token, isLoggedIn } = useAuth();
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
        <div className="home-logo" style={{ display:'flex', alignItems:'center', gap:10 }}>🎮 Game Vault <OnlineCount /></div>
        <div className="home-header-right">
          <Link to="/cases" className="home-trivia-btn" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.22), rgba(244,114,182,0.18), rgba(192,132,252,0.18))', borderColor: 'rgba(251,191,36,0.6)', color: '#fde047', fontWeight: 900, letterSpacing: '0.5px', boxShadow: '0 0 14px rgba(251,191,36,0.35)' }}>📦 CASES</Link>
          <Link to="/jokers" className="home-trivia-btn" style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.22), rgba(192,132,252,0.18))', borderColor: 'rgba(244,114,182,0.6)', color: '#f9a8d4', fontWeight: 900, letterSpacing: '0.5px', boxShadow: '0 0 14px rgba(244,114,182,0.35)' }}>🃏 JOKERS</Link>
          <Link to="/auction" className="home-trivia-btn" style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.45)', color: '#fcd34d', fontWeight: 800 }}>🏛️ Auction</Link>
          {isLoggedIn && <Link to="/trading" className="home-trivia-btn" style={{ background: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.45)', color: '#93c5fd', fontWeight: 800 }}>🤝 Trade</Link>}
          <Link to="/daily-spin" className="home-trivia-btn" style={{ background: 'rgba(124,58,237,0.18)', borderColor: 'rgba(192,132,252,0.4)', color: '#c084fc' }}>🎡 Daily Spin</Link>
          <Link to="/lottery"    className="home-trivia-btn" style={{ background: 'rgba(168,85,247,0.14)', borderColor: 'rgba(168,85,247,0.4)', color: '#d8b4fe' }}>🎟️ Lottery</Link>
          <Link to="/wager-race" className="home-trivia-btn" style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d' }}>🏁 Wager Race</Link>
          <Link to="/pvp"        className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.12)',  borderColor: 'rgba(239,68,68,0.4)',  color: '#fca5a5' }}>🪙 PvP Flip</Link>
          <Link to="/vip"        className="home-trivia-btn" style={{ background: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.4)', color: '#a78bfa' }}>👑 VIP</Link>
          <Link to="/stats"      className="home-trivia-btn" style={{ background: 'rgba(59,130,246,0.12)',  borderColor: 'rgba(59,130,246,0.4)',  color: '#93c5fd' }}>📊 Stats</Link>
          <Link to="/trivia"     className="home-trivia-btn">🎯 Trivia</Link>
          <Link to="/leaderboard" className="home-trivia-btn">🏆 Leaderboard</Link>
          {isChampion && <Link to="/champion-panel" className="home-trivia-btn" style={{ background: 'rgba(255,215,0,0.12)', borderColor: 'rgba(255,215,0,0.45)', color: '#FFD700', fontWeight: 700 }}>👑 Champion Panel</Link>}
          <Link to="/achievements" className="home-trivia-btn" style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.35)', color: '#fcd34d' }}>🏅 Achievements</Link>
          <Link to="/redeem"      className="home-trivia-btn" style={{ background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.35)', color: '#fbbf24' }}>🎟️ Redeem</Link>
          {isLoggedIn && <Link to="/crypto" className="home-trivia-btn" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.45)', color: '#86efac', fontWeight:800 }}>📈 Crypto</Link>}
          {isLoggedIn && <Link to="/bank" className="home-trivia-btn" style={{ background: 'rgba(250,204,21,0.12)', borderColor: 'rgba(250,204,21,0.45)', color: '#fde047', fontWeight:800 }}>🏦 Bank</Link>}
          {isLoggedIn && <GiftButton />}
          <Link to="/predictions" className="home-trivia-btn" style={{ background: 'rgba(236,72,153,0.12)', borderColor: 'rgba(236,72,153,0.45)', color: '#f9a8d4', fontWeight:800 }}>🔮 Predict</Link>
          <Link to="/meme-coins" className="home-trivia-btn" style={{ background: 'rgba(251,146,60,0.12)', borderColor: 'rgba(251,146,60,0.45)', color: '#fdba74', fontWeight:800 }}>🪙 Meme Coins</Link>
          <Link to="/tournaments" className="home-trivia-btn" style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(236,72,153,0.15))', borderColor: 'rgba(251,191,36,0.55)', color: '#fbbf24', fontWeight:900, letterSpacing:'0.5px' }}>🏆 Tournaments</Link>
          <Link to="/season-pass" className="home-trivia-btn" style={{ background: 'linear-gradient(135deg, rgba(192,132,252,0.18), rgba(236,72,153,0.12))', borderColor: 'rgba(192,132,252,0.5)', color: '#c084fc', fontWeight:900 }}>🎫 Season Pass</Link>
          {isLoggedIn && <Link to="/pets" className="home-trivia-btn" style={{ background: 'rgba(94,234,212,0.12)', borderColor: 'rgba(94,234,212,0.45)', color: '#5eead4', fontWeight:800 }}>🐾 Pets</Link>}
          {isLoggedIn && <Link to="/factory" className="home-trivia-btn" style={{ background: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.45)', color: '#4ade80', fontWeight:800 }}>🏭 Factory</Link>}
          <Link to="/duels" className="home-trivia-btn" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(251,191,36,0.1))', borderColor: 'rgba(239,68,68,0.5)', color: '#f87171', fontWeight:900 }}>⚔️ Duels</Link>
          {isLoggedIn && <Link to="/boost" className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5' }}>🚀 Boost</Link>}
          {isLoggedIn && <Link to="/profile" className="home-trivia-btn" style={{ background: 'rgba(96,165,250,0.1)', borderColor: 'rgba(96,165,250,0.35)', color: '#93c5fd' }}>👤 Profile</Link>}
          {isLoggedIn && <Link to="/prestige" className="home-trivia-btn" style={{ background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.35)', color: '#fbbf24' }}>⭐ Prestige</Link>}
          {isLoggedIn && <Link to="/titles" className="home-trivia-btn" style={{ background: 'rgba(192,132,252,0.1)', borderColor: 'rgba(192,132,252,0.35)', color: '#c084fc' }}>🏷️ Titles</Link>}
          {isLoggedIn && <Link to="/transactions" className="home-trivia-btn" style={{ background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.35)', color: '#7dd3fc' }}>📜 History</Link>}
          <Link to="/house-stats" className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5' }}>🏛️ House Stats</Link>
          <Link to="/search"     className="home-trivia-btn" style={{ background: 'rgba(148,163,184,0.1)', borderColor: 'rgba(148,163,184,0.35)', color: '#94a3b8' }}>🔍 Search</Link>
          <Link to="/win-streaks" className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5' }}>🔥 Streaks</Link>
          {isAdmin && <Link to="/admin" className="home-trivia-btn" style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5' }}>🛡️ Admin</Link>}
          <AccountWidget />
        </div>
      </header>

      <section className="home-hero">
        <h1 className="home-hero-title">GAME&nbsp;VAULT</h1>
        <div className="home-hero-sub">Casino · Crypto · Prediction Markets · Meme Coins · 70+ Games</div>
        <div className="home-hero-stats">
          <div className="home-hero-stat">
            <div className="home-hero-stat-label">Live Players</div>
            <div className="home-hero-stat-value"><OnlineCount /></div>
          </div>
          <div className="home-hero-stat">
            <div className="home-hero-stat-label">Games</div>
            <div className="home-hero-stat-value">70+</div>
          </div>
          <div className="home-hero-stat">
            <div className="home-hero-stat-label">Daily Drops</div>
            <div className="home-hero-stat-value" style={{ background:'linear-gradient(135deg,#22c55e,#86efac)', WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent' }}>$500k+</div>
          </div>
        </div>
      </section>

      <main className="home-main">
        <FlashEventBanner />
        <LiveFeedTicker />
        <HotStreakBanner />
        <NewsBanner />
        <JackpotRushBanner />
        <LiveJackpots />
        <LiveWinsTicker />

        {/* ── Big Wins Board with emoji reactions ── */}
        <section className="home-section" style={{ paddingTop:8, paddingBottom:8 }}>
          <BigWinsBoard />
        </section>

        {/* ── Crypto prices ticker ── */}
        <section className="home-section" style={{ paddingTop:8, paddingBottom:8 }}>
          <CryptoPrices />
        </section>

        {/* ── Special Features row ── */}
        <section className="home-section" style={{ paddingBottom: 0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
            <CommunityRainPool />
            <WishingWell />
            {isLoggedIn && <EggHunt />}
            <MysteryBox />
            {isLoggedIn && user && <LuckyGameWidget username={user.username} />}
            {isLoggedIn && <DailyCheckIn />}
            <LuckyNumbers />
            {isLoggedIn && <DailyGoals />}
          </div>
        </section>

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

        {isLoggedIn && token && (
          <section className="home-section">
            <DailyMissions token={token} />
          </section>
        )}

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
