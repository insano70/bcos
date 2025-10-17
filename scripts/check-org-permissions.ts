import { like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { permissions } from '@/lib/db/rbac-schema';

async function checkOrgPermissions() {
  const orgPermissions = await db
    .select()
    .from(permissions)
    .where(
      or(like(permissions.name, 'organizations:%'), like(permissions.resource, 'organizations'))
    )
    .orderBy(permissions.name);

  console.log('\n✅ Organization Permissions:');
  orgPermissions.forEach((p) => {
    console.log(`  - ${p.name}: ${p.description}`);
  });

  console.log(`\n📊 Total: ${orgPermissions.length} organization permissions\n`);
  process.exit(0);
}

checkOrgPermissions();
