/**
 * Fix Drizzle Migration System
 * 
 * CRITICAL FINDING: __drizzle_migrations table doesn't exist!
 * This means the database was created directly from schema, not through migrations.
 * 
 * This script will:
 * 1. Create __drizzle_migrations table
 * 2. Mark all existing migrations as applied (since DB already matches schema)
 * 3. Remove reference to deleted migration 0026_yummy_luke_cage from journal
 * 4. Make system ready for future migrations
 */

import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
config({ path: '.env.local' });
config({ path: '.env' });

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

async function fixMigrationSystem() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    console.log('🔧 Fixing Drizzle Migration System\n');
    console.log('ISSUE: __drizzle_migrations table does not exist');
    console.log('CAUSE: Database was created from schema directly, not through migrations\n');

    // Step 1: Create __drizzle_migrations table
    console.log('Step 1: Creating __drizzle_migrations table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    console.log('✅ Table created\n');

    // Step 2: Load the journal
    const journalPath = path.join(process.cwd(), 'lib/db/migrations/meta/_journal.json');
    const journalContent = fs.readFileSync(journalPath, 'utf-8');
    const journal: Journal = JSON.parse(journalContent);

    console.log(`Step 2: Found ${journal.entries.length} journal entries\n`);

    // Step 3: Find the problematic entry
    const problematicEntry = journal.entries.find((e) => e.tag === '0026_yummy_luke_cage');
    if (problematicEntry) {
      console.log(`⚠️  Found problematic entry: ${problematicEntry.tag} (idx ${problematicEntry.idx})`);
      console.log('   This migration file was deleted but still in journal\n');
    }

    // Step 4: Get list of actual migration files
    const migrationsDir = path.join(process.cwd(), 'lib/db/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`Step 3: Found ${files.length} actual migration files\n`);

    // Step 5: Create cleaned journal
    const cleanedEntries = journal.entries.filter((entry) => {
      const expectedFile = `${entry.tag}.sql`;
      const exists = files.includes(expectedFile);
      if (!exists) {
        console.log(`   ❌ Removing journal entry: ${entry.tag} (file missing)`);
      }
      return exists;
    });

    console.log(`\nCleaned journal: ${cleanedEntries.length} valid entries (removed ${journal.entries.length - cleanedEntries.length})\n`);

    // Step 6: Mark all valid migrations as applied
    console.log('Step 4: Marking migrations as applied in database...');
    let appliedCount = 0;
    for (const entry of cleanedEntries) {
      const hash = `${entry.tag}`;
      const createdAt = entry.when;
      
      await db.execute(sql`
        INSERT INTO __drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${createdAt})
        ON CONFLICT DO NOTHING
      `);
      appliedCount++;
      console.log(`   ✓ ${entry.tag}`);
    }
    console.log(`✅ Marked ${appliedCount} migrations as applied\n`);

    // Step 7: Save cleaned journal
    const cleanedJournal: Journal = {
      ...journal,
      entries: cleanedEntries,
    };

    const backupPath = journalPath + '.backup';
    fs.copyFileSync(journalPath, backupPath);
    console.log(`Step 5: Backed up journal to ${backupPath}`);

    fs.writeFileSync(journalPath, JSON.stringify(cleanedJournal, null, 2));
    console.log('✅ Saved cleaned journal\n');

    console.log('🎉 Migration system fixed!\n');
    console.log('Summary:');
    console.log(`  - Created __drizzle_migrations table`);
    console.log(`  - Marked ${appliedCount} migrations as applied`);
    console.log(`  - Removed ${journal.entries.length - cleanedEntries.length} invalid journal entries`);
    console.log(`  - Backed up original journal\n`);

    console.log('You can now safely run:');
    console.log('  - npx drizzle-kit check (verify schema)');
    console.log('  - npx drizzle-kit generate (create new migrations)');
    console.log('  - npx drizzle-kit migrate (apply new migrations)\n');

    await client.end();
  } catch (error) {
    console.error('❌ Error fixing migration system:', error);
    await client.end();
    throw error;
  }
}

if (require.main === module) {
  fixMigrationSystem()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { fixMigrationSystem };

