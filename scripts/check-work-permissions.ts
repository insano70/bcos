import { db } from '@/lib/db';
import { permissions } from '@/lib/db/schema';
import { like } from 'drizzle-orm';

async function checkPermissions() {
  const workItemsPermissions = await db
    .select()
    .from(permissions)
    .where(like(permissions.name, 'work-items:%'))
    .orderBy(permissions.name);

  console.log('\n✅ Work Items Permissions:');
  workItemsPermissions.forEach(p => {
    console.log(`  - ${p.name}: ${p.description}`);
  });

  console.log(`\n📊 Total: ${workItemsPermissions.length} permissions\n`);
  process.exit(0);
}

checkPermissions();
