/**
 * Validate Migration System Integrity
 * Comprehensive validation before deployment
 *
 * This script is IDEMPOTENT and safe to run multiple times
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

async function validateMigrationIntegrity(): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    errors: [],
    warnings: [],
    info: [],
  };

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    result.errors.push('DATABASE_URL environment variable not set');
    result.passed = false;
    return result;
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('🔍 Validating Migration System Integrity\n');
    console.log(`${'='.repeat(61)}\n`);

    // Check 1: __drizzle_migrations table exists
    console.log('Check 1: Verifying __drizzle_migrations table...');
    try {
      const migrationsCount = await db.execute(
        sql`SELECT COUNT(*) as count FROM __drizzle_migrations`
      );
      const count = migrationsCount[0]?.count ?? 0;
      result.info.push(`Found ${count} applied migrations in database`);
      console.log(`✅ Table exists with ${count} entries\n`);
    } catch (_error) {
      result.errors.push('__drizzle_migrations table does not exist');
      result.passed = false;
      console.log('❌ Table missing\n');
      await client.end();
      return result;
    }

    // Check 2: Load journal
    console.log('Check 2: Loading migration journal...');
    const journalPath = path.join(process.cwd(), 'lib/db/migrations/meta/_journal.json');
    if (!fs.existsSync(journalPath)) {
      result.errors.push('Migration journal not found');
      result.passed = false;
      console.log('❌ Journal missing\n');
      await client.end();
      return result;
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    result.info.push(`Journal contains ${journal.entries.length} migrations`);
    console.log(`✅ Journal loaded (${journal.entries.length} entries)\n`);

    // Check 3: Verify all journal entries have corresponding files
    console.log('Check 3: Verifying migration files exist...');
    const migrationsDir = path.join(process.cwd(), 'lib/db/migrations');
    let missingFiles = 0;
    for (const entry of journal.entries) {
      const expectedFile = path.join(migrationsDir, `${entry.tag}.sql`);
      if (!fs.existsSync(expectedFile)) {
        result.errors.push(`Missing migration file: ${entry.tag}.sql`);
        result.passed = false;
        missingFiles++;
      }
    }
    if (missingFiles === 0) {
      console.log('✅ All migration files exist\n');
    } else {
      console.log(`❌ ${missingFiles} missing files\n`);
    }

    // Check 4: Verify no orphaned migration files
    console.log('Check 4: Checking for orphaned migration files...');
    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace('.sql', ''));

    const journalTags = new Set(journal.entries.map((e: { tag: string }) => e.tag));
    const orphanedFiles = allFiles.filter((f) => !journalTags.has(f));

    if (orphanedFiles.length > 0) {
      for (const file of orphanedFiles) {
        result.warnings.push(`Orphaned migration file: ${file}.sql (not in journal)`);
      }
      console.log(`⚠️  Found ${orphanedFiles.length} orphaned files\n`);
    } else {
      console.log('✅ No orphaned files\n');
    }

    // Check 5: Verify database migrations match journal
    console.log('Check 5: Comparing database migrations to journal...');
    const dbMigrations = await db.execute(
      sql`SELECT hash FROM __drizzle_migrations ORDER BY created_at ASC`
    );

    const dbHashes = new Set<string>(dbMigrations.map((m) => m.hash as string));
    const journalHashes = new Set<string>(journal.entries.map((e: { tag: string }) => e.tag));

    // Check for migrations in DB but not in journal
    const extraInDb = Array.from(dbHashes).filter((h) => !journalHashes.has(h));
    if (extraInDb.length > 0) {
      for (const hash of extraInDb) {
        result.warnings.push(`Migration in DB but not in journal: ${hash}`);
      }
      console.log(`⚠️  ${extraInDb.length} migrations in DB but not in journal\n`);
    }

    // Check for migrations in journal but not in DB
    const missingInDb = Array.from(journalHashes).filter((h) => !dbHashes.has(h));
    if (missingInDb.length > 0) {
      for (const hash of missingInDb) {
        result.errors.push(`Migration in journal but not applied to DB: ${hash}`);
        result.passed = false;
      }
      console.log(`❌ ${missingInDb.length} migrations not applied to DB\n`);
    }

    if (extraInDb.length === 0 && missingInDb.length === 0) {
      console.log('✅ Database and journal match perfectly\n');
    }

    // Check 6: Run drizzle-kit check
    console.log('Check 6: Running drizzle-kit schema check...');
    result.info.push('Use `npx drizzle-kit check` to verify schema matches code');
    console.log('ℹ️  Run `npx drizzle-kit check` separately to verify schema\n');

    await client.end();
  } catch (error: unknown) {
    result.errors.push(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`
    );
    result.passed = false;
    await client.end();
  }

  return result;
}

async function printResults(result: ValidationResult) {
  console.log(`\n${'='.repeat(61)}`);
  console.log('VALIDATION RESULTS');
  console.log(`${'='.repeat(61)}\n`);

  if (result.errors.length > 0) {
    console.log('❌ ERRORS:');
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    for (const warning of result.warnings) {
      console.log(`  - ${warning}`);
    }
    console.log('');
  }

  if (result.info.length > 0) {
    console.log('ℹ️  INFO:');
    for (const info of result.info) {
      console.log(`  - ${info}`);
    }
    console.log('');
  }

  if (result.passed) {
    console.log('✅ MIGRATION SYSTEM IS READY FOR DEPLOYMENT\n');
    return 0;
  } else {
    console.log('❌ MIGRATION SYSTEM HAS ISSUES - FIX BEFORE DEPLOYING\n');
    return 1;
  }
}

if (require.main === module) {
  validateMigrationIntegrity()
    .then(printResults)
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { validateMigrationIntegrity };
