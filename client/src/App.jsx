import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SiteConfigProvider } from './contexts/SiteConfigContext';
import GameGuard from './components/GameGuard';
import ChatPanel from './components/ChatPanel';
import PasswordGate from './components/PasswordGate';
import AnnouncementOverlay from './components/AnnouncementOverlay';
import MoneyRainOverlay from './components/MoneyRainOverlay';
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
import CrashPage from './pages/CrashPage';
import PlinkoPage from './pages/PlinkoPage';
import DicePage from './pages/DicePage';
import RoulettePage from './pages/RoulettePage';
import TexasHoldemPage from './pages/TexasHoldemPage';
import SlotsPage from './pages/SlotsPage';
import CasinoLeaderboardPage from './pages/CasinoLeaderboardPage';
import ChickenCrossPage from './pages/ChickenCrossPage';
import CrossyRoadPage from './pages/CrossyRoadPage';
import HiloPage from './pages/HiloPage';
import TowerPage from './pages/TowerPage';
import WheelPage from './pages/WheelPage';
import VideoPokerPage from './pages/VideoPokerPage';
import KenoPage from './pages/KenoPage';
import DragonTigerPage from './pages/DragonTigerPage';
import RequireAuth from './components/RequireAuth';
import SuggestionsPage from './pages/SuggestionsPage';
import ChampionPage from './pages/ChampionPage';
import SportsBettingPage from './pages/SportsBettingPage';
import UnoPage from './pages/UnoPage';
import HorseRacingPage from './pages/HorseRacingPage';
import DailySpinPage from './pages/DailySpinPage';
import CoinFlipPage from './pages/CoinFlipPage';
import LimboPage from './pages/LimboPage';
import ScratchCardPage from './pages/ScratchCardPage';
import CasinoWarPage from './pages/CasinoWarPage';
import ProfilePage from './pages/ProfilePage';
import WagerRacePage from './pages/WagerRacePage';
import LotteryPage from './pages/LotteryPage';
import PvPPage from './pages/PvPPage';
import VIPPage from './pages/VIPPage';
import GlobalStatsPage from './pages/GlobalStatsPage';
import AchievementToast, { showAchievement, showLevelUp } from './components/AchievementToast';
import CoinRain, { triggerCoinRain } from './components/CoinRain';
import AchievementsPage from './pages/AchievementsPage';
import ReferralPage from './pages/ReferralPage';
import BoostPage from './pages/BoostPage';
import GiftCodePage from './pages/GiftCodePage';
import PrestigePage from './pages/PrestigePage';
import TitlesPage from './pages/TitlesPage';
import HouseStatsPage from './pages/HouseStatsPage';
import TransactionHistoryPage from './pages/TransactionHistoryPage';
import PlayerSearchPage from './pages/PlayerSearchPage';
import WinStreakLeaderboardPage from './pages/WinStreakLeaderboardPage';
import CryptoInvestPage from './pages/CryptoInvestPage';
import BankPage from './pages/BankPage';
import PredictionMarketsPage from './pages/PredictionMarketsPage';
import MemeCoinsPage from './pages/MemeCoinsPage';
import './App.css';

// Convenience wrapper: RequireAuth + GameGuard for a given slug
function GR({ slug, children }) {
  return (
    <RequireAuth>
      <GameGuard slug={slug}>{children}</GameGuard>
    </RequireAuth>
  );
}

function GlobalEventListeners() {
  React.useEffect(() => {
    function onXP(e) {
      const { unlocked = [], leveledUp, levelInfo } = e.detail || {};
      unlocked.forEach(a => showAchievement(a));
      if (leveledUp && levelInfo) showLevelUp(levelInfo);
    }
    function onCoinRain(e) {
      const { amount, message } = e.detail || {};
      triggerCoinRain(amount, message);
    }
    window.addEventListener('xpEvent', onXP);
    window.addEventListener('coinRain', onCoinRain);
    return () => {
      window.removeEventListener('xpEvent', onXP);
      window.removeEventListener('coinRain', onCoinRain);
    };
  }, []);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <SiteConfigProvider>
        <GlobalEventListeners />
        <AchievementToast />
        <CoinRain />
        <ChatPanel />
        <AnnouncementOverlay />
        <MoneyRainOverlay />
        <PasswordGate>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/champion-panel" element={<ChampionPage />} />

            {/* Multiplayer */}
            <Route path="/uno"         element={<GR slug="uno"><UnoPage /></GR>} />
            <Route path="/monopoly"    element={<GR slug="monopoly"><MonopolyPage /></GR>} />
            <Route path="/chess"       element={<GR slug="chess"><ChessPage /></GR>} />
            <Route path="/connect4"    element={<GR slug="connect4"><Connect4Page /></GR>} />
            <Route path="/checkers"    element={<GR slug="checkers"><CheckersPage /></GR>} />
            <Route path="/battleship"  element={<GR slug="battleship"><BattleshipPage /></GR>} />

            {/* Arcade */}
            <Route path="/2048"          element={<GR slug="2048"><Game2048Page /></GR>} />
            <Route path="/snake"         element={<GR slug="snake"><SnakePage /></GR>} />
            <Route path="/minesweeper"   element={<GR slug="minesweeper"><MinesweeperPage /></GR>} />
            <Route path="/tetris"        element={<GR slug="tetris"><TetrisPage /></GR>} />
            <Route path="/wordle"        element={<GR slug="wordle"><WordlePage /></GR>} />
            <Route path="/sudoku"        element={<GR slug="sudoku"><SudokuPage /></GR>} />
            <Route path="/space-invaders" element={<GR slug="space-invaders"><SpaceInvadersPage /></GR>} />
            <Route path="/trivia"        element={<GR slug="trivia"><TriviaPage /></GR>} />
            <Route path="/flappy-bird"   element={<GR slug="flappy-bird"><FlappyBirdPage /></GR>} />
            <Route path="/memory-match"  element={<GR slug="memory-match"><MemoryMatchPage /></GR>} />
            <Route path="/pong"          element={<GR slug="pong"><PongPage /></GR>} />
            <Route path="/tic-tac-toe"   element={<GR slug="tic-tac-toe"><TicTacToePage /></GR>} />
            <Route path="/typing-speed"  element={<GR slug="typing-speed"><TypingSpeedPage /></GR>} />

            {/* Casino */}
            <Route path="/ride-the-bus"  element={<GR slug="ride-the-bus"><RideTheBusPage /></GR>} />
            <Route path="/blackjack"     element={<GR slug="blackjack"><BlackjackPage /></GR>} />
            <Route path="/baccarat"      element={<GR slug="baccarat"><BaccaratPage /></GR>} />
            <Route path="/mines"         element={<GR slug="mines"><MinesPage /></GR>} />
            <Route path="/crash"         element={<GR slug="crash"><CrashPage /></GR>} />
            <Route path="/plinko"        element={<GR slug="plinko"><PlinkoPage /></GR>} />
            <Route path="/dice"          element={<GR slug="dice"><DicePage /></GR>} />
            <Route path="/roulette"      element={<GR slug="roulette"><RoulettePage /></GR>} />
            <Route path="/texas-holdem"  element={<GR slug="texas-holdem"><TexasHoldemPage /></GR>} />
            <Route path="/slots"         element={<GR slug="slots"><SlotsPage /></GR>} />
            <Route path="/chicken-cross" element={<GR slug="chicken-cross"><ChickenCrossPage /></GR>} />
            <Route path="/crossy-road"  element={<GR slug="crossy-road"><CrossyRoadPage /></GR>} />
            <Route path="/hilo"          element={<GR slug="hilo"><HiloPage /></GR>} />
            <Route path="/tower"         element={<GR slug="tower"><TowerPage /></GR>} />
            <Route path="/wheel"         element={<GR slug="wheel"><WheelPage /></GR>} />
            <Route path="/video-poker"   element={<GR slug="video-poker"><VideoPokerPage /></GR>} />
            <Route path="/keno"          element={<GR slug="keno"><KenoPage /></GR>} />
            <Route path="/dragon-tiger"  element={<GR slug="dragon-tiger"><DragonTigerPage /></GR>} />
            <Route path="/horse-racing"  element={<GR slug="horse-racing"><HorseRacingPage /></GR>} />
            <Route path="/coin-flip"     element={<GR slug="coin-flip"><CoinFlipPage /></GR>} />
            <Route path="/limbo"         element={<GR slug="limbo"><LimboPage /></GR>} />
            <Route path="/scratch-card"  element={<GR slug="scratch-card"><ScratchCardPage /></GR>} />
            <Route path="/casino-war"    element={<GR slug="casino-war"><CasinoWarPage /></GR>} />

            {/* Non-game pages */}
            <Route path="/daily-spin"         element={<RequireAuth><DailySpinPage /></RequireAuth>} />
            <Route path="/leaderboard"        element={<LeaderboardPage />} />
            <Route path="/casino-leaderboard" element={<CasinoLeaderboardPage />} />
            <Route path="/auth"        element={<AuthPage />} />
            <Route path="/sports-betting" element={<SportsBettingPage />} />
            <Route path="/transfer"    element={<TransferPage />} />
            <Route path="/admin"       element={<AdminPage />} />
            <Route path="/suggestions" element={<SuggestionsPage />} />
            <Route path="/profile"     element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="/wager-race"  element={<WagerRacePage />} />
            <Route path="/lottery"     element={<LotteryPage />} />
            <Route path="/pvp"         element={<RequireAuth><PvPPage /></RequireAuth>} />
            <Route path="/vip"         element={<VIPPage />} />
            <Route path="/stats"        element={<GlobalStatsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/referral"     element={<RequireAuth><ReferralPage /></RequireAuth>} />
            <Route path="/boost"        element={<RequireAuth><BoostPage /></RequireAuth>} />
            <Route path="/redeem"       element={<RequireAuth><GiftCodePage /></RequireAuth>} />
            <Route path="/prestige"     element={<RequireAuth><PrestigePage /></RequireAuth>} />
            <Route path="/titles"      element={<RequireAuth><TitlesPage /></RequireAuth>} />
            <Route path="/house-stats" element={<HouseStatsPage />} />
            <Route path="/transactions" element={<RequireAuth><TransactionHistoryPage /></RequireAuth>} />
            <Route path="/search"      element={<PlayerSearchPage />} />
            <Route path="/win-streaks"   element={<WinStreakLeaderboardPage />} />
            <Route path="/crypto"         element={<RequireAuth><CryptoInvestPage /></RequireAuth>} />
            <Route path="/bank"           element={<RequireAuth><BankPage /></RequireAuth>} />
            <Route path="/predictions"    element={<PredictionMarketsPage />} />
            <Route path="/meme-coins"     element={<MemeCoinsPage />} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        </PasswordGate>
      </SiteConfigProvider>
    </AuthProvider>
  );
}
