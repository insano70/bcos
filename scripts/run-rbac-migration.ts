// Create a standalone database connection for seeding
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql, eq, inArray } from 'drizzle-orm';
import {
  permissions,
  roles,
  role_permissions,
  organizations
} from '../lib/db/rbac-schema.js';

// Create connection with minimal config
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d';
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema: { permissions, roles, role_permissions, organizations } });

/**
 * RBAC Migration and Seed Script
 * Run this script to create RBAC tables and seed initial data
 */

// Healthcare-specific permissions following resource:action:scope pattern
const BASE_PERMISSIONS = [
  // User Management Permissions
  {
    name: 'users:read:own',
    description: 'Read own user profile',
    resource: 'users',
    action: 'read',
    scope: 'own'
  },
  {
    name: 'users:update:own',
    description: 'Update own user profile',
    resource: 'users',
    action: 'update',
    scope: 'own'
  },
  {
    name: 'users:read:organization',
    description: 'Read users in organization',
    resource: 'users',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'users:create:organization',
    description: 'Create users in organization',
    resource: 'users',
    action: 'create',
    scope: 'organization'
  },
  {
    name: 'users:update:organization',
    description: 'Update users in organization',
    resource: 'users',
    action: 'update',
    scope: 'organization'
  },
  {
    name: 'users:delete:organization',
    description: 'Delete users in organization',
    resource: 'users',
    action: 'delete',
    scope: 'organization'
  },
  {
    name: 'users:read:all',
    description: 'Read all users (super admin)',
    resource: 'users',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'users:manage:all',
    description: 'Manage all users (super admin)',
    resource: 'users',
    action: 'manage',
    scope: 'all'
  },

  // Practice Management Permissions
  {
    name: 'practices:read:own',
    description: 'Read own practice',
    resource: 'practices',
    action: 'read',
    scope: 'own'
  },
  {
    name: 'practices:update:own',
    description: 'Update own practice',
    resource: 'practices',
    action: 'update',
    scope: 'own'
  },
  {
    name: 'practices:staff:manage:own',
    description: 'Manage staff in own practice',
    resource: 'practices',
    action: 'staff:manage',
    scope: 'own'
  },
  {
    name: 'practices:create:all',
    description: 'Create new practices',
    resource: 'practices',
    action: 'create',
    scope: 'all'
  },
  {
    name: 'practices:read:all',
    description: 'Read all practices',
    resource: 'practices',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'practices:manage:all',
    description: 'Manage all practices',
    resource: 'practices',
    action: 'manage',
    scope: 'all'
  },

  // Analytics Permissions
  {
    name: 'analytics:read:organization',
    description: 'Read organization analytics',
    resource: 'analytics',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'analytics:export:organization',
    description: 'Export organization analytics',
    resource: 'analytics',
    action: 'export',
    scope: 'organization'
  },
  {
    name: 'analytics:read:all',
    description: 'Read all analytics',
    resource: 'analytics',
    action: 'read',
    scope: 'all'
  },

  // Data Source Management Permissions
  {
    name: 'data-sources:read:organization',
    description: 'Read data sources in organization',
    resource: 'data-sources',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'data-sources:read:all',
    description: 'Read all data sources (super admin)',
    resource: 'data-sources',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'data-sources:create:organization',
    description: 'Create data sources in organization',
    resource: 'data-sources',
    action: 'create',
    scope: 'organization'
  },
  {
    name: 'data-sources:create:all',
    description: 'Create data sources anywhere (super admin)',
    resource: 'data-sources',
    action: 'create',
    scope: 'all'
  },
  {
    name: 'data-sources:update:organization',
    description: 'Update data sources in organization',
    resource: 'data-sources',
    action: 'update',
    scope: 'organization'
  },
  {
    name: 'data-sources:update:all',
    description: 'Update all data sources (super admin)',
    resource: 'data-sources',
    action: 'update',
    scope: 'all'
  },
  {
    name: 'data-sources:delete:organization',
    description: 'Delete data sources in organization',
    resource: 'data-sources',
    action: 'delete',
    scope: 'organization'
  },
  {
    name: 'data-sources:delete:all',
    description: 'Delete all data sources (super admin)',
    resource: 'data-sources',
    action: 'delete',
    scope: 'all'
  },
  {
    name: 'data-sources:manage:all',
    description: 'Full data source management (super admin)',
    resource: 'data-sources',
    action: 'manage',
    scope: 'all'
  },

  // Role Management Permissions
  {
    name: 'roles:read:organization',
    description: 'Read roles in organization',
    resource: 'roles',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'roles:create:organization',
    description: 'Create roles in organization',
    resource: 'roles',
    action: 'create',
    scope: 'organization'
  },
  {
    name: 'roles:update:organization',
    description: 'Update roles in organization',
    resource: 'roles',
    action: 'update',
    scope: 'organization'
  },
  {
    name: 'roles:delete:organization',
    description: 'Delete roles in organization',
    resource: 'roles',
    action: 'delete',
    scope: 'organization'
  },
  {
    name: 'roles:manage:all',
    description: 'Manage all roles',
    resource: 'roles',
    action: 'manage',
    scope: 'all'
  },

  // Settings Permissions
  {
    name: 'settings:read:organization',
    description: 'Read organization settings',
    resource: 'settings',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'settings:update:organization',
    description: 'Update organization settings',
    resource: 'settings',
    action: 'update',
    scope: 'organization'
  },
  {
    name: 'settings:read:all',
    description: 'Read all settings',
    resource: 'settings',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'settings:update:all',
    description: 'Update all settings',
    resource: 'settings',
    action: 'update',
    scope: 'all'
  },

  // Template Permissions
  {
    name: 'templates:read:organization',
    description: 'Read organization templates',
    resource: 'templates',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'templates:manage:all',
    description: 'Manage all templates',
    resource: 'templates',
    action: 'manage',
    scope: 'all'
  },

  // API Permissions
  {
    name: 'api:read:organization',
    description: 'Read organization API access',
    resource: 'api',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'api:write:organization',
    description: 'Write organization API access',
    resource: 'api',
    action: 'write',
    scope: 'organization'
  }
];

// Base roles - Only 2 roles: super_admin (all permissions) and user (basic permissions)
const BASE_ROLES = [
  {
    name: 'super_admin',
    description: 'Super administrator with full system access to all features',
    is_system_role: true,
    permissions: 'ALL' // Special marker - will get all permissions dynamically
  },
  {
    name: 'user',
    description: 'Standard user with basic read/write permissions',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'practices:read:own',
      'organizations:read:own',
      'templates:read:organization'
    ]
  }
];

// Sample organizations
const SAMPLE_ORGANIZATIONS = [
  {
    name: 'Platform Administration',
    slug: 'platform-admin',
    parent_organization_id: null,
    is_active: true
  },
  {
    name: 'Rheumatology Associates',
    slug: 'rheumatology-associates',
    parent_organization_id: null,
    is_active: true
  },
  {
    name: 'Joint Care Specialists',
    slug: 'joint-care-specialists',
    parent_organization_id: null,
    is_active: true
  }
];

async function runRBACMigration() {
  console.log('🚀 Starting RBAC Migration (supports midstream updates)...\n');

  try {
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
            updated_at: new Date()
          }
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
            updated_at: new Date()
          }
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
        .where(
          sql`${roles.name} = ${roleInfo.name} AND ${roles.organization_id} IS NULL`
        )
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
            updated_at: new Date()
          })
          .where(eq(roles.role_id, existingRole[0].role_id))
          .returning();
      } else {
        // Insert new role
        [role] = await db
          .insert(roles)
          .values(roleInfo)
          .returning();
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
          .where(inArray(permissions.name, rolePermissions as string[]));
      }

      // Delete existing role-permission associations for this role
      await db.delete(role_permissions).where(eq(role_permissions.role_id, role.role_id));

      // Insert fresh role-permission associations
      if (permissionIds.length > 0) {
        await db.insert(role_permissions).values(
          permissionIds.map(p => ({
            role_id: role.role_id,
            permission_id: p.permission_id
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
    BASE_ROLES.forEach(role => {
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
