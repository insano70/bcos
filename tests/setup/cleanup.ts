import { getTestDb } from '@/tests/helpers/db-helper'
import { users } from '@/lib/db/schema'
import { user_organizations, user_roles, roles, role_permissions, organizations } from '@/lib/db/rbac-schema'
import { sql } from 'drizzle-orm'

/**
 * Clean up test data from the database
 * Removes test users, organizations, roles and related RBAC data
 * Should be used sparingly - transaction rollback is preferred for normal tests
 */
export async function cleanupTestData() {
  const db = getTestDb()

  try {
    // Clean up RBAC data in dependency order
    await db.delete(user_roles).where(sql`1=1`)
    await db.delete(user_organizations).where(sql`1=1`)
    await db.delete(role_permissions).where(sql`1=1`)
    await db.delete(roles).where(sql`name LIKE 'test_%' OR name LIKE 'role_%'`)
    await db.delete(organizations).where(sql`name LIKE 'test_%' OR slug LIKE 'test_%'`)

    // Clean up users
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
    // More aggressive RBAC cleanup
    await db.delete(user_roles).where(sql`1=1`)
    await db.delete(user_organizations).where(sql`1=1`)
    await db.delete(role_permissions).where(sql`1=1`)
    await db.delete(roles).where(sql`name LIKE '%test%' OR name LIKE '%role%'`)
    await db.delete(organizations).where(sql`name LIKE '%test%' OR slug LIKE '%test%'`)

    // More aggressive user cleanup
    await db.delete(users).where(sql`email LIKE '%test%'`)
    await db.delete(users).where(sql`first_name = 'Test' AND last_name = 'User'`)

    console.log('✅ Emergency cleanup completed')
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error)
    throw error
  }
}

/**
 * Clean up data created by a specific test pattern
 * Useful for cleaning up after specific test failures
 */
export async function cleanupByTestPattern(testId: string) {
  const db = getTestDb()

  try {
    // Clean up data that includes the test ID in names
    await db.delete(roles).where(sql`name LIKE ${'%' + testId + '%'}`)
    await db.delete(organizations).where(sql`name LIKE ${'%' + testId + '%'}`)
    await db.delete(users).where(sql`username LIKE ${'%' + testId + '%'}`)

    console.log(`✅ Cleanup completed for test pattern: ${testId}`)
  } catch (error) {
    console.error(`❌ Cleanup failed for test pattern ${testId}:`, error)
    throw error
  }
}
