import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@skribble/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: Number(process.env.FRONTEND_PORT) || 5173,
    proxy: {
      // Dev convenience: proxy API + websocket to the backend.
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
