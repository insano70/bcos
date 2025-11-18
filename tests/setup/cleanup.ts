// Import db-helper conditionally to avoid compilation issues
import type { drizzle } from 'drizzle-orm/postgres-js';

let getTestDb: () => ReturnType<typeof drizzle>;
try {
  getTestDb = require('@/tests/helpers/db-helper').getTestDb;
} catch (_error) {
  // Fallback for when db-helper is not available during setup
  getTestDb = () => {
    throw new Error('Database helper not available during test setup');
  };
}

import { sql } from 'drizzle-orm';
import {
  organizations,
  role_permissions,
  roles,
  user_organizations,
  user_roles,
} from '@/lib/db/rbac-schema';
import { practices, users } from '@/lib/db/schema';
import { debugLog, debugTiming } from '@/lib/utils/debug';

/**
 * Enhanced Test Data Cleanup with Universal Logging
 * Removes test users, organizations, roles and related RBAC data
 * Should be used sparingly - transaction rollback is preferred for normal tests
 */
export async function cleanupTestData() {
  // CRITICAL: Prevent accidental execution in production
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'SAFETY GUARD: cleanupTestData can only be run in test environment. ' +
        `Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  const db = getTestDb();
  const startTime = Date.now();

  try {
    debugLog.database('🧹 Starting test data cleanup...', {
      operation: 'cleanup_test_data',
      cleanupType: 'comprehensive',
      testEnvironment: process.env.NODE_ENV === 'test',
    });

    // Clean up in foreign key dependency order (children first, then parents)

    // 1. Clean up RBAC junction tables first (no dependencies)
    const rbacStart = Date.now();
    await db.delete(user_roles).where(sql`1=1`);
    await db.delete(user_organizations).where(sql`1=1`);
    await db.delete(role_permissions).where(sql`1=1`);
    debugLog.database('✅ Cleaned up RBAC junction tables', {
      operation: 'rbac_cleanup',
      duration: Date.now() - rbacStart,
      tables: ['user_roles', 'user_organizations', 'role_permissions'],
    });

    // 2. Clean up practices (depends on users)
    const practicesStart = Date.now();
    await db
      .delete(practices)
      .where(sql`name LIKE 'test_%' OR name LIKE '%test%' OR domain LIKE '%.local'`);
    debugLog.database('✅ Cleaned up test practices', {
      operation: 'practices_cleanup',
      duration: Date.now() - practicesStart,
      pattern: 'test_% OR %test% OR %.local',
    });

    // 3. Clean up roles (referenced by role_permissions and user_roles)
    const rolesStart = Date.now();
    await db
      .delete(roles)
      .where(sql`name LIKE 'test_%' OR name LIKE 'role_%' OR name LIKE '%test%'`);
    debugLog.database('✅ Cleaned up test roles', {
      operation: 'roles_cleanup',
      duration: Date.now() - rolesStart,
      pattern: 'test_% OR role_% OR %test%',
    });

    // 4. Clean up organizations (referenced by user_organizations)
    const orgsStart = Date.now();
    await db
      .delete(organizations)
      .where(
        sql`name LIKE 'test_%' OR slug LIKE 'test_%' OR name LIKE '%test%' OR slug LIKE '%test%'`
      );
    debugLog.database('✅ Cleaned up test organizations', {
      operation: 'organizations_cleanup',
      duration: Date.now() - orgsStart,
      pattern: 'test_% OR %test%',
    });

    // 5. Finally clean up users (now that all references are gone)
    const usersStart = Date.now();
    const _deletedUsers = await db
      .delete(users)
      .where(
        sql`email LIKE '%@test.local' OR email LIKE '%test%' OR (first_name = 'Test' AND last_name = 'User')`
      );
    debugLog.database('✅ Cleaned up test users', {
      operation: 'users_cleanup',
      duration: Date.now() - usersStart,
      pattern: '%@test.local OR %test% OR Test User',
    });

    debugTiming('Test data cleanup completed', startTime);
    debugLog.database('✅ Test data cleanup completed successfully', {
      operation: 'cleanup_complete',
      totalDuration: Date.now() - startTime,
      success: true,
      testEnvironment: process.env.NODE_ENV === 'test',
    });
  } catch (error) {
    debugLog.database('❌ Test data cleanup failed', {
      operation: 'cleanup_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
      testEnvironment: process.env.NODE_ENV === 'test',
    });
    throw error;
  }
}

/**
 * Enhanced Emergency Cleanup - removes all test data matching common patterns
 * Use with caution - this is more aggressive than normal cleanup
 */
export async function emergencyCleanup() {
  // CRITICAL: Prevent accidental execution in production
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'SAFETY GUARD: emergencyCleanup can only be run in test environment. ' +
        `Current NODE_ENV: ${process.env.NODE_ENV}`
    );
  }

  const db = getTestDb();
  const startTime = Date.now();

  try {
    debugLog.database('🚨 Starting emergency cleanup...', {
      operation: 'emergency_cleanup',
      cleanupType: 'aggressive_patterns',
      warning: 'aggressive_test_data_removal',
      testEnvironment: process.env.NODE_ENV === 'test',
    });

    // Clean up in foreign key dependency order (children first, then parents)

    // 1. Clean up all RBAC junction tables
    const rbacStart = Date.now();
    await db.delete(user_roles).where(sql`1=1`);
    await db.delete(user_organizations).where(sql`1=1`);
    await db.delete(role_permissions).where(sql`1=1`);
    debugLog.database('✅ Emergency cleanup of RBAC junction tables', {
      operation: 'emergency_rbac_cleanup',
      duration: Date.now() - rbacStart,
      tables: ['user_roles', 'user_organizations', 'role_permissions'],
    });

    // 2. Clean up all practices (aggressive - includes any test patterns)
    const practicesStart = Date.now();
    await db
      .delete(practices)
      .where(sql`name LIKE '%test%' OR domain LIKE '%.local' OR domain LIKE '%test%'`);
    debugLog.database('✅ Emergency cleanup of practices', {
      operation: 'emergency_practices_cleanup',
      duration: Date.now() - practicesStart,
      pattern: '%test% OR %.local OR %test%',
    });

    // 3. Clean up test roles (more aggressive patterns)
    const rolesStart = Date.now();
    await db
      .delete(roles)
      .where(
        sql`name LIKE '%test%' OR name LIKE '%role%' OR name LIKE 'user_%' OR name LIKE 'org_%' OR name LIKE 'practice_%'`
      );
    debugLog.database('✅ Emergency cleanup of test roles', {
      operation: 'emergency_roles_cleanup',
      duration: Date.now() - rolesStart,
      pattern: '%test% OR %role% OR user_% OR org_% OR practice_%',
    });

    // 4. Clean up test organizations (more aggressive patterns)
    const orgsStart = Date.now();
    await db
      .delete(organizations)
      .where(sql`name LIKE '%test%' OR slug LIKE '%test%' OR name LIKE '%org%'`);
    debugLog.database('✅ Emergency cleanup of test organizations', {
      operation: 'emergency_orgs_cleanup',
      duration: Date.now() - orgsStart,
      pattern: '%test% OR %org%',
    });

    // 5. Clean up test users (aggressive patterns - now that all references are gone)
    const usersStart = Date.now();
    await db
      .delete(users)
      .where(
        sql`email LIKE '%test%' OR email LIKE '%@test.local' OR (first_name = 'Test' AND last_name = 'User') OR first_name LIKE 'Test%'`
      );
    debugLog.database('✅ Emergency cleanup of test users', {
      operation: 'emergency_users_cleanup',
      duration: Date.now() - usersStart,
      pattern: '%test% OR %@test.local OR Test User OR Test%',
    });

    debugTiming('Emergency cleanup completed', startTime);
    debugLog.database('✅ Emergency cleanup completed successfully', {
      operation: 'emergency_cleanup_complete',
      totalDuration: Date.now() - startTime,
      success: true,
      testEnvironment: process.env.NODE_ENV === 'test',
    });
  } catch (error) {
    debugLog.database('❌ Emergency cleanup failed', {
      operation: 'emergency_cleanup_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
      bestEffort: true,
    });
    // Don't throw - emergency cleanup should be best-effort
    debugLog.database('⚠️  Continuing despite emergency cleanup failure...', {
      operation: 'emergency_cleanup_recovery',
      bestEffort: true,
    });
  }
}

/**
 * Enhanced Pattern-based Cleanup - removes data created by specific test pattern
 * Useful for cleaning up after specific test failures
 */
export async function cleanupByTestPattern(testId: string) {
  const db = getTestDb();
  const startTime = Date.now();

  try {
    debugLog.database(`🧹 Starting cleanup for test pattern: ${testId}`, {
      operation: 'pattern_cleanup',
      testId,
      cleanupType: 'pattern_specific',
      testEnvironment: process.env.NODE_ENV === 'test',
    });

    // Clean up in foreign key dependency order
    const pattern = `%${testId}%`;

    // 1. Clean up RBAC junction tables first
    const rbacStart = Date.now();
    await db.delete(user_roles).where(sql`1=1`); // Clear all for safety with specific test
    await db.delete(user_organizations).where(sql`1=1`);
    await db.delete(role_permissions).where(sql`1=1`);
    debugLog.database('✅ Pattern cleanup of RBAC junction tables', {
      operation: 'pattern_rbac_cleanup',
      testId,
      duration: Date.now() - rbacStart,
      safetyApproach: 'clear_all_for_pattern_safety',
    });

    // 2. Clean up practices that include the test ID
    const practicesStart = Date.now();
    await db.delete(practices).where(sql`name LIKE ${pattern} OR domain LIKE ${pattern}`);
    debugLog.database('✅ Pattern cleanup of practices', {
      operation: 'pattern_practices_cleanup',
      testId,
      pattern,
      duration: Date.now() - practicesStart,
    });

    // 3. Clean up roles that include the test ID
    const rolesStart = Date.now();
    await db.delete(roles).where(sql`name LIKE ${pattern}`);
    debugLog.database('✅ Pattern cleanup of roles', {
      operation: 'pattern_roles_cleanup',
      testId,
      pattern,
      duration: Date.now() - rolesStart,
    });

    // 4. Clean up organizations that include the test ID
    const orgsStart = Date.now();
    await db.delete(organizations).where(sql`name LIKE ${pattern} OR slug LIKE ${pattern}`);
    debugLog.database('✅ Pattern cleanup of organizations', {
      operation: 'pattern_orgs_cleanup',
      testId,
      pattern,
      duration: Date.now() - orgsStart,
    });

    // 5. Clean up users that include the test ID
    const usersStart = Date.now();
    await db
      .delete(users)
      .where(sql`email LIKE ${pattern} OR first_name LIKE ${pattern} OR last_name LIKE ${pattern}`);
    debugLog.database('✅ Pattern cleanup of users', {
      operation: 'pattern_users_cleanup',
      testId,
      pattern,
      duration: Date.now() - usersStart,
    });

    debugTiming(`Pattern cleanup completed for ${testId}`, startTime);
    debugLog.database(`✅ Cleanup completed for test pattern: ${testId}`, {
      operation: 'pattern_cleanup_complete',
      testId,
      totalDuration: Date.now() - startTime,
      success: true,
      testEnvironment: process.env.NODE_ENV === 'test',
    });
  } catch (error) {
    debugLog.database(`❌ Cleanup failed for test pattern ${testId}`, {
      operation: 'pattern_cleanup_failed',
      testId,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
      testEnvironment: process.env.NODE_ENV === 'test',
    });
    throw error;
  }
}
