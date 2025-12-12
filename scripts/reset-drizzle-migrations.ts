#!/usr/bin/env tsx

/**
 * Reset Drizzle Migrations Table
 *
 * This script resets the __drizzle_migrations table and marks the new baseline
 * migration as already applied. Use this after squashing migrations.
 *
 * CRITICAL:
 * - Only run this when ALL environments have the same schema
 * - The baseline migration will NOT be executed (tables already exist)
 * - This script truncates the tracking table and seeds the baseline
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/reset-drizzle-migrations.ts
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

interface MigrationEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationEntry[];
}

async function resetMigrationsTable(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('Resetting Drizzle migrations table...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const client = postgres(databaseUrl, { max: 1 });

  try {
    // Read the migration journal
    const journalPath = join(process.cwd(), 'lib/db/migrations/meta/_journal.json');
    const journalContent = readFileSync(journalPath, 'utf-8');
    const journal: MigrationJournal = JSON.parse(journalContent);

    if (journal.entries.length === 0) {
      console.error('No migrations found in journal');
      process.exit(1);
    }

    console.log(`Found ${journal.entries.length} migration(s) in journal`);
    console.log('');

    // Ensure drizzle schema exists
    await client`CREATE SCHEMA IF NOT EXISTS drizzle`;

    // Check if table exists
    const tableExists = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
      ) as exists
    `;

    if (tableExists[0]?.exists) {
      // Get current count before truncating
      const currentCount = await client`
        SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations
      `;
      console.log(`Current migrations tracked: ${currentCount[0]?.count || 0}`);

      // Truncate the table
      console.log('Truncating __drizzle_migrations table...');
      await client`TRUNCATE TABLE drizzle.__drizzle_migrations RESTART IDENTITY`;
      console.log('Table truncated');
    } else {
      // Create the table
      console.log('Creating __drizzle_migrations table...');
      await client`
        CREATE TABLE drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `;
      console.log('Table created');
    }

    console.log('');

    // Seed all migrations from journal
    let seeded = 0;
    for (const entry of journal.entries) {
      const migrationPath = join(process.cwd(), `lib/db/migrations/${entry.tag}.sql`);

      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        const hash = createHash('sha256').update(sql).digest('hex');

        await client`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `;

        console.log(`Seeded: ${entry.tag}`);
        seeded++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.error(`Migration file not found: ${entry.tag}.sql`);
          process.exit(1);
        }
        throw error;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  MIGRATION RESET COMPLETE');
    console.log('='.repeat(60));
    console.log(`Migrations seeded: ${seeded}`);
    console.log('');
    console.log('Drizzle will now only apply NEW migrations going forward.');
    console.log('='.repeat(60));

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('Failed to reset migrations table:');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(String(error));
    }

    try {
      await client.end();
    } catch {
      // Ignore close errors
    }

    process.exit(1);
  }
}

// Run reset
resetMigrationsTable();
