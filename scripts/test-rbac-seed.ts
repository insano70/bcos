#!/usr/bin/env tsx
/**
 * Test script to run RBAC seed independently
 * This bypasses the full app environment validation
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { seedRBACData } from '../lib/db/rbac-seed';

const DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';

async function runSeed() {
  console.log('🚀 Starting RBAC seed test...\n');

  const client = postgres(DATABASE_URL);

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
