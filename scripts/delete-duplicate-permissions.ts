import { db } from '@/lib/db';
import { permissions } from '@/lib/db/rbac-schema';
import { like } from 'drizzle-orm';

async function deleteDuplicates() {
  console.log('🗑️  Deleting duplicate work-items permissions with double colon...\n');

  // Delete old format permissions with double colon
  const result = await db
    .delete(permissions)
    .where(like(permissions.name, 'work-items::%'))
    .returning();

  console.log(`✅ Deleted ${result.length} duplicate permissions:\n`);
  result.forEach(p => {
    console.log(`  - ${p.name}`);
  });

  process.exit(0);
}

deleteDuplicates();
