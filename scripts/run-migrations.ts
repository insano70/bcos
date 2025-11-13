#!/usr/bin/env node
/**
 * Enhanced Database Migration Runner
 *
 * Runs Drizzle migrations against the database specified by DATABASE_URL
 * with comprehensive logging for production debugging.
 *
 * Exit codes:
 * - 0: Migrations completed successfully
 * - 1: Migration failed or error occurred
 */

import fs from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { log } from '../lib/logger/index.js';

interface MigrationFile {
  name: string;
  path: string;
  index: number;
}

interface AppliedMigration {
  id: number;
  hash: string;
  created_at: Date;
}

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

async function checkDatabaseConnection(client: postgres.Sql): Promise<void> {
  log.info('🔌 Testing database connection...');
  try {
    const result = await client`SELECT version(), current_database(), current_schema()`;
    if (result[0]) {
      log.info(`   ✓ Connected to database: ${result[0].current_database}`);
      log.info(`   ✓ Current schema: ${result[0].current_schema}`);
      log.info(`   ✓ PostgreSQL version: ${result[0].version?.split(' ')[1] || 'unknown'}`);
    }
  } catch (error) {
    log.error('   ✗ Database connection test failed');
    throw error;
  }
}

async function getAppliedMigrations(client: postgres.Sql): Promise<AppliedMigration[]> {
  log.info('\n📋 Checking migration history...');
  log.info('   Querying: SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC');
  try {
    const result = await client<AppliedMigration[]>`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY id ASC
    `;
    log.info('Query succeeded');
    log.info(`Found ${result.length} previously applied migrations`);
    if (result.length > 0) {
      const latest = result[result.length - 1];
      log.info('Latest applied migration', { id: latest?.id, hash: latest?.hash });
      log.info('First 5 migrations', { migrations: result.slice(0, 5).map(m => ({ id: m.id, hash: m.hash })) });
    }
    return result;
  } catch (error) {
    log.error('Query failed - unable to read migration history', {
      errorType: error?.constructor?.name,
      errorMessage: (error as Error)?.message,
      errorCode: (error as any)?.code,
      errorStack: (error as Error)?.stack,
    });
    log.info('Assuming first run - returning empty migration list');
    return [];
  }
}

function getMigrationFiles(migrationsDir: string): MigrationFile[] {
  log.info('\n📁 Scanning migration files...');
  log.info(`   Directory: ${migrationsDir}`);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => {
      const indexMatch = name.match(/^(\d+)_/);
      return {
        name,
        path: path.join(migrationsDir, name),
        index: indexMatch ? parseInt(indexMatch[1] ?? '0', 10) : 0,
      };
    });

  log.info(`   Found ${files.length} migration files:`);
  files.forEach(f => {
    log.info(`     - ${f.name} (idx: ${f.index})`);
  });

  return files;
}

async function runMigrationsWithLogging(): Promise<void> {
  const startTime = Date.now();
  const databaseUrl = process.env.DATABASE_URL;

  // Header
  log.info('═'.repeat(80));
  log.info('🚀 DATABASE MIGRATION RUNNER - ENHANCED LOGGING');
  log.info('═'.repeat(80));
  log.info(`⏰ Start time: ${new Date().toISOString()}`);
  log.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  log.info(`🖥️  Node version: ${process.version}`);
  log.info(`📦 Working directory: ${process.cwd()}`);

  if (!databaseUrl) {
    log.error('\n❌ FATAL: DATABASE_URL environment variable is not set');
    log.error('   Cannot proceed with migrations');
    process.exit(1);
  }

  log.info(`🔗 Database URL: ${maskDatabaseUrl(databaseUrl)}`);

  // Create database connection with migration-specific settings
  log.info('\n⚙️  Initializing database connection...');
  log.info('   Settings:');
  log.info('     - max connections: 1');
  log.info('     - prepare statements: false');
  log.info('     - idle timeout: 30s');

  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 30,
    onnotice: (notice) => {
      // Log PostgreSQL NOTICE messages
      log.info(`   📢 NOTICE [${notice.code}]: ${notice.message}`);
    },
  });

  const db = drizzle(client);

  try {
    // Pre-migration checks
    await checkDatabaseConnection(client);

    const appliedMigrations = await getAppliedMigrations(client);
    const migrationFiles = getMigrationFiles('./lib/db/migrations');

    // Check journal
    const journalPath = './lib/db/migrations/meta/_journal.json';
    log.info('\n📖 Checking migration journal...');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      log.info(`   Journal version: ${journal.version}`);
      log.info(`   Journal entries: ${journal.entries?.length || 0}`);
      log.info(`   Dialect: ${journal.dialect}`);
    } else {
      log.info('   ⚠️  No journal file found');
    }

    // Estimate pending migrations
    const pendingCount = migrationFiles.length - appliedMigrations.length;
    log.info('\n📊 Migration status:');
    log.info(`   Total migration files: ${migrationFiles.length}`);
    log.info(`   Already applied: ${appliedMigrations.length}`);
    log.info(`   Pending (estimated): ${Math.max(0, pendingCount)}`);

    if (pendingCount <= 0) {
      log.info('\n✨ No pending migrations detected');
    } else {
      log.info(`\n🔄 Proceeding to apply ${pendingCount} pending migration(s)...`);
    }

    log.info(`\n${'─'.repeat(80)}`);
    log.info('▶️  EXECUTING MIGRATIONS');
    log.info('─'.repeat(80));

    // Check what Drizzle sees before migrating
    log.info('\n🔍 Pre-migration Drizzle state check...');
    try {
      const drizzleCheck = await client`
        SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
      `;
      log.info('Drizzle schema check', { count: drizzleCheck[0]?.count || 0, schema: 'drizzle.__drizzle_migrations' });
    } catch (error) {
      log.info('Drizzle schema check failed', { error: (error as Error)?.message });
    }

    try {
      const publicCheck = await client`
        SELECT COUNT(*) as count FROM public.__drizzle_migrations
      `;
      log.info('Public schema check', { count: publicCheck[0]?.count || 0, schema: 'public.__drizzle_migrations' });
    } catch (error) {
      log.info('Public schema check failed', { error: (error as Error)?.message });
    }

    // Run migrations with Drizzle
    const migrationStart = Date.now();
    log.info('\n🚀 Starting Drizzle migrate()...');
    log.info(`   Migrations folder: ./lib/db/migrations`);

    await migrate(db, {
      migrationsFolder: './lib/db/migrations',
    });

    log.info('✓ Drizzle migrate() completed');

    const migrationDuration = Date.now() - migrationStart;

    log.info('─'.repeat(80));
    log.info(`✅ MIGRATIONS COMPLETED (${migrationDuration}ms)`);
    log.info('─'.repeat(80));

    // Post-migration verification
    log.info('\n🔍 Post-migration verification...');
    const finalMigrations = await getAppliedMigrations(client);
    const newlyApplied = finalMigrations.length - appliedMigrations.length;

    if (newlyApplied > 0) {
      log.info(`   ✓ Successfully applied ${newlyApplied} new migration(s)`);
      log.info('\n   Newly applied migrations:');
      finalMigrations.slice(-newlyApplied).forEach(m => {
        log.info(`     - Migration #${m.id} (hash: ${m.hash.substring(0, 12)}...)`);
      });
    } else {
      log.info('   ✓ No new migrations were applied (database already up to date)');
    }

    // Summary
    const totalDuration = Date.now() - startTime;
    log.info(`\n${'═'.repeat(80)}`);
    log.info('✅ MIGRATION RUNNER COMPLETED SUCCESSFULLY');
    log.info('═'.repeat(80));
    log.info(`⏱️  Total duration: ${totalDuration}ms`);
    log.info(`⏰ End time: ${new Date().toISOString()}`);
    log.info(`📊 Final migration count: ${finalMigrations.length}`);
    log.info('═'.repeat(80));

    // Close the connection
    await client.end();
    log.info('\n🔌 Database connection closed');

    process.exit(0);
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.info(`\n${'═'.repeat(80)}`);
    log.error('❌ MIGRATION RUNNER FAILED');
    log.info('═'.repeat(80));

    // Detailed error logging
    if (error instanceof Error) {
      log.error('\n🔴 Error Details:');
      log.error(`   Type: ${error.constructor.name}`);
      log.error(`   Message: ${error.message}`);

      // Check for PostgreSQL-specific error properties
      const pgError = error as any;
      if (pgError.code) {
        log.error(`\n🔴 PostgreSQL Error Code: ${pgError.code}`);
      }
      if (pgError.severity) {
        log.error(`   Severity: ${pgError.severity}`);
      }
      if (pgError.detail) {
        log.error(`   Detail: ${pgError.detail}`);
      }
      if (pgError.hint) {
        log.error(`   Hint: ${pgError.hint}`);
      }
      if (pgError.position) {
        log.error(`   Position: ${pgError.position}`);
      }
      if (pgError.where) {
        log.error(`   Where: ${pgError.where}`);
      }
      if (pgError.schema_name) {
        log.error(`   Schema: ${pgError.schema_name}`);
      }
      if (pgError.table_name) {
        log.error(`   Table: ${pgError.table_name}`);
      }
      if (pgError.column_name) {
        log.error(`   Column: ${pgError.column_name}`);
      }
      if (pgError.constraint_name) {
        log.error(`   Constraint: ${pgError.constraint_name}`);
      }
      if (pgError.file) {
        log.error(`   Source file: ${pgError.file}:${pgError.line}`);
      }
      if (pgError.routine) {
        log.error(`   Routine: ${pgError.routine}`);
      }

      log.error('Stack Trace', { stack: error.stack || 'No stack trace available' });

      // Try to extract which migration failed
      const stackLines = error.stack?.split('\n') || [];
      const migrationLine = stackLines.find(line => line.includes('migrations'));
      if (migrationLine) {
        log.error('\n🔴 Failed in context:');
        log.error(`   ${migrationLine.trim()}`);
      }
    } else {
      log.error('\n🔴 Unknown error type:');
      log.error(String(error));
    }

    log.error('\n📊 Failure Context:');
    log.error(`   Duration before failure: ${totalDuration}ms`);
    log.error(`   Timestamp: ${new Date().toISOString()}`);
    log.error(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    log.info(`\n${'═'.repeat(80)}`);
    log.error('💡 Troubleshooting Tips:');
    log.error('   1. Check if the database is accessible and credentials are correct');
    log.error('   2. Verify no other migration process is running (check for locks)');
    log.error('   3. Review the failed migration SQL file for syntax errors');
    log.error('   4. Check PostgreSQL logs for more details');
    log.error('   5. Ensure the database user has sufficient privileges');
    log.error('   6. Check for duplicate migration numbers or conflicting changes');
    log.info('═'.repeat(80));

    // Attempt to close connection
    try {
      await client.end();
      log.error('\n🔌 Database connection closed');
    } catch (closeError) {
      log.error('⚠️  Failed to close database connection gracefully');
      log.error(`   ${String(closeError)}`);
    }

    process.exit(1);
  }
}

// Run migrations
runMigrationsWithLogging();
