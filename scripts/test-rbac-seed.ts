#!/usr/bin/env tsx
/**
 * Test script to run RBAC seed independently
 * This bypasses the full app environment validation
 */

import postgres from 'postgres';
import { seedRBACData } from '../lib/db/rbac-seed';

// Require DATABASE_URL from environment - no hardcoded credentials
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Set it before running this script, e.g.:');
  console.error('  DATABASE_URL=postgresql://user:pass@localhost:5432/db pnpm tsx scripts/test-rbac-seed.ts');
  process.exit(1);
}

// Safe: process.exit(1) above ensures this is only reached when DATABASE_URL is set
const client = postgres(process.env.DATABASE_URL);

async function runSeed() {
  console.log('Starting RBAC seed test...\n');

  try {
    await seedRBACData();
    console.log('\n✅ RBAC seed completed successfully!');
  } catch (error) {
    console.error('❌ RBAC seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runSeed();
