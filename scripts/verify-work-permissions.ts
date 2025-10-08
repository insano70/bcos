import { db } from '@/lib/db';
import { permissions } from '@/lib/db/rbac-schema';
import { eq } from 'drizzle-orm';

async function verifyPermissions() {
  console.log('🔍 Verifying work-items permissions...\n');

  // Get all work-items permissions
  const workItemsPerms = await db
    .select()
    .from(permissions)
    .where(eq(permissions.resource, 'work-items'))
    .orderBy(permissions.name);

  console.log(`✅ Found ${workItemsPerms.length} work-items permissions:\n`);
  workItemsPerms.forEach(p => {
    console.log(`  - ${p.name} (${p.resource}:${p.action}:${p.scope})`);
  });

  // Check for any old format permissions
  const oldFormat = await db
    .select()
    .from(permissions)
    .where(eq(permissions.resource, 'work_items'))
    .orderBy(permissions.name);

  if (oldFormat.length > 0) {
    console.log(`\n⚠️  Found ${oldFormat.length} OLD FORMAT permissions (work_items):`);
    oldFormat.forEach(p => {
      console.log(`  - ${p.name}`);
    });
  } else {
    console.log('\n✅ No old format permissions found');
  }

  process.exit(0);
}

verifyPermissions();
