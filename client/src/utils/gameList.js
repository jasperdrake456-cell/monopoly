// All games on the platform — slug matches the URL path (without leading /)
// Used by GameGuard and AdminPage Site tab

export const GAME_LIST = [
  // ── Casino ──────────────────────────────────────────────────────────────
  { slug: 'blackjack',    name: 'Blackjack',      category: 'casino' },
  { slug: 'baccarat',     name: 'Baccarat',       category: 'casino' },
  { slug: 'crash',        name: 'Crash',          category: 'casino' },
  { slug: 'mines',        name: 'Mines',          category: 'casino' },
  { slug: 'plinko',       name: 'Plinko',         category: 'casino' },
  { slug: 'dice',         name: 'Dice',           category: 'casino' },
  { slug: 'roulette',     name: 'Roulette',       category: 'casino' },
  { slug: 'slots',        name: 'Slots',          category: 'casino' },
  { slug: 'texas-holdem', name: 'Texas Hold\'em', category: 'casino' },
  { slug: 'ride-the-bus', name: 'Ride the Bus',   category: 'casino' },
  { slug: 'chicken-cross',name: 'Chicken Cross',  category: 'casino' },
  { slug: 'hilo',         name: 'Hi-Lo',          category: 'casino' },
  { slug: 'tower',        name: 'Tower',          category: 'casino' },
  { slug: 'wheel',        name: 'Wheel',          category: 'casino' },
  { slug: 'video-poker',  name: 'Video Poker',    category: 'casino' },
  { slug: 'keno',         name: 'Keno',           category: 'casino' },
  { slug: 'dragon-tiger', name: 'Dragon Tiger',   category: 'casino' },

  // ── Arcade ───────────────────────────────────────────────────────────────
  { slug: '2048',          name: '2048',          category: 'arcade' },
  { slug: 'snake',         name: 'Snake',         category: 'arcade' },
  { slug: 'minesweeper',   name: 'Minesweeper',   category: 'arcade' },
  { slug: 'tetris',        name: 'Tetris',        category: 'arcade' },
  { slug: 'space-invaders',name: 'Space Invaders',category: 'arcade' },
  { slug: 'flappy-bird',   name: 'Flappy Bird',   category: 'arcade' },
  { slug: 'memory-match',  name: 'Memory Match',  category: 'arcade' },
  { slug: 'pong',          name: 'Pong',          category: 'arcade' },
  { slug: 'tic-tac-toe',   name: 'Tic-Tac-Toe',  category: 'arcade' },
  { slug: 'typing-speed',  name: 'Typing Speed',  category: 'arcade' },
  { slug: 'wordle',        name: 'Wordle',        category: 'arcade' },
  { slug: 'sudoku',        name: 'Sudoku',        category: 'arcade' },
  { slug: 'trivia',        name: 'Daily Trivia',  category: 'arcade' },

  // ── Multiplayer ───────────────────────────────────────────────────────────
  { slug: 'monopoly',   name: 'Monopoly',   category: 'multiplayer' },
  { slug: 'chess',      name: 'Chess',      category: 'multiplayer' },
  { slug: 'connect4',   name: 'Connect 4',  category: 'multiplayer' },
  { slug: 'checkers',   name: 'Checkers',   category: 'multiplayer' },
  { slug: 'battleship', name: 'Battleship', category: 'multiplayer' },
];

export const GAME_BY_SLUG = Object.fromEntries(GAME_LIST.map(g => [g.slug, g]));
