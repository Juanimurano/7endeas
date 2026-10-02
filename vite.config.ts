import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  server: {
    port: 5186,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:8086', ws: true },
      '/health': 'http://127.0.0.1:8086',
    },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
