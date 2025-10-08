// Create a standalone database connection for seeding
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import { permissions, roles, role_permissions, organizations } from '../lib/db/rbac-schema.js';
import { getAllPermissions, getAllRoles, SAMPLE_ORGANIZATIONS } from '../lib/db/rbac-seed-data.js';

/**
 * RBAC Migration and Seed Script
 * Run this script to create RBAC tables and seed initial data
 *
 * IMPORTANT: This file now imports from rbac-seed-data.ts (single source of truth)
 * Do not define permissions/roles here - update rbac-seed-data.ts instead
 */

// Create connection with minimal config
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema: { permissions, roles, role_permissions, organizations } });

async function runRBACMigration() {
  console.log('🚀 Starting RBAC Migration (supports midstream updates)...\n');

  try {
    // Get permissions and roles from centralized source
    const BASE_PERMISSIONS = getAllPermissions();
    const BASE_ROLES = getAllRoles();

    // 1. Upsert base permissions
    console.log('📝 Upserting base permissions...');
    let permissionCount = 0;
    for (const permission of BASE_PERMISSIONS) {
      await db
        .insert(permissions)
        .values(permission)
        .onConflictDoUpdate({
          target: permissions.name,
          set: {
            description: permission.description,
            resource: permission.resource,
            action: permission.action,
            scope: permission.scope,
            updated_at: new Date(),
          },
        });
      permissionCount++;
    }

    console.log(`✅ Upserted ${permissionCount} permissions`);

    // 2. Upsert sample organizations
    console.log('🏢 Upserting sample organizations...');
    let orgCount = 0;
    for (const org of SAMPLE_ORGANIZATIONS) {
      await db
        .insert(organizations)
        .values(org)
        .onConflictDoUpdate({
          target: organizations.slug,
          set: {
            name: org.name,
            is_active: org.is_active,
            updated_at: new Date(),
          },
        });
      orgCount++;
    }

    console.log(`✅ Upserted ${orgCount} organizations`);

    // 3. Upsert base roles and sync their permissions
    console.log('👥 Upserting base roles and syncing permissions...');
    const processedRoles = [];

    for (const roleData of BASE_ROLES) {
      const { permissions: rolePermissions, ...roleInfo } = roleData;

      // Upsert role - check if exists first
      const existingRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, roleInfo.name))
        .limit(1);

      let role;
      if (existingRole.length > 0) {
        // Update existing role
        [role] = await db
          .update(roles)
          .set({
            description: roleInfo.description,
            is_system_role: roleInfo.is_system_role,
            is_active: true,
            updated_at: new Date(),
          })
          .where(eq(roles.role_id, existingRole[0]!.role_id))
          .returning();
      } else {
        // Insert new role
        [role] = await db.insert(roles).values(roleInfo).returning();
      }

      if (!role) continue;

      processedRoles.push(role);

      // Get ALL permission IDs if role is super_admin
      let permissionIds;
      if (rolePermissions === 'ALL') {
        console.log('   • Granting ALL permissions to super_admin');
        permissionIds = await db
          .select({ permission_id: permissions.permission_id })
          .from(permissions)
          .where(eq(permissions.is_active, true));
      } else {
        // Get specific permission IDs for regular roles
        permissionIds = await db
          .select({ permission_id: permissions.permission_id })
          .from(permissions)
          .where(inArray(permissions.name, rolePermissions as readonly string[]));
      }

      // Delete existing role-permission associations for this role
      await db.delete(role_permissions).where(eq(role_permissions.role_id, role.role_id));

      // Insert fresh role-permission associations
      if (permissionIds.length > 0) {
        await db.insert(role_permissions).values(
          permissionIds.map((p) => ({
            role_id: role.role_id,
            permission_id: p.permission_id,
          }))
        );

        console.log(`   • ${role.name}: synced ${permissionIds.length} permissions`);
      }
    }

    console.log(`✅ Upserted ${processedRoles.length} roles with permissions`);

    // 4. Summary
    console.log('\n🎉 RBAC seeding completed successfully!');
    console.log('📊 Summary:');
    console.log(`   • ${permissionCount} permissions upserted`);
    console.log(`   • ${processedRoles.length} roles upserted`);
    console.log(`   • ${orgCount} organizations upserted`);

    console.log('\n🔐 Available roles:');
    BASE_ROLES.forEach((role) => {
      console.log(`   • ${role.name}: ${role.description}`);
    });

    console.log('\n✅ Your RBAC system is now ready to use!');

    // Close database connection
    await client.end();
  } catch (error) {
    console.error('❌ RBAC Migration failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure your database is running');
    console.error('   2. Check your DATABASE_URL environment variable');
    console.error('   3. Verify database connection permissions');
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  runRBACMigration();
}

export { runRBACMigration };
