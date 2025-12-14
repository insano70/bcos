#!/usr/bin/env tsx
/**
 * Comprehensive Test Data Cleanup Script
 *
 * This script removes all test data from the local database.
 * It handles FK constraints by deleting in the correct dependency order.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-test-data.ts           # Interactive mode (prompts for confirmation)
 *   pnpm tsx scripts/cleanup-test-data.ts --force   # Skip confirmation (use with caution)
 *   pnpm tsx scripts/cleanup-test-data.ts --dry-run # Show what would be deleted without deleting
 *
 * Safety:
 *   - NEVER run against production database
 *   - Always backs up counts before deletion
 *   - Reports exactly what was deleted
 */

import * as readline from 'node:readline';

// Load .env.local BEFORE importing modules that need environment variables
// This MUST happen before any dynamic imports below
import { config } from 'dotenv';
config({ path: '.env.local' });

// Parse command line arguments (safe to do before imports)
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

// Test user identification patterns
const TEST_USER_PATTERN = `email LIKE '%@test.local' OR email LIKE '%test%' OR first_name LIKE 'Test%'`;
const TEST_ORG_PATTERN = `name LIKE 'Test%' OR name LIKE 'test_%' OR slug LIKE 'test_%'`;
const TEST_ROLE_PATTERN = `name LIKE 'test_%' OR name LIKE '%test%'`;

// Helper to get affected row count from raw SQL execution
// The postgres-js driver returns an object with .count for DELETE operations
type SqlResult = { count?: number } & unknown[];
function getRowCount(result: unknown): number {
  const r = result as SqlResult;
  return Number(r.count ?? (Array.isArray(result) ? result.length : 0));
}

async function promptForConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  // Dynamic imports - these run AFTER dotenv has loaded
  const { sql } = await import('drizzle-orm');

  // Now load environment validation and database
  await import('@/lib/env');
  const { db } = await import('@/lib/db');

  /**
   * Clean work item related data (highest dependency level)
   */
  async function cleanWorkItems(): Promise<number> {
    let totalDeleted = 0;

    // Clean by test user
    const testUserSubquery = `SELECT user_id FROM users WHERE ${TEST_USER_PATTERN}`;
    const workItemByUserSubquery = `SELECT work_item_id FROM work_items WHERE created_by IN (${testUserSubquery})`;

    // Clean by test type (various naming patterns used by factories)
    const testTypeSubquery = `SELECT work_item_type_id FROM work_item_types WHERE name LIKE 'Test%' OR name LIKE '%test%' OR name LIKE 'type_test_%'`;
    const workItemByTypeSubquery = `SELECT work_item_id FROM work_items WHERE work_item_type_id IN (${testTypeSubquery})`;

    // Combined: work items created by test users OR with test types
    const allTestWorkItems = `${workItemByUserSubquery} UNION ${workItemByTypeSubquery}`;

    // Delete work item dependencies
    const deps = [
      'work_item_attachments',
      'work_item_comments',
      'work_item_watchers',
      'work_item_activity',
      'work_item_field_values',
    ];

    for (const table of deps) {
      const result = await db.execute(sql.raw(`DELETE FROM ${table} WHERE work_item_id IN (${allTestWorkItems})`));
      totalDeleted += getRowCount(result);
    }

    // Delete work items
    const result = await db.execute(sql.raw(`DELETE FROM work_items WHERE work_item_id IN (${allTestWorkItems})`));
    totalDeleted += getRowCount(result);

    // Delete status transitions for test types
    await db.execute(sql.raw(`
      DELETE FROM work_item_status_transitions
      WHERE from_status_id IN (SELECT work_item_status_id FROM work_item_statuses WHERE work_item_type_id IN (${testTypeSubquery}))
         OR to_status_id IN (SELECT work_item_status_id FROM work_item_statuses WHERE work_item_type_id IN (${testTypeSubquery}))
    `));

    // Delete statuses for test types
    const statusResult = await db.execute(sql.raw(`DELETE FROM work_item_statuses WHERE work_item_type_id IN (${testTypeSubquery})`));
    totalDeleted += getRowCount(statusResult);

    // Delete fields for test types
    await db.execute(sql.raw(`DELETE FROM work_item_fields WHERE work_item_type_id IN (${testTypeSubquery})`));

    // Delete type relationships
    await db.execute(sql.raw(`
      DELETE FROM work_item_type_relationships
      WHERE parent_type_id IN (${testTypeSubquery}) OR child_type_id IN (${testTypeSubquery})
    `));

    // Delete test types
    const typeResult = await db.execute(sql.raw(`DELETE FROM work_item_types WHERE name LIKE 'Test%' OR name LIKE '%test%' OR name LIKE 'type_test_%'`));
    totalDeleted += getRowCount(typeResult);

    return totalDeleted;
  }

  /**
   * Clean chart and dashboard related data
   */
  async function cleanChartsAndDashboards(): Promise<number> {
    let totalDeleted = 0;

    const testUserSubquery = `SELECT user_id FROM users WHERE ${TEST_USER_PATTERN}`;
    const testChartSubquery = `SELECT chart_definition_id FROM chart_definitions WHERE created_by IN (${testUserSubquery})`;
    const testDashboardSubquery = `SELECT dashboard_id FROM dashboards WHERE created_by IN (${testUserSubquery}) OR dashboard_name LIKE 'Test%' OR dashboard_name LIKE '%test%'`;

    // Delete dashboard_charts
    const dcResult = await db.execute(sql.raw(`DELETE FROM dashboard_charts WHERE dashboard_id IN (${testDashboardSubquery}) OR chart_definition_id IN (${testChartSubquery})`));
    totalDeleted += getRowCount(dcResult);

    // Delete user chart favorites
    await db.execute(sql.raw(`DELETE FROM user_chart_favorites WHERE user_id IN (${testUserSubquery})`));

    // Delete chart definitions
    const chartResult = await db.execute(sql.raw(`DELETE FROM chart_definitions WHERE created_by IN (${testUserSubquery})`));
    totalDeleted += getRowCount(chartResult);

    // Delete dashboards
    const dashResult = await db.execute(sql.raw(`DELETE FROM dashboards WHERE created_by IN (${testUserSubquery}) OR dashboard_name LIKE 'Test%' OR dashboard_name LIKE '%test%'`));
    totalDeleted += getRowCount(dashResult);

    return totalDeleted;
  }

  /**
   * Clean auth and security related data for test users
   */
  async function cleanAuthData(): Promise<number> {
    let totalDeleted = 0;

    const testUserSubquery = `SELECT user_id FROM users WHERE ${TEST_USER_PATTERN}`;

    const tables = [
      'webauthn_credentials',
      'webauthn_challenges',
      'user_sessions',
      'refresh_tokens',
      'account_security',
      'announcement_reads',
      'announcement_recipients',
    ];

    for (const table of tables) {
      try {
        const result = await db.execute(sql.raw(`DELETE FROM ${table} WHERE user_id IN (${testUserSubquery})`));
        totalDeleted += getRowCount(result);
      } catch {
        // Some tables might have different column names, ignore errors
      }
    }

    // Login attempts use email directly
    const loginResult = await db.execute(sql.raw(`DELETE FROM login_attempts WHERE email LIKE '%@test.local' OR email LIKE '%test%'`));
    totalDeleted += getRowCount(loginResult);

    return totalDeleted;
  }

  /**
   * Clean practice related data
   */
  async function cleanPractices(): Promise<number> {
    let totalDeleted = 0;

    const testPracticeSubquery = `SELECT practice_id FROM practices WHERE name LIKE 'Test%' OR name LIKE '%test%' OR domain LIKE '%.local'`;

    const tables = ['practice_comments', 'practice_attributes', 'staff_members'];
    for (const table of tables) {
      try {
        const result = await db.execute(sql.raw(`DELETE FROM ${table} WHERE practice_id IN (${testPracticeSubquery})`));
        totalDeleted += getRowCount(result);
      } catch {
        // Ignore errors
      }
    }

    const result = await db.execute(sql.raw(`DELETE FROM practices WHERE name LIKE 'Test%' OR name LIKE '%test%' OR domain LIKE '%.local'`));
    totalDeleted += getRowCount(result);

    return totalDeleted;
  }

  /**
   * Clean RBAC junction tables
   */
  async function cleanRBACJunctions(): Promise<number> {
    let totalDeleted = 0;

    const testUserSubquery = `SELECT user_id FROM users WHERE ${TEST_USER_PATTERN}`;
    const testRoleSubquery = `SELECT role_id FROM roles WHERE ${TEST_ROLE_PATTERN}`;

    // User roles
    const urResult = await db.execute(sql.raw(`DELETE FROM user_roles WHERE user_id IN (${testUserSubquery})`));
    totalDeleted += getRowCount(urResult);

    // User organizations
    const uoResult = await db.execute(sql.raw(`DELETE FROM user_organizations WHERE user_id IN (${testUserSubquery})`));
    totalDeleted += getRowCount(uoResult);

    // Role permissions
    const rpResult = await db.execute(sql.raw(`DELETE FROM role_permissions WHERE role_id IN (${testRoleSubquery})`));
    totalDeleted += getRowCount(rpResult);

    return totalDeleted;
  }

  /**
   * Clean roles
   */
  async function cleanRoles(): Promise<number> {
    const result = await db.execute(sql.raw(`DELETE FROM roles WHERE ${TEST_ROLE_PATTERN}`));
    return getRowCount(result);
  }

  /**
   * Clean users
   */
  async function cleanUsers(): Promise<number> {
    const result = await db.execute(sql.raw(`DELETE FROM users WHERE ${TEST_USER_PATTERN}`));
    return getRowCount(result);
  }

  /**
   * Clean organizations
   */
  async function cleanOrganizations(): Promise<number> {
    const result = await db.execute(sql.raw(`DELETE FROM organizations WHERE ${TEST_ORG_PATTERN}`));
    return getRowCount(result);
  }

  /**
   * Count test data
   */
  async function countTestData(): Promise<{ table: string; count: number }[]> {
    const counts: { table: string; count: number }[] = [];

    const queries = [
      { table: 'users', query: `SELECT COUNT(*) as count FROM users WHERE ${TEST_USER_PATTERN}` },
      { table: 'organizations', query: `SELECT COUNT(*) as count FROM organizations WHERE ${TEST_ORG_PATTERN}` },
      { table: 'roles', query: `SELECT COUNT(*) as count FROM roles WHERE ${TEST_ROLE_PATTERN}` },
      { table: 'work_item_types', query: `SELECT COUNT(*) as count FROM work_item_types WHERE name LIKE 'Test%' OR name LIKE '%test%' OR name LIKE 'type_test_%'` },
      { table: 'work_items', query: `SELECT COUNT(*) as count FROM work_items WHERE subject LIKE 'Test%' OR subject LIKE '%test%' OR created_by IN (SELECT user_id FROM users WHERE ${TEST_USER_PATTERN})` },
      { table: 'dashboards', query: `SELECT COUNT(*) as count FROM dashboards WHERE dashboard_name LIKE 'Test%' OR created_by IN (SELECT user_id FROM users WHERE ${TEST_USER_PATTERN})` },
      { table: 'chart_definitions', query: `SELECT COUNT(*) as count FROM chart_definitions WHERE created_by IN (SELECT user_id FROM users WHERE ${TEST_USER_PATTERN})` },
      { table: 'practices', query: `SELECT COUNT(*) as count FROM practices WHERE name LIKE 'Test%' OR domain LIKE '%.local'` },
    ];

    for (const { table, query } of queries) {
      try {
        const result = await db.execute(sql.raw(query));
        // Result is an array-like object, first element contains the count
        const rows = result as unknown as Array<{ count: string | number }>;
        const count = Number(rows[0]?.count || 0);
        if (count > 0) {
          counts.push({ table, count });
        }
      } catch {
        // Ignore count errors
      }
    }

    return counts;
  }

  // Main execution
  console.log('\n========================================');
  console.log('  Test Data Cleanup Script');
  console.log('========================================\n');

  if (isDryRun) {
    console.log('MODE: DRY RUN (no data will be deleted)\n');
  }

  // Safety check
  const dbUrl = process.env.DATABASE_URL || '';
  if (
    dbUrl.includes('prod') ||
    dbUrl.includes('production') ||
    dbUrl.includes('rds.amazonaws.com')
  ) {
    console.error('ERROR: DATABASE_URL appears to be a production database!');
    console.error('This script should NEVER be run against production.');
    process.exit(1);
  }

  // Count test data
  console.log('Analyzing test data...\n');
  const counts = await countTestData();

  if (counts.length === 0) {
    console.log('No test data found. Database is clean.');
    process.exit(0);
  }

  const totalCount = counts.reduce((sum, c) => sum + c.count, 0);

  console.log('Test data found:\n');
  console.log('  Table                    Count');
  console.log('  ─────────────────────────────');
  for (const { table, count } of counts) {
    console.log(`  ${table.padEnd(25)} ${count.toString().padStart(5)}`);
  }
  console.log('  ─────────────────────────────');
  console.log(`  TOTAL                    ${totalCount.toString().padStart(5)}\n`);

  if (isDryRun) {
    console.log('DRY RUN complete. No data was deleted.');
    process.exit(0);
  }

  // Confirm deletion
  if (!isForce) {
    const confirmed = await promptForConfirmation(
      `Delete approximately ${totalCount} test records?`
    );
    if (!confirmed) {
      console.log('Aborted by user.');
      process.exit(0);
    }
  }

  // Execute cleanup in proper FK order
  console.log('\nDeleting test data...\n');

  const results: { step: string; deleted: number }[] = [];

  try {
    // Order matters! Delete children before parents
    let deleted = await cleanWorkItems();
    if (deleted > 0) results.push({ step: 'Work items & types', deleted });

    deleted = await cleanChartsAndDashboards();
    if (deleted > 0) results.push({ step: 'Charts & dashboards', deleted });

    deleted = await cleanAuthData();
    if (deleted > 0) results.push({ step: 'Auth data', deleted });

    deleted = await cleanPractices();
    if (deleted > 0) results.push({ step: 'Practices', deleted });

    deleted = await cleanRBACJunctions();
    if (deleted > 0) results.push({ step: 'RBAC junctions', deleted });

    deleted = await cleanRoles();
    if (deleted > 0) results.push({ step: 'Roles', deleted });

    deleted = await cleanUsers();
    if (deleted > 0) results.push({ step: 'Users', deleted });

    deleted = await cleanOrganizations();
    if (deleted > 0) results.push({ step: 'Organizations', deleted });

  } catch (error) {
    console.error('\nError during cleanup:', error);
    process.exit(1);
  }

  // Summary
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

  console.log('  Cleanup results:');
  for (const { step, deleted } of results) {
    console.log(`    ✓ ${step}: ${deleted} records`);
  }

  console.log('\n========================================');
  console.log(`  Total deleted: ${totalDeleted} records`);
  console.log('========================================\n');

  // Verify
  const remaining = await countTestData();
  if (remaining.length > 0) {
    console.log('Warning: Some test data may remain:');
    for (const { table, count } of remaining) {
      console.log(`  - ${table}: ${count}`);
    }
    console.log('\nYou may need to run the script again.');
  } else {
    console.log('Database cleanup complete. No test data remaining.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
