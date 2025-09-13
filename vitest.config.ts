import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node', // Use node environment for database tests
    setupFiles: ['./tests/setup/test-setup.ts'],
    globals: true,
    // Enable parallel execution with proper isolation via AsyncLocalStorage
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true // Each fork gets its own process and database connection
      }
    },
    maxConcurrency: 4, // Allow up to 4 parallel test processes
    testTimeout: 30000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
