#!/usr/bin/env tsx
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { permissions } from '../lib/db/rbac-schema.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
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
