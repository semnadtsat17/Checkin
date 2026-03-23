import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve shared package directly from source so Vite picks up
      // JSON translation changes without needing a shared rebuild or
      // cache clearing. The pre-bundled dist cache was the cause of
      // stale workPattern.* keys appearing as raw strings in the UI.
      '@hospital-hr/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/photos': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
