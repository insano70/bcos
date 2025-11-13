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
  console.log('🔌 Testing database connection...');
  try {
    const result = await client`SELECT version(), current_database(), current_schema()`;
    if (result[0]) {
      console.log(`   ✓ Connected to database: ${result[0].current_database}`);
      console.log(`   ✓ Current schema: ${result[0].current_schema}`);
      console.log(`   ✓ PostgreSQL version: ${result[0].version?.split(' ')[1] || 'unknown'}`);
    }
  } catch (error) {
    console.error('   ✗ Database connection test failed');
    throw error;
  }
}

async function getAppliedMigrations(client: postgres.Sql): Promise<AppliedMigration[]> {
  console.log('\n📋 Checking migration history...');
  try {
    const result = await client<AppliedMigration[]>`
      SELECT id, hash, created_at
      FROM __drizzle_migrations
      ORDER BY id ASC
    `;
    console.log(`   Found ${result.length} previously applied migrations`);
    if (result.length > 0) {
      console.log(`   Latest applied: migration #${result[result.length - 1]?.id || 'unknown'}`);
    }
    return result;
  } catch (error) {
    // Table doesn't exist yet - first migration run
    console.log('   No migration history found (first run)');
    return [];
  }
}

function getMigrationFiles(migrationsDir: string): MigrationFile[] {
  console.log('\n📁 Scanning migration files...');
  console.log(`   Directory: ${migrationsDir}`);

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => {
      const indexMatch = name.match(/^(\d+)_/);
      return {
        name,
        path: path.join(migrationsDir, name),
        index: indexMatch ? parseInt(indexMatch[1]) : 0,
      };
    });

  console.log(`   Found ${files.length} migration files:`);
  files.forEach(f => {
    console.log(`     - ${f.name} (idx: ${f.index})`);
  });

  return files;
}

async function runMigrationsWithLogging(): Promise<void> {
  const startTime = Date.now();
  const databaseUrl = process.env.DATABASE_URL;

  // Header
  console.log('═'.repeat(80));
  console.log('🚀 DATABASE MIGRATION RUNNER - ENHANCED LOGGING');
  console.log('═'.repeat(80));
  console.log(`⏰ Start time: ${new Date().toISOString()}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🖥️  Node version: ${process.version}`);
  console.log(`📦 Working directory: ${process.cwd()}`);

  if (!databaseUrl) {
    console.error('\n❌ FATAL: DATABASE_URL environment variable is not set');
    console.error('   Cannot proceed with migrations');
    process.exit(1);
  }

  console.log(`🔗 Database URL: ${maskDatabaseUrl(databaseUrl)}`);

  // Create database connection with migration-specific settings
  console.log('\n⚙️  Initializing database connection...');
  console.log('   Settings:');
  console.log('     - max connections: 1');
  console.log('     - prepare statements: false');
  console.log('     - idle timeout: 30s');

  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 30,
    onnotice: (notice) => {
      // Log PostgreSQL NOTICE messages
      console.log(`   📢 NOTICE [${notice.code}]: ${notice.message}`);
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
    console.log('\n📖 Checking migration journal...');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      console.log(`   Journal version: ${journal.version}`);
      console.log(`   Journal entries: ${journal.entries?.length || 0}`);
      console.log(`   Dialect: ${journal.dialect}`);
    } else {
      console.log('   ⚠️  No journal file found');
    }

    // Estimate pending migrations
    const pendingCount = migrationFiles.length - appliedMigrations.length;
    console.log('\n📊 Migration status:');
    console.log(`   Total migration files: ${migrationFiles.length}`);
    console.log(`   Already applied: ${appliedMigrations.length}`);
    console.log(`   Pending (estimated): ${Math.max(0, pendingCount)}`);

    if (pendingCount <= 0) {
      console.log('\n✨ No pending migrations detected');
    } else {
      console.log(`\n🔄 Proceeding to apply ${pendingCount} pending migration(s)...`);
    }

    console.log('\n' + '─'.repeat(80));
    console.log('▶️  EXECUTING MIGRATIONS');
    console.log('─'.repeat(80));

    // Run migrations with Drizzle
    const migrationStart = Date.now();

    await migrate(db, {
      migrationsFolder: './lib/db/migrations',
    });

    const migrationDuration = Date.now() - migrationStart;

    console.log('─'.repeat(80));
    console.log(`✅ MIGRATIONS COMPLETED (${migrationDuration}ms)`);
    console.log('─'.repeat(80));

    // Post-migration verification
    console.log('\n🔍 Post-migration verification...');
    const finalMigrations = await getAppliedMigrations(client);
    const newlyApplied = finalMigrations.length - appliedMigrations.length;

    if (newlyApplied > 0) {
      console.log(`   ✓ Successfully applied ${newlyApplied} new migration(s)`);
      console.log('\n   Newly applied migrations:');
      finalMigrations.slice(-newlyApplied).forEach(m => {
        console.log(`     - Migration #${m.id} (hash: ${m.hash.substring(0, 12)}...)`);
      });
    } else {
      console.log('   ✓ No new migrations were applied (database already up to date)');
    }

    // Summary
    const totalDuration = Date.now() - startTime;
    console.log('\n' + '═'.repeat(80));
    console.log('✅ MIGRATION RUNNER COMPLETED SUCCESSFULLY');
    console.log('═'.repeat(80));
    console.log(`⏱️  Total duration: ${totalDuration}ms`);
    console.log(`⏰ End time: ${new Date().toISOString()}`);
    console.log(`📊 Final migration count: ${finalMigrations.length}`);
    console.log('═'.repeat(80));

    // Close the connection
    await client.end();
    console.log('\n🔌 Database connection closed');

    process.exit(0);
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    console.log('\n' + '═'.repeat(80));
    console.error('❌ MIGRATION RUNNER FAILED');
    console.log('═'.repeat(80));

    // Detailed error logging
    if (error instanceof Error) {
      console.error('\n🔴 Error Details:');
      console.error(`   Type: ${error.constructor.name}`);
      console.error(`   Message: ${error.message}`);

      // Check for PostgreSQL-specific error properties
      const pgError = error as any;
      if (pgError.code) {
        console.error(`\n🔴 PostgreSQL Error Code: ${pgError.code}`);
      }
      if (pgError.severity) {
        console.error(`   Severity: ${pgError.severity}`);
      }
      if (pgError.detail) {
        console.error(`   Detail: ${pgError.detail}`);
      }
      if (pgError.hint) {
        console.error(`   Hint: ${pgError.hint}`);
      }
      if (pgError.position) {
        console.error(`   Position: ${pgError.position}`);
      }
      if (pgError.where) {
        console.error(`   Where: ${pgError.where}`);
      }
      if (pgError.schema_name) {
        console.error(`   Schema: ${pgError.schema_name}`);
      }
      if (pgError.table_name) {
        console.error(`   Table: ${pgError.table_name}`);
      }
      if (pgError.column_name) {
        console.error(`   Column: ${pgError.column_name}`);
      }
      if (pgError.constraint_name) {
        console.error(`   Constraint: ${pgError.constraint_name}`);
      }
      if (pgError.file) {
        console.error(`   Source file: ${pgError.file}:${pgError.line}`);
      }
      if (pgError.routine) {
        console.error(`   Routine: ${pgError.routine}`);
      }

      console.error('\n🔴 Stack Trace:');
      console.error(error.stack);

      // Try to extract which migration failed
      const stackLines = error.stack?.split('\n') || [];
      const migrationLine = stackLines.find(line => line.includes('migrations'));
      if (migrationLine) {
        console.error('\n🔴 Failed in context:');
        console.error(`   ${migrationLine.trim()}`);
      }
    } else {
      console.error('\n🔴 Unknown error type:');
      console.error(String(error));
    }

    console.error('\n📊 Failure Context:');
    console.error(`   Duration before failure: ${totalDuration}ms`);
    console.error(`   Timestamp: ${new Date().toISOString()}`);
    console.error(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    console.log('\n' + '═'.repeat(80));
    console.error('💡 Troubleshooting Tips:');
    console.error('   1. Check if the database is accessible and credentials are correct');
    console.error('   2. Verify no other migration process is running (check for locks)');
    console.error('   3. Review the failed migration SQL file for syntax errors');
    console.error('   4. Check PostgreSQL logs for more details');
    console.error('   5. Ensure the database user has sufficient privileges');
    console.error('   6. Check for duplicate migration numbers or conflicting changes');
    console.log('═'.repeat(80));

    // Attempt to close connection
    try {
      await client.end();
      console.error('\n🔌 Database connection closed');
    } catch (closeError) {
      console.error('⚠️  Failed to close database connection gracefully');
      console.error(`   ${String(closeError)}`);
    }

    process.exit(1);
  }
}

// Run migrations
runMigrationsWithLogging();
