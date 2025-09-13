import { beforeEach, afterEach, afterAll } from 'vitest'
import { getTestTransaction, rollbackTransaction, cleanupTestDb } from '@/tests/helpers/db-helper'
import { emergencyCleanup } from './cleanup'

// Ensure environment variables are set for tests
// Only set DATABASE_URL if it's not already set (to avoid overriding existing config)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Global test setup - runs before each test
 * Sets up a fresh database transaction for test isolation
 */
beforeEach(async () => {
  await getTestTransaction()
})

/**
 * Global test teardown - runs after each test
 * Rolls back the transaction to ensure test isolation
 */
afterEach(async () => {
  await rollbackTransaction()
})

/**
 * Global cleanup - runs after all tests complete
 * Performs emergency cleanup of any lingering test data and cleans up connections
 */
afterAll(async () => {
  try {
    // Perform emergency cleanup to remove any test data that might have leaked
    await emergencyCleanup()
  } catch (error) {
    console.warn('⚠️ Emergency cleanup failed:', error)
  } finally {
    // Always clean up database connections
    await cleanupTestDb()
  }
})
