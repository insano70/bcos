import { getTestDb } from '@/tests/helpers/db-helper'
import { users } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

/**
 * Clean up test data from the database
 * Removes test users and other test-created entities
 * Should be used sparingly - transaction rollback is preferred
 */
export async function cleanupTestData() {
  const db = getTestDb()

  try {
    // Delete test users (identified by test email domain)
    await db.delete(users).where(sql`email LIKE '%@test.local'`)

    console.log('✅ Test data cleanup completed')
  } catch (error) {
    console.error('❌ Test data cleanup failed:', error)
    throw error
  }
}

/**
 * Emergency cleanup - removes all test data matching common patterns
 * Use with caution - this is more aggressive than normal cleanup
 */
export async function emergencyCleanup() {
  const db = getTestDb()

  try {
    // More aggressive cleanup patterns
    await db.delete(users).where(sql`email LIKE '%test_%@%'`)
    await db.delete(users).where(sql`username LIKE 'user_%_%'`)
    await db.delete(users).where(sql`first_name = 'Test' AND last_name = 'User'`)

    console.log('✅ Emergency cleanup completed')
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error)
    throw error
  }
}
