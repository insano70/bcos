#!/usr/bin/env tsx
/**
 * Seed Drizzle Migrations Table
 * 
 * This script populates the __drizzle_migrations table to mark existing
 * migrations as already applied. Use this when migrations were run manually
 * before Drizzle tracking was implemented.
 * 
 * ⚠️ CRITICAL: Only run this ONCE on staging and production databases
 * 
 * Usage:
 *   tsx scripts/seed-drizzle-migrations.ts
 */

import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

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

async function seedMigrationsTable(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Seeding Drizzle migrations table...');
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const client = postgres(databaseUrl, { max: 1 });

  try {
    // Read the migration journal
    const journalPath = join(process.cwd(), 'lib/db/migrations/meta/_journal.json');
    const journalContent = readFileSync(journalPath, 'utf-8');
    const journal: MigrationJournal = JSON.parse(journalContent);

    console.log(`📋 Found ${journal.entries.length} migrations in journal`);
    console.log('');

    // Check if __drizzle_migrations table exists
    const tableExists = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'drizzle' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `;

    if (!tableExists[0]?.exists) {
      console.log('📦 Creating __drizzle_migrations table...');
      
      // Create the drizzle schema if it doesn't exist
      await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
      
      // Create the migrations table (matching Drizzle's structure)
      await client`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `;
      
      console.log('✅ Created __drizzle_migrations table');
      console.log('');
    } else {
      console.log('✅ __drizzle_migrations table already exists');
      console.log('');
    }

    // Get already applied migrations
    const existingMigrations = await client`
      SELECT hash FROM drizzle.__drizzle_migrations
    `;
    const existingHashes = new Set(existingMigrations.map(m => m.hash));

    console.log(`📊 Found ${existingHashes.size} already applied migrations`);
    console.log('');

    // Process each migration
    let seeded = 0;
    let skipped = 0;

    for (const entry of journal.entries) {
      const migrationPath = join(process.cwd(), `lib/db/migrations/${entry.tag}.sql`);
      
      try {
        // Read the SQL file
        const sql = readFileSync(migrationPath, 'utf-8');
        
        // Generate hash (matching Drizzle's hash generation)
        const hash = createHash('sha256').update(sql).digest('hex');
        
        // Check if already seeded
        if (existingHashes.has(hash)) {
          console.log(`⏭️  Skipping ${entry.tag} (already applied)`);
          skipped++;
          continue;
        }

        // Insert migration record
        await client`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `;
        
        console.log(`✅ Seeded ${entry.tag} (${entry.when})`);
        seeded++;
        
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          console.log(`⚠️  Warning: Migration file not found: ${entry.tag}.sql`);
          console.log(`   This migration is in the journal but SQL file is missing.`);
          console.log(`   Skipping...`);
          skipped++;
        } else {
          throw error;
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SEEDING COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Successfully seeded: ${seeded} migrations`);
    console.log(`⏭️  Skipped (already applied): ${skipped} migrations`);
    console.log(`📊 Total migrations tracked: ${seeded + existingHashes.size}`);
    console.log('');
    console.log('✨ Drizzle will now only apply NEW migrations going forward');
    console.log('═══════════════════════════════════════════════════════════');

    await client.end();
    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ Failed to seed migrations table:');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    } else {
      console.error(`   ${String(error)}`);
    }

    try {
      await client.end();
    } catch (closeError) {
      console.error('⚠️  Failed to close database connection');
    }

    process.exit(1);
  }
}

// Run seeding
seedMigrationsTable();
