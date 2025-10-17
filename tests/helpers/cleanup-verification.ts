/**
 * Cleanup Verification Utilities
 *
 * Provides queries to verify test data cleanup is working correctly.
 * Use these to debug cleanup issues or verify no test data remains.
 */

import { like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, roles, user_organizations, user_roles } from '@/lib/db/rbac-schema';
import { chart_definitions, dashboards, practices, users } from '@/lib/db/schema';

/**
 * Count test entities remaining in database
 * Returns counts of test data that should have been cleaned up
 */
export async function countTestEntities() {
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(like(users.user_id, 'test_%'));

  const [orgCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizations)
    .where(like(organizations.organization_id, 'test_%'));

  const [dashboardCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dashboards)
    .where(like(dashboards.dashboard_id, 'test_%'));

  const [chartCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chart_definitions)
    .where(like(chart_definitions.chart_definition_id, 'test_%'));

  const [roleCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(roles)
    .where(
      or(
        like(roles.name, '%test%'),
        like(roles.name, 'user_%'),
        like(roles.name, 'org_%'),
        like(roles.name, 'practice_%')
      )
    );

  const [practiceCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practices)
    .where(
      or(
        like(practices.name, '%test%'),
        like(practices.domain, '%.local'),
        like(practices.domain, '%test%')
      )
    );

  return {
    users: Number(userCount?.count || 0),
    organizations: Number(orgCount?.count || 0),
    dashboards: Number(dashboardCount?.count || 0),
    charts: Number(chartCount?.count || 0),
    roles: Number(roleCount?.count || 0),
    practices: Number(practiceCount?.count || 0),
  };
}

/**
 * Get list of test entities remaining in database
 * Returns actual entity data for debugging
 */
export async function listTestEntities() {
  const testUsers = await db.select().from(users).where(like(users.user_id, 'test_%')).limit(100);

  const testOrgs = await db
    .select()
    .from(organizations)
    .where(like(organizations.organization_id, 'test_%'))
    .limit(100);

  const testDashboards = await db
    .select()
    .from(dashboards)
    .where(like(dashboards.dashboard_id, 'test_%'))
    .limit(100);

  const testCharts = await db
    .select()
    .from(chart_definitions)
    .where(like(chart_definitions.chart_definition_id, 'test_%'))
    .limit(100);

  return {
    users: testUsers,
    organizations: testOrgs,
    dashboards: testDashboards,
    charts: testCharts,
  };
}

/**
 * Count orphaned test data (references non-existent entities)
 * Helps identify cleanup issues where dependencies weren't respected
 */
export async function countOrphanedData() {
  // Dashboards referencing non-existent users
  const [orphanedDashboards] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dashboards)
    .where(sql`${dashboards.created_by} NOT IN (SELECT user_id FROM ${users})`);

  // Charts referencing non-existent users
  const [orphanedCharts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chart_definitions)
    .where(sql`${chart_definitions.created_by} NOT IN (SELECT user_id FROM ${users})`);

  // User roles referencing non-existent users
  const [orphanedUserRoles] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user_roles)
    .where(sql`${user_roles.user_id} NOT IN (SELECT user_id FROM ${users})`);

  // User orgs referencing non-existent users
  const [orphanedUserOrgs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user_organizations)
    .where(sql`${user_organizations.user_id} NOT IN (SELECT user_id FROM ${users})`);

  return {
    dashboards: Number(orphanedDashboards?.count || 0),
    charts: Number(orphanedCharts?.count || 0),
    userRoles: Number(orphanedUserRoles?.count || 0),
    userOrgs: Number(orphanedUserOrgs?.count || 0),
  };
}

/**
 * Verify cleanup completed successfully
 * Returns true if no test data remains, false otherwise
 */
export async function verifyCleanupComplete(): Promise<boolean> {
  const counts = await countTestEntities();
  const orphanedCounts = await countOrphanedData();

  const totalTestEntities = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const totalOrphaned = Object.values(orphanedCounts).reduce((sum, count) => sum + count, 0);

  return totalTestEntities === 0 && totalOrphaned === 0;
}

/**
 * Get detailed cleanup report
 * Returns comprehensive information about test data state
 */
export async function getCleanupReport() {
  const testCounts = await countTestEntities();
  const orphanedCounts = await countOrphanedData();
  const isClean = await verifyCleanupComplete();

  return {
    isClean,
    testEntities: testCounts,
    orphanedEntities: orphanedCounts,
    totalTestEntities: Object.values(testCounts).reduce((sum, count) => sum + count, 0),
    totalOrphaned: Object.values(orphanedCounts).reduce((sum, count) => sum + count, 0),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Find test entities by scope
 * Helps debug scope-specific cleanup issues
 */
export async function findEntitiesByScope(scope: string) {
  const testUsers = await db
    .select()
    .from(users)
    .where(like(users.user_id, `test_user_${scope}%`));

  const testOrgs = await db
    .select()
    .from(organizations)
    .where(like(organizations.organization_id, `test_org_${scope}%`));

  const testDashboards = await db
    .select()
    .from(dashboards)
    .where(like(dashboards.dashboard_id, `test_dashboard_${scope}%`));

  const testCharts = await db
    .select()
    .from(chart_definitions)
    .where(like(chart_definitions.chart_definition_id, `test_chart_${scope}%`));

  return {
    scope,
    users: testUsers,
    organizations: testOrgs,
    dashboards: testDashboards,
    charts: testCharts,
    totalEntities: testUsers.length + testOrgs.length + testDashboards.length + testCharts.length,
  };
}

/**
 * Find entities created by specific user
 * Useful for verifying cascade cleanup worked
 */
export async function findEntitiesCreatedByUser(userId: string) {
  const userDashboards = await db
    .select()
    .from(dashboards)
    .where(sql`${dashboards.created_by} = ${userId}`);

  const userCharts = await db
    .select()
    .from(chart_definitions)
    .where(sql`${chart_definitions.created_by} = ${userId}`);

  return {
    userId,
    dashboards: userDashboards,
    charts: userCharts,
    totalEntities: userDashboards.length + userCharts.length,
    hasOrphanedData: userDashboards.length > 0 || userCharts.length > 0,
  };
}

/**
 * Example usage in tests:
 *
 * ```typescript
 * import { getCleanupReport, verifyCleanupComplete } from '@/tests/helpers/cleanup-verification'
 *
 * // After test suite completes
 * afterAll(async () => {
 *   const report = await getCleanupReport()
 *   console.log('Cleanup Report:', report)
 *
 *   if (!report.isClean) {
 *     console.warn('Test data not fully cleaned up!', report)
 *   }
 * })
 *
 * // Verify no test data before starting tests
 * beforeAll(async () => {
 *   const isClean = await verifyCleanupComplete()
 *   if (!isClean) {
 *     throw new Error('Test database contains leftover test data from previous run')
 *   }
 * })
 *
 * // Debug specific scope
 * it('should clean up scope data', async () => {
 *   const scopeId = 'my-test-scope'
 *   // ... test code ...
 *   await scope.cleanup()
 *
 *   // Verify scope cleanup worked
 *   const remaining = await findEntitiesByScope(scopeId)
 *   expect(remaining.totalEntities).toBe(0)
 * })
 * ```
 */
