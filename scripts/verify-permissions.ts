#!/usr/bin/env tsx
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { permissions } from '../lib/db/rbac-schema.js';

// Require DATABASE_URL from environment - no hardcoded credentials
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Set it before running this script, e.g.:');
  console.error('  DATABASE_URL=postgresql://user:pass@localhost:5432/db pnpm tsx scripts/verify-permissions.ts');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema: { permissions } });

async function verifyPermissions() {
  const allPerms = await db.select().from(permissions);
  console.log('✅ Total permissions in database:', allPerms.length);

  const byResource: Record<string, number> = {};
  for (const p of allPerms) {
    const resource = p.resource || 'unknown';
    byResource[resource] = (byResource[resource] || 0) + 1;
  }

  console.log('\n📊 By Resource:');
  for (const [k, v] of Object.entries(byResource).sort()) {
    console.log('  ', `${k}:`, v);
  }

  console.log('\n🔍 Looking for duplicates...');
  const nameCount: Record<string, number> = {};
  for (const p of allPerms) {
    nameCount[p.name] = (nameCount[p.name] || 0) + 1;
  }

  const duplicates = Object.entries(nameCount).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log('❌ Duplicates found:');
    for (const [name, count] of duplicates) {
      console.log('  ', name, ':', count);
    }
  } else {
    console.log('✅ No duplicates');
  }

  await client.end();
  process.exit(0);
}

verifyPermissions();
