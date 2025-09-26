import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { cpus } from 'os';
import dotenv from 'dotenv';

// Load environment variables from .env.test
dotenv.config({ path: '.env.test' });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/unit-setup.ts'],
    globalSetup: ['./tests/setup/global-setup.ts'],
    globals: true,

    // Enable true parallel execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Allow multiple worker processes
        isolate: true,     // Each fork gets its own isolated environment
        execArgv: ['--max-old-space-size=4096'] // Increase memory for test processes
      }
    },

    // Maximize parallel execution
    maxConcurrency: Math.min(cpus().length, 8), // Use available CPUs, max 8
    fileParallelism: true, // Run test files in parallel

    // Timeouts for database operations
    testTimeout: 30000,
    hookTimeout: 30000,

    // Retry failed tests once (useful for flaky database tests)
    retry: 1,

    // Reporter configuration
    reporters: process.env.CI ? ['junit', 'github-actions'] : ['verbose'],
    ...(process.env.CI && { outputFile: './test-results.xml' }),

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/',
        '.next/'
      ],
      // Initial Phase 1 thresholds - will be increased in subsequent phases
      thresholds: {
        statements: 15,
        branches: 10,
        functions: 15,
        lines: 15
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@tests': resolve(__dirname, './tests'),
    },
  }
});
