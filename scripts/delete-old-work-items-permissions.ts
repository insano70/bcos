import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { permissions } from '@/lib/db/rbac-schema';

async function deleteOldFormat() {
  console.log('🗑️  Deleting old format work_items permissions...\n');

  // Delete old format permissions with underscore in resource
  const result = await db
    .delete(permissions)
    .where(eq(permissions.resource, 'work_items'))
    .returning();

  console.log(`✅ Deleted ${result.length} old format permissions:\n`);
  result.forEach((p) => {
    console.log(`  - ${p.name}`);
  });

  process.exit(0);
}

deleteOldFormat();
