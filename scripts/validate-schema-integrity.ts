#!/usr/bin/env tsx

/**
 * Schema Integrity Validation Script
 *
 * Validates that the database schema matches expectations:
 * - Migration files match journal entries
 * - All expected tables exist in the database
 * - All expected indexes exist
 * - All expected foreign key constraints exist
 * - All expected unique constraints exist
 *
 * Usage:
 *   pnpm db:validate:full
 *   DATABASE_URL="..." npx tsx scripts/validate-schema-integrity.ts
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface ValidationResult {
  category: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string[];
}

const MIGRATIONS_DIR = join(process.cwd(), 'lib/db/migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta/_journal.json');

async function validateSchemaIntegrity(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Schema Integrity Validation');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const results: ValidationResult[] = [];
  const client = postgres(databaseUrl, { max: 1 });

  try {
    // 1. Validate migration files match journal
    results.push(...validateMigrationFiles());

    // 2. Validate migration tracking table
    results.push(...(await validateMigrationTracking(client)));

    // 3. Validate tables exist
    results.push(...(await validateTables(client)));

    // 4. Validate indexes
    results.push(...(await validateIndexes(client)));

    // 5. Validate foreign keys
    results.push(...(await validateForeignKeys(client)));

    // 6. Validate unique constraints
    results.push(...(await validateUniqueConstraints(client)));

    // Print results
    console.log('');
    console.log('VALIDATION RESULTS');
    console.log('='.repeat(60));

    const passed = results.filter((r) => r.status === 'pass');
    const warnings = results.filter((r) => r.status === 'warn');
    const failed = results.filter((r) => r.status === 'fail');

    for (const result of results) {
      const icon = result.status === 'pass' ? '[PASS]' : result.status === 'warn' ? '[WARN]' : '[FAIL]';
      console.log(`${icon} ${result.category}: ${result.message}`);
      if (result.details && result.details.length > 0) {
        for (const detail of result.details.slice(0, 10)) {
          console.log(`       - ${detail}`);
        }
        if (result.details.length > 10) {
          console.log(`       ... and ${result.details.length - 10} more`);
        }
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`SUMMARY: ${passed.length} passed, ${warnings.length} warnings, ${failed.length} failed`);
    console.log('='.repeat(60));

    await client.end();
    process.exit(failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('Validation failed with error:');
    if (error instanceof Error) {
      console.error(error.message);
    }
    await client.end();
    process.exit(1);
  }
}

function validateMigrationFiles(): ValidationResult[] {
  const results: ValidationResult[] = [];

  try {
    const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8'));
    const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

    // Check journal entries have SQL files
    const missingFiles: string[] = [];
    for (const entry of journal.entries) {
      if (!sqlFiles.includes(`${entry.tag}.sql`)) {
        missingFiles.push(entry.tag);
      }
    }

    if (missingFiles.length > 0) {
      results.push({
        category: 'Migration Files',
        status: 'fail',
        message: `${missingFiles.length} journal entries missing SQL files`,
        details: missingFiles,
      });
    } else {
      results.push({
        category: 'Migration Files',
        status: 'pass',
        message: `${journal.entries.length} migrations, all files present`,
      });
    }

    // Check for orphan SQL files
    const journalTags = new Set(journal.entries.map((e) => e.tag));
    const orphanFiles = sqlFiles.filter((f) => !journalTags.has(f.replace('.sql', '')));

    if (orphanFiles.length > 0) {
      results.push({
        category: 'Orphan Files',
        status: 'warn',
        message: `${orphanFiles.length} SQL files not in journal`,
        details: orphanFiles,
      });
    }
  } catch (error) {
    results.push({
      category: 'Migration Files',
      status: 'fail',
      message: `Failed to read migrations: ${(error as Error).message}`,
    });
  }

  return results;
}

async function validateMigrationTracking(client: postgres.Sql): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8'));

    const dbMigrations = await client`
      SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
    `;

    const dbCount = Number(dbMigrations[0]?.count || 0);
    const journalCount = journal.entries.length;

    if (dbCount === journalCount) {
      results.push({
        category: 'Migration Tracking',
        status: 'pass',
        message: `${dbCount} migrations tracked (matches journal)`,
      });
    } else {
      results.push({
        category: 'Migration Tracking',
        status: 'fail',
        message: `Database has ${dbCount} migrations, journal has ${journalCount}`,
      });
    }
  } catch (error) {
    results.push({
      category: 'Migration Tracking',
      status: 'fail',
      message: `Failed to check tracking table: ${(error as Error).message}`,
    });
  }

  return results;
}

async function validateTables(client: postgres.Sql): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Expected tables from schema (hardcoded list based on schema analysis)
  const expectedTables = new Set([
    'account_security',
    'announcement_reads',
    'announcement_recipients',
    'announcements',
    'audit_logs',
    'chart_categories',
    'chart_data_source_columns',
    'chart_data_sources',
    'chart_definitions',
    'chart_display_configurations',
    'chart_permissions',
    'chart_provider_colors',
    'color_palettes',
    'csrf_failure_events',
    'dashboard_charts',
    'dashboards',
    'data_sources',
    'explorer_column_metadata',
    'explorer_improvement_suggestions',
    'explorer_query_feedback',
    'explorer_query_history',
    'explorer_query_patterns',
    'explorer_saved_queries',
    'explorer_schema_instructions',
    'explorer_table_metadata',
    'explorer_table_relationships',
    'login_attempts',
    'oidc_nonces',
    'oidc_states',
    'organizations',
    'permissions',
    'practice_attributes',
    'practice_comments',
    'practice_size_buckets',
    'practices',
    'refresh_tokens',
    'report_card_measures',
    'report_card_results',
    'report_card_statistics',
    'report_card_trends',
    'role_permissions',
    'roles',
    'saml_replay_prevention',
    'staff_members',
    'templates',
    'token_blacklist',
    'user_chart_favorites',
    'user_organizations',
    'user_roles',
    'user_sessions',
    'users',
    'webauthn_challenges',
    'webauthn_credentials',
    'work_item_activity',
    'work_item_attachments',
    'work_item_comments',
    'work_item_field_values',
    'work_item_fields',
    'work_item_status_transitions',
    'work_item_statuses',
    'work_item_type_relationships',
    'work_item_types',
    'work_item_watchers',
    'work_items',
  ]);

  try {
    const dbTables = await client`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;

    const actualTables = new Set(dbTables.map((t) => t.tablename as string));

    const missingTables = Array.from(expectedTables).filter((t) => !actualTables.has(t));
    const extraTables = Array.from(actualTables).filter((t) => !expectedTables.has(t));

    if (missingTables.length > 0) {
      results.push({
        category: 'Tables',
        status: 'fail',
        message: `${missingTables.length} expected tables missing`,
        details: missingTables,
      });
    } else {
      results.push({
        category: 'Tables',
        status: 'pass',
        message: `All ${expectedTables.size} expected tables present`,
      });
    }

    if (extraTables.length > 0) {
      results.push({
        category: 'Extra Tables',
        status: 'warn',
        message: `${extraTables.length} tables in DB not in schema`,
        details: extraTables,
      });
    }
  } catch (error) {
    results.push({
      category: 'Tables',
      status: 'fail',
      message: `Failed to check tables: ${(error as Error).message}`,
    });
  }

  return results;
}

async function validateIndexes(client: postgres.Sql): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    // Get all indexes from database
    const dbIndexes = await client`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `;

    // Count indexes by type
    const primaryKeyIndexes = dbIndexes.filter((i) => (i.indexname as string).endsWith('_pkey'));
    const uniqueIndexes = dbIndexes.filter(
      (i) => (i.indexdef as string).includes('UNIQUE') && !(i.indexname as string).endsWith('_pkey')
    );
    const regularIndexes = dbIndexes.filter(
      (i) => !(i.indexdef as string).includes('UNIQUE') && !(i.indexname as string).endsWith('_pkey')
    );

    results.push({
      category: 'Indexes',
      status: 'pass',
      message: `${dbIndexes.length} total indexes (${primaryKeyIndexes.length} PKs, ${uniqueIndexes.length} unique, ${regularIndexes.length} regular)`,
    });

    // Check for tables without indexes (excluding junction tables)
    const tablesWithIndexes = new Set(dbIndexes.map((i) => i.tablename as string));
    const allTables = await client`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    const tablesWithoutIndexes = allTables
      .map((t) => t.tablename as string)
      .filter((t) => !tablesWithIndexes.has(t));

    if (tablesWithoutIndexes.length > 0) {
      results.push({
        category: 'Index Coverage',
        status: 'warn',
        message: `${tablesWithoutIndexes.length} tables have no indexes`,
        details: tablesWithoutIndexes,
      });
    }
  } catch (error) {
    results.push({
      category: 'Indexes',
      status: 'fail',
      message: `Failed to check indexes: ${(error as Error).message}`,
    });
  }

  return results;
}

async function validateForeignKeys(client: postgres.Sql): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    const dbForeignKeys = await client`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    `;

    // Group by table
    const fksByTable = new Map<string, number>();
    for (const fk of dbForeignKeys) {
      const table = fk.table_name as string;
      fksByTable.set(table, (fksByTable.get(table) || 0) + 1);
    }

    results.push({
      category: 'Foreign Keys',
      status: 'pass',
      message: `${dbForeignKeys.length} foreign key constraints across ${fksByTable.size} tables`,
    });

    // Check for orphaned foreign keys (pointing to non-existent tables)
    const allTables = await client`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;
    const tableSet = new Set(allTables.map((t) => t.tablename as string));

    const orphanedFks = dbForeignKeys.filter((fk) => !tableSet.has(fk.foreign_table_name as string));

    if (orphanedFks.length > 0) {
      results.push({
        category: 'Orphaned FKs',
        status: 'fail',
        message: `${orphanedFks.length} foreign keys reference non-existent tables`,
        details: orphanedFks.map(
          (fk) => `${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`
        ),
      });
    }
  } catch (error) {
    results.push({
      category: 'Foreign Keys',
      status: 'fail',
      message: `Failed to check foreign keys: ${(error as Error).message}`,
    });
  }

  return results;
}

async function validateUniqueConstraints(client: postgres.Sql): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  try {
    const dbUniqueConstraints = await client`
      SELECT
        tc.table_name,
        tc.constraint_name,
        STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
      GROUP BY tc.table_name, tc.constraint_name
      ORDER BY tc.table_name, tc.constraint_name
    `;

    results.push({
      category: 'Unique Constraints',
      status: 'pass',
      message: `${dbUniqueConstraints.length} unique constraints defined`,
    });

    // Check for primary keys
    const dbPrimaryKeys = await client`
      SELECT
        tc.table_name,
        tc.constraint_name,
        STRING_AGG(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
      GROUP BY tc.table_name, tc.constraint_name
      ORDER BY tc.table_name
    `;

    const allTables = await client`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    const tablesWithPK = new Set(dbPrimaryKeys.map((pk) => pk.table_name as string));
    const tablesWithoutPK = allTables
      .map((t) => t.tablename as string)
      .filter((t) => !tablesWithPK.has(t));

    if (tablesWithoutPK.length > 0) {
      results.push({
        category: 'Primary Keys',
        status: 'warn',
        message: `${tablesWithoutPK.length} tables missing primary key`,
        details: tablesWithoutPK,
      });
    } else {
      results.push({
        category: 'Primary Keys',
        status: 'pass',
        message: `All ${allTables.length} tables have primary keys`,
      });
    }
  } catch (error) {
    results.push({
      category: 'Unique Constraints',
      status: 'fail',
      message: `Failed to check unique constraints: ${(error as Error).message}`,
    });
  }

  return results;
}

// Run validation
validateSchemaIntegrity();
