import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getUserContext } from '@/lib/rbac/user-context';

async function debugPermissions() {
  // Get super_admin user
  const [superAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@bendcare.com'))
    .limit(1);

  if (!superAdmin) {
    console.log('❌ Super admin user not found');
    return;
  }

  console.log(`\n🔍 Debugging permissions for user: ${superAdmin.email}`);
  console.log(`User ID: ${superAdmin.user_id}\n`);

  // Get full context
  const context = await getUserContext(superAdmin.user_id);

  console.log(`📊 User Context Summary:`);
  console.log(`  - Roles: ${context.roles.length}`);
  console.log(`  - Total Permissions: ${context.all_permissions.length}`);
  console.log(`  - Is Super Admin: ${context.is_super_admin}\n`);

  // Filter work-items permissions
  const workItemsPermissions = context.all_permissions.filter(
    (p) =>
      p.resource === 'work-items' ||
      p.name.startsWith('work-items:') ||
      p.name.startsWith('work_items:')
  );

  console.log(`🔧 Work Items Permissions (${workItemsPermissions.length}):`);
  workItemsPermissions.forEach((p) => {
    console.log(`  - ${p.name}`);
    console.log(`    Resource: ${p.resource}, Action: ${p.action}, Scope: ${p.scope}`);
  });

  if (workItemsPermissions.length === 0) {
    console.log(`\n⚠️  No work-items permissions found!`);
    console.log(`\n📋 All permissions for this user:`);
    context.all_permissions.forEach((p) => {
      console.log(`  - ${p.name} (${p.resource}:${p.action}:${p.scope})`);
    });
  }

  process.exit(0);
}

debugPermissions();
