import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { permissions, role_permissions, roles } from '@/lib/db/rbac-schema';

async function checkUserRolePermissions() {
  const userRole = await db.select().from(roles).where(eq(roles.name, 'user')).limit(1);

  if (!userRole.length) {
    console.log('❌ User role not found');
    process.exit(1);
  }

  const rolePerms = await db
    .select({
      permission_name: permissions.name,
      permission_description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      scope: permissions.scope,
    })
    .from(role_permissions)
    .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
    .where(eq(role_permissions.role_id, userRole[0]?.role_id))
    .orderBy(permissions.name);

  console.log('\n✅ Permissions for "user" role:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const workItemsPerms = rolePerms.filter((p) => p.resource === 'work_items');
  const otherPerms = rolePerms.filter((p) => p.resource !== 'work_items');

  if (workItemsPerms.length > 0) {
    console.log('📋 Work Items Permissions:');
    workItemsPerms.forEach((p) => {
      console.log(`  ✓ ${p.permission_name} (${p.scope})`);
      console.log(`    ${p.permission_description}\n`);
    });
  }

  if (otherPerms.length > 0) {
    console.log('🔧 Other Permissions:');
    otherPerms.forEach((p) => {
      console.log(`  ✓ ${p.permission_name} (${p.scope})`);
    });
    console.log();
  }

  console.log(`📊 Total: ${rolePerms.length} permissions\n`);
  process.exit(0);
}

checkUserRolePermissions();
