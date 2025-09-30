#!/usr/bin/env node
/**
 * Database Migration Runner
 * 
 * Runs Drizzle migrations against the database specified by DATABASE_URL.
 * Designed to be executed as a one-off ECS task during deployment.
 * 
 * Exit codes:
 * - 0: Migrations completed successfully
 * - 1: Migration failed or error occurred
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  console.log('🔄 Starting database migrations...');
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

  // Create database connection with migration-specific settings
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });

  const db = drizzle(client);

  try {
    // Run migrations from the migrations folder
    await migrate(db, { 
      migrationsFolder: './lib/db/migrations' 
    });
    
    console.log('✅ Migrations completed successfully');
    
    // Close the connection
    await client.end();
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    } else {
      console.error(`   ${String(error)}`);
    }
    
    // Attempt to close connection
    try {
      await client.end();
    } catch (closeError) {
      console.error('⚠️  Failed to close database connection');
    }
    
    process.exit(1);
  }
}

// Run migrations
runMigrations();
