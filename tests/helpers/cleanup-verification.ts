/**
 * Cleanup Verification Utilities
 *
 * Provides queries to verify test data cleanup is working correctly.
 * Use these to debug cleanup issues or verify no test data remains.
 *
 * Test data identification patterns (must match cleanup-test-data.ts):
 * - Users: email LIKE '%@test.local' OR email LIKE '%test%' OR first_name LIKE 'Test%'
 * - Organizations: name LIKE 'Test%' OR name LIKE 'test_%' OR slug LIKE 'test_%'
 * - Roles: name LIKE 'test_%' OR name LIKE '%test%'
 * - Work item types: name LIKE 'Test%' OR name LIKE '%test%' OR name LIKE 'type_test_%'
 * - Dashboards: dashboard_name LIKE 'Test%' OR dashboard_name LIKE '%test%'
 * - Practices: name LIKE 'Test%' OR domain LIKE '%.local'
 */

import { like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, roles, user_organizations, user_roles } from '@/lib/db/rbac-schema';
import { chart_definitions, dashboards, practices, users, work_item_types } from '@/lib/db/schema';

/**
 * Count test entities remaining in database
 * Returns counts of test data that should have been cleaned up
 *
 * IMPORTANT: These patterns must match scripts/cleanup-test-data.ts
 */
export async function countTestEntities() {
  // Users: identified by test email patterns or Test% first name
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(
      or(
        like(users.email, '%@test.local'),
        like(users.email, '%test%'),
        like(users.first_name, 'Test%')
      )
    );

  // Organizations: identified by Test% or test_% name/slug patterns
  const [orgCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(organizations)
    .where(
      or(
        like(organizations.name, 'Test%'),
        like(organizations.name, 'test_%'),
        like(organizations.slug, 'test_%')
      )
    );

  // Dashboards: identified by Test% or test% name patterns
  const [dashboardCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dashboards)
    .where(or(like(dashboards.dashboard_name, 'Test%'), like(dashboards.dashboard_name, '%test%')));

  // Charts: created by test users (tracked via created_by)
  // Note: Chart names don't follow a consistent test pattern, so we rely on user cleanup
  const [chartCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chart_definitions)
    .where(
      sql`${chart_definitions.created_by} IN (
        SELECT user_id FROM users WHERE email LIKE '%@test.local' OR email LIKE '%test%' OR first_name LIKE 'Test%'
      )`
    );

  // Roles: identified by test_% or %test% name patterns
  const [roleCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(roles)
    .where(or(like(roles.name, 'test_%'), like(roles.name, '%test%')));

  // Practices: identified by Test% name or .local domain
  const [practiceCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practices)
    .where(or(like(practices.name, 'Test%'), like(practices.domain, '%.local')));

  // Work item types: identified by Test%, %test%, or type_test_% patterns
  const [workItemTypeCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(work_item_types)
    .where(
      or(
        like(work_item_types.name, 'Test%'),
        like(work_item_types.name, '%test%'),
        like(work_item_types.name, 'type_test_%')
      )
    );

  return {
    users: Number(userCount?.count || 0),
    organizations: Number(orgCount?.count || 0),
    dashboards: Number(dashboardCount?.count || 0),
    charts: Number(chartCount?.count || 0),
    roles: Number(roleCount?.count || 0),
    practices: Number(practiceCount?.count || 0),
    workItemTypes: Number(workItemTypeCount?.count || 0),
  };
}

/**
 * Get list of test entities remaining in database
 * Returns actual entity data for debugging
 */
export async function listTestEntities() {
  const testUsers = await db
    .select()
    .from(users)
    .where(
      or(
        like(users.email, '%@test.local'),
        like(users.email, '%test%'),
        like(users.first_name, 'Test%')
      )
    )
    .limit(100);

  const testOrgs = await db
    .select()
    .from(organizations)
    .where(
      or(
        like(organizations.name, 'Test%'),
        like(organizations.name, 'test_%'),
        like(organizations.slug, 'test_%')
      )
    )
    .limit(100);

  const testDashboards = await db
    .select()
    .from(dashboards)
    .where(or(like(dashboards.dashboard_name, 'Test%'), like(dashboards.dashboard_name, '%test%')))
    .limit(100);

  const testRoles = await db
    .select()
    .from(roles)
    .where(or(like(roles.name, 'test_%'), like(roles.name, '%test%')))
    .limit(100);

  const testWorkItemTypes = await db
    .select()
    .from(work_item_types)
    .where(
      or(
        like(work_item_types.name, 'Test%'),
        like(work_item_types.name, '%test%'),
        like(work_item_types.name, 'type_test_%')
      )
    )
    .limit(100);

  return {
    users: testUsers,
    organizations: testOrgs,
    dashboards: testDashboards,
    roles: testRoles,
    workItemTypes: testWorkItemTypes,
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
 * Log cleanup verification report to console
 * Can be called from afterAll hooks to warn about test data pollution
 *
 * @param options.silent - If true, only logs if there's pollution
 * @param options.throwOnPollution - If true, throws error when pollution detected
 * @returns The cleanup report
 */
export async function logCleanupVerification(
  options: { silent?: boolean; throwOnPollution?: boolean } = {}
): Promise<ReturnType<typeof getCleanupReport>> {
  const report = await getCleanupReport();
  const { silent = false, throwOnPollution = false } = options;

  if (!report.isClean) {
    // eslint-disable-next-line no-console
    console.warn('\n⚠️  TEST DATA POLLUTION DETECTED');
    // eslint-disable-next-line no-console
    console.warn('═══════════════════════════════════════════════════════════');
    // eslint-disable-next-line no-console
    console.warn('Test entities remaining in database:');

    for (const [entity, count] of Object.entries(report.testEntities)) {
      if (count > 0) {
        // eslint-disable-next-line no-console
        console.warn(`  - ${entity}: ${count}`);
      }
    }

    if (report.totalOrphaned > 0) {
      // eslint-disable-next-line no-console
      console.warn('\nOrphaned data (references non-existent entities):');
      for (const [entity, count] of Object.entries(report.orphanedEntities)) {
        if (count > 0) {
          // eslint-disable-next-line no-console
          console.warn(`  - ${entity}: ${count}`);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.warn('\nRun cleanup with: pnpm tsx scripts/cleanup-test-data.ts');
    // eslint-disable-next-line no-console
    console.warn('═══════════════════════════════════════════════════════════\n');

    if (throwOnPollution) {
      throw new Error(
        `Test database pollution detected: ${report.totalTestEntities} test entities, ${report.totalOrphaned} orphaned records`
      );
    }
  } else if (!silent) {
    // eslint-disable-next-line no-console
    console.log('✅ Test database is clean - no test data pollution detected');
  }

  return report;
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
