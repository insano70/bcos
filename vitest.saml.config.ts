import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    pool: 'threads',
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  }
});

