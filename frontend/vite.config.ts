import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // three.js / r3f are only reachable through a dynamic import, so Rollup keeps them in the lazy 3D chunk.
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
});
