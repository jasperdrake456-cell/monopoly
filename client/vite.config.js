import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    // Increase threshold slightly so useful split points aren't over-fragmented
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // Vendor: Socket.io client
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client')) {
            return 'vendor-socket';
          }
          // Vendor: chess
          if (id.includes('node_modules/chess.js')) {
            return 'vendor-chess';
          }
          // Games chunk — heavy game components loaded lazily
          if (id.includes('/src/games/Monopoly') || id.includes('/src/games/Chess')) {
            return 'games-heavy';
          }
          if (id.includes('/src/games/SportsBetting') || id.includes('/src/games/HorseRacing')) {
            return 'games-sports';
          }
          if (id.includes('/src/games/Slots') || id.includes('/src/games/Roulette') || id.includes('/src/games/Blackjack')) {
            return 'games-casino';
          }
          if (id.includes('/src/games/CrossyRoad') || id.includes('/src/games/Snake') || id.includes('/src/games/FlappyBird')) {
            return 'games-arcade';
          }
          // Admin chunk
          if (id.includes('/src/pages/AdminPage')) {
            return 'admin';
          }
        },
      },
    },
  },
});
