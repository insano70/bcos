import { beforeEach, afterEach, afterAll, beforeAll } from 'vitest'
import { initializeMainTransaction, getTestTransaction, rollbackTransaction, cleanupTestDb } from '@/tests/helpers/db-helper'
import { emergencyCleanup } from './cleanup'

// Ensure environment variables are set for tests
// Only set DATABASE_URL if it's not already set (to avoid overriding existing config)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Initialize main transaction for the entire test session
 * This runs once before all tests in this file
 */
beforeAll(async () => {
  try {
    console.log('🚀 Initializing main test transaction...')
    await initializeMainTransaction()
  } catch (error) {
    console.error('❌ Failed to initialize main transaction:', error)
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
    console.error('❌ Test setup failed:', error)
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
    console.warn('⚠️ Test cleanup failed:', error)
    
    // Try emergency cleanup if normal cleanup fails
    try {
      await emergencyCleanup()
    } catch (emergencyError) {
      console.warn('⚠️ Emergency cleanup also failed:', emergencyError)
    }
  }
})

/**
 * Global cleanup - runs after all tests complete
 * Rolls back main transaction and cleans up connections
 */
afterAll(async () => {
  try {
    console.log('🧹 Starting process cleanup...')
    
    // This will rollback the main transaction and clean up connections
    await cleanupTestDb()
    
    console.log('✅ Process cleanup completed')
    
  } catch (error) {
    console.error('❌ Process cleanup failed:', error)
    // Don't throw - we want tests to complete even if cleanup fails
  }
})
