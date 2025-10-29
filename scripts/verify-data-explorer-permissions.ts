/**
 * Verify Data Explorer Permissions Script
 *
 * Checks if all 16 Data Explorer permissions are loaded in the database.
 * Can be run against local, staging, or production.
 *
 * Usage:
 *   # Local
 *   pnpm exec tsx --env-file=.env.local scripts/verify-data-explorer-permissions.ts
 *
 *   # Staging (set DATABASE_URL in env)
 *   DATABASE_URL="postgresql://..." tsx scripts/verify-data-explorer-permissions.ts
 */

import { like } from 'drizzle-orm';
import { db } from '@/lib/db';
import { permissions } from '@/lib/db/schema';

const EXPECTED_PERMISSIONS = [
  'data-explorer:query:organization',
  'data-explorer:query:all',
  'data-explorer:execute:own',
  'data-explorer:execute:organization',
  'data-explorer:execute:all',
  'data-explorer:metadata:read:organization',
  'data-explorer:metadata:read:all',
  'data-explorer:metadata:manage:all',
  'data-explorer:history:read:own',
  'data-explorer:history:read:organization',
  'data-explorer:history:read:all',
  'data-explorer:templates:read:organization',
  'data-explorer:templates:read:all',
  'data-explorer:templates:create:organization',
  'data-explorer:templates:manage:own',
  'data-explorer:templates:manage:all',
  'data-explorer:discovery:run:all',
];

async function verifyPermissions() {
  console.log('🔍 Verifying Data Explorer Permissions...\n');

  try {
    const result = await db
      .select()
      .from(permissions)
      .where(like(permissions.name, 'data-explorer:%'));

    console.log(`✅ Found ${result.length} Data Explorer permissions in database\n`);

    if (result.length === 0) {
      console.log('❌ NO DATA EXPLORER PERMISSIONS FOUND!');
      console.log('\nTo fix, run: pnpm db:seed\n');
      process.exit(1);
    }

    const foundPermissions = new Set(result.map((p) => p.name));
    const missing = EXPECTED_PERMISSIONS.filter((p) => !foundPermissions.has(p));
    const extra = Array.from(foundPermissions).filter(
      (p) => !EXPECTED_PERMISSIONS.includes(p)
    );

    console.log('Permissions by category:\n');
    
    const byAction = result.reduce((acc: Record<string, string[]>, p) => {
      const action = p.action;
      if (!acc[action]) acc[action] = [];
      acc[action].push(p.name);
      return acc;
    }, {});

    for (const [action, perms] of Object.entries(byAction)) {
      console.log(`  ${action}:`);
      for (const perm of perms) {
        console.log(`    ✓ ${perm}`);
      }
      console.log('');
    }

    if (missing.length > 0) {
      console.log('⚠️  MISSING PERMISSIONS:');
      for (const perm of missing) {
        console.log(`    ❌ ${perm}`);
      }
      console.log('\nTo fix, run: pnpm db:seed\n');
      process.exit(1);
    }

    if (extra.length > 0) {
      console.log('ℹ️  EXTRA PERMISSIONS (not in expected list):');
      for (const perm of extra) {
        console.log(`    • ${perm}`);
      }
      console.log('');
    }

    console.log('✅ All 17 expected Data Explorer permissions are present!\n');
    console.log('Summary:');
    console.log(`  - Total: ${result.length}`);
    console.log(`  - Expected: ${EXPECTED_PERMISSIONS.length}`);
    console.log(`  - Missing: ${missing.length}`);
    console.log(`  - Status: READY ✓\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error verifying permissions:', error);
    process.exit(1);
  }
}

verifyPermissions();

