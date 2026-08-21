/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@email-scheduler/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@email-scheduler/config': path.resolve(__dirname, '../../packages/config/src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
