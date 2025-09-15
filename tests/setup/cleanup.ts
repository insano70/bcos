import { getTestDb } from '@/tests/helpers/db-helper'
import { users, practices } from '@/lib/db/schema'
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
    // TEST: console.log('🧹 Starting test data cleanup...')
    
    // Clean up in foreign key dependency order (children first, then parents)
    
    // 1. Clean up RBAC junction tables first (no dependencies)
    await db.delete(user_roles).where(sql`1=1`)
    await db.delete(user_organizations).where(sql`1=1`)
    await db.delete(role_permissions).where(sql`1=1`)
    // TEST: console.log('  ✅ Cleaned up RBAC junction tables')
    
    // 2. Clean up practices (depends on users)
    await db.delete(practices).where(sql`name LIKE 'test_%' OR name LIKE '%test%' OR domain LIKE '%.local'`)
    // TEST: console.log('  ✅ Cleaned up test practices')
    
    // 3. Clean up roles (referenced by role_permissions and user_roles)
    await db.delete(roles).where(sql`name LIKE 'test_%' OR name LIKE 'role_%' OR name LIKE '%test%'`)
    // TEST: console.log('  ✅ Cleaned up test roles')
    
    // 4. Clean up organizations (referenced by user_organizations)
    await db.delete(organizations).where(sql`name LIKE 'test_%' OR slug LIKE 'test_%' OR name LIKE '%test%' OR slug LIKE '%test%'`)
    // TEST: console.log('  ✅ Cleaned up test organizations')

    // 5. Finally clean up users (now that all references are gone)
    const deletedUsers = await db.delete(users).where(sql`email LIKE '%@test.local' OR email LIKE '%test%' OR (first_name = 'Test' AND last_name = 'User')`)
    // TEST: console.log('  ✅ Cleaned up test users')

    // TEST: console.log('✅ Test data cleanup completed successfully')
  } catch (error) {
    // TEST: console.error('❌ Test data cleanup failed:', error)
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
    // TEST: console.log('🚨 Starting emergency cleanup...')
    
    // Clean up in foreign key dependency order (children first, then parents)
    
    // 1. Clean up all RBAC junction tables
    await db.delete(user_roles).where(sql`1=1`)
    await db.delete(user_organizations).where(sql`1=1`)
    await db.delete(role_permissions).where(sql`1=1`)
    // TEST: console.log('  ✅ Emergency cleanup of RBAC junction tables')
    
    // 2. Clean up all practices (aggressive - includes any test patterns)
    await db.delete(practices).where(sql`name LIKE '%test%' OR domain LIKE '%.local' OR domain LIKE '%test%'`)
    // TEST: console.log('  ✅ Emergency cleanup of practices')
    
    // 3. Clean up test roles (more aggressive patterns)
    await db.delete(roles).where(sql`name LIKE '%test%' OR name LIKE '%role%' OR name LIKE 'user_%' OR name LIKE 'org_%' OR name LIKE 'practice_%'`)
    // TEST: console.log('  ✅ Emergency cleanup of test roles')
    
    // 4. Clean up test organizations (more aggressive patterns)
    await db.delete(organizations).where(sql`name LIKE '%test%' OR slug LIKE '%test%' OR name LIKE '%org%'`)
    // TEST: console.log('  ✅ Emergency cleanup of test organizations')

    // 5. Clean up test users (aggressive patterns - now that all references are gone)
    await db.delete(users).where(sql`email LIKE '%test%' OR email LIKE '%@test.local' OR (first_name = 'Test' AND last_name = 'User') OR first_name LIKE 'Test%'`)
    // TEST: console.log('  ✅ Emergency cleanup of test users')

    // TEST: console.log('✅ Emergency cleanup completed successfully')
  } catch (error) {
    // TEST: console.error('❌ Emergency cleanup failed:', error)
    // Don't throw - emergency cleanup should be best-effort
    // TEST: console.log('⚠️  Continuing despite emergency cleanup failure...')
  }
}

/**
 * Clean up data created by a specific test pattern
 * Useful for cleaning up after specific test failures
 */
export async function cleanupByTestPattern(testId: string) {
  const db = getTestDb()

  try {
    // TEST: console.log(`🧹 Starting cleanup for test pattern: ${testId}`)
    
    // Clean up in foreign key dependency order
    const pattern = `%${testId}%`
    
    // 1. Clean up RBAC junction tables first
    await db.delete(user_roles).where(sql`1=1`) // Clear all for safety with specific test
    await db.delete(user_organizations).where(sql`1=1`)
    await db.delete(role_permissions).where(sql`1=1`)
    
    // 2. Clean up practices that include the test ID
    await db.delete(practices).where(sql`name LIKE ${pattern} OR domain LIKE ${pattern}`)
    
    // 3. Clean up roles that include the test ID
    await db.delete(roles).where(sql`name LIKE ${pattern}`)
    
    // 4. Clean up organizations that include the test ID
    await db.delete(organizations).where(sql`name LIKE ${pattern} OR slug LIKE ${pattern}`)

    // 5. Clean up users that include the test ID
    await db.delete(users).where(sql`email LIKE ${pattern} OR first_name LIKE ${pattern} OR last_name LIKE ${pattern}`)

    // TEST: console.log(`✅ Cleanup completed for test pattern: ${testId}`)
  } catch (error) {
    // TEST: console.error(`❌ Cleanup failed for test pattern ${testId}:`, error)
    throw error
  }
}
