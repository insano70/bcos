import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { cpus } from 'os';
import dotenv from 'dotenv';

// Set NODE_ENV before anything else - this must happen before module imports
// that check NODE_ENV at load time (e.g., test factories)
// Use Object.assign to avoid TypeScript read-only property error
Object.assign(process.env, { NODE_ENV: 'test' });

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

    // Exclude e2e tests from default runs (they require a running server)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
    ],

    // Timeouts for database operations
    testTimeout: 30000,
    hookTimeout: 30000,

    // Ensure NODE_ENV is set for all test processes (including forked workers)
    env: {
      NODE_ENV: 'test',
    },

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
      // Phase 2 thresholds - increased after adding SAML tests
      // Previous: 15% baseline
      // Current: 20% with SAML test coverage added
      // Next: 50% target after full API coverage
      thresholds: {
        statements: 20,
        branches: 15,
        functions: 20,
        lines: 20
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
