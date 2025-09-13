import { beforeEach, afterEach, afterAll } from 'vitest'
import { getTestTransaction, rollbackTransaction, cleanupTestDb } from '@/tests/helpers/db-helper'

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
 * Cleans up database connections
 */
afterAll(async () => {
  await cleanupTestDb()
})
