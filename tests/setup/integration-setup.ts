import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { log } from '@/lib/logger';
import {
  cleanupTestDb,
  getTestTransaction,
  initializeMainTransaction,
  rollbackTransaction,
} from '@/tests/helpers/db-helper';
import { emergencyCleanup } from './cleanup';

// Register committed factories with the global registry
import '@/tests/factories/committed/setup';

// Ensure environment variables are set for tests
// CRITICAL: DATABASE_URL must be set in environment - never hardcode credentials
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required for integration tests. ' +
      'Set it in your .env.test or CI environment.'
  );
}

// JWT secrets can have defaults for testing (not sensitive in test environment)
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long-for-security';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-at-least-32-characters-long';

/**
 * Initialize main transaction for the entire test session
 * This runs once before all tests in this file
 */
beforeAll(async () => {
  try {
    log.info('Initializing main test transaction', {
      operation: 'testSetup',
      phase: 'transaction',
    });
    await initializeMainTransaction();
  } catch (error) {
    log.error(
      'Failed to initialize main transaction',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'testSetup',
      }
    );
    throw error;
  }
});

/**
 * Per-test setup - runs before each test
 * Sets up a savepoint for individual test isolation
 */
beforeEach(async () => {
  try {
    // Create a savepoint for this test
    await getTestTransaction();
  } catch (error) {
    log.error('Test setup failed', error instanceof Error ? error : new Error(String(error)), {
      operation: 'testSetup',
    });
    throw error;
  }
});

/**
 * Per-test teardown - runs after each test
 * Rolls back to the savepoint to ensure test isolation
 */
afterEach(async () => {
  try {
    // Rollback to the savepoint (undoes all test changes)
    await rollbackTransaction();
  } catch (error) {
    log.warn('Test cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'testCleanup',
    });

    // Try emergency cleanup if normal cleanup fails
    try {
      await emergencyCleanup();
    } catch (emergencyError) {
      log.error(
        'Emergency cleanup failed',
        emergencyError instanceof Error ? emergencyError : new Error(String(emergencyError)),
        {
          operation: 'emergencyCleanup',
        }
      );
    }
  }
});

/**
 * Global cleanup - runs after all tests complete
 * Rolls back main transaction and cleans up connections
 */
afterAll(async () => {
  try {
    // TEST: log.info('🧹 Starting process cleanup...')
    log.info('Starting process cleanup', {
      operation: 'processCleanup',
    });

    // This will rollback the main transaction and clean up connections
    await cleanupTestDb();

    // TEST: log.info('✅ Process cleanup completed')
    log.info('Process cleanup completed', {
      operation: 'processCleanup',
    });
  } catch (error) {
    log.error('Process cleanup failed', error instanceof Error ? error : new Error(String(error)), {
      operation: 'processCleanup',
    });
    // Don't throw - we want tests to complete even if cleanup fails
  }
});
