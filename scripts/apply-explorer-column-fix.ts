/**
 * Apply Data Explorer Column Name Fix
 * Drops and recreates explorer tables with correct column names
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function applyFix() {
  console.log('🔧 Applying Data Explorer column name fix...\n');

  try {
    // Drop all explorer tables
    console.log('1. Dropping existing explorer tables...');
    await db.execute(sql`DROP TABLE IF EXISTS explorer_column_metadata CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS explorer_query_patterns CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS explorer_saved_queries CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS explorer_table_relationships CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS explorer_query_history CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS explorer_table_metadata CASCADE`);
    console.log('   ✅ Tables dropped\n');

    // Run drizzle push to recreate with correct schema
    console.log('2. Recreating tables with correct column names...');
    console.log('   Run: pnpm db:push');
    console.log('   Note: You may need to select "rename column" options manually\n');
    
    console.log('✅ Drop phase complete');
    console.log('\n📌 Next step: Run pnpm db:push to recreate tables');
    console.log('📌 Then run: tsx scripts/discover-real-ih-tables.ts to repopulate\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyFix();

