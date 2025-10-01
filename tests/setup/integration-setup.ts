import { beforeEach, afterEach, afterAll, beforeAll } from 'vitest'
import { initializeMainTransaction, getTestTransaction, rollbackTransaction, cleanupTestDb } from '@/tests/helpers/db-helper'
import { emergencyCleanup } from './cleanup'
import { logger } from '@/lib/logger'

// Ensure environment variables are set for tests
// Only set DATABASE_URL if it's not already set (to avoid overriding existing config)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long-for-security';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-that-is-at-least-32-characters-long';

/**
 * Initialize main transaction for the entire test session
 * This runs once before all tests in this file
 */
beforeAll(async () => {
  try {
    logger.info('Initializing main test transaction', {
      operation: 'testSetup',
      phase: 'transaction'
    })
    await initializeMainTransaction()
  } catch (error) {
    logger.error('Failed to initialize main transaction', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'testSetup'
    })
    throw error
  }
})

/**
 * Per-test setup - runs before each test
 * Sets up a savepoint for individual test isolation
 */
beforeEach(async () => {
  try {
    // Create a savepoint for this test
    await getTestTransaction()
  } catch (error) {
    logger.error('Test setup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'testSetup'
    })
    throw error
  }
})

/**
 * Per-test teardown - runs after each test
 * Rolls back to the savepoint to ensure test isolation
 */
afterEach(async () => {
  try {
    // Rollback to the savepoint (undoes all test changes)
    await rollbackTransaction()
  } catch (error) {
    logger.warn('Test cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'testCleanup'
    })

    // Try emergency cleanup if normal cleanup fails
    try {
      await emergencyCleanup()
    } catch (emergencyError) {
      logger.error('Emergency cleanup failed', {
        error: emergencyError instanceof Error ? emergencyError.message : 'Unknown error',
        operation: 'emergencyCleanup'
      })
    }
  }
})

/**
 * Global cleanup - runs after all tests complete
 * Rolls back main transaction and cleans up connections
 */
afterAll(async () => {
  try {
    // TEST: logger.info('🧹 Starting process cleanup...')
    logger.info('Starting process cleanup', {
      operation: 'processCleanup'
    })

    // This will rollback the main transaction and clean up connections
    await cleanupTestDb()

    // TEST: logger.info('✅ Process cleanup completed')
    logger.info('Process cleanup completed', {
      operation: 'processCleanup'
    })

  } catch (error) {
    logger.error('Process cleanup failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      operation: 'processCleanup'
    })
    // Don't throw - we want tests to complete even if cleanup fails
  }
})
