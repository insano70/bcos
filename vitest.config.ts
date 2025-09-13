import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // Use node environment for database tests
    setupFiles: ['./tests/setup/test-setup.ts'],
    globals: true,
    // Disable parallel execution for database consistency
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: false
      }
    },
    maxConcurrency: 1,
    testTimeout: 30000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
