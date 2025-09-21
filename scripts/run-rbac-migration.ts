// Create a standalone database connection for seeding
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
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

// Base roles with their permissions
const BASE_ROLES = [
  {
    name: 'super_admin',
    description: 'Super administrator with full system access',
    is_system_role: true,
    permissions: [
      'users:read:all',
      'users:manage:all',
      'practices:create:all',
      'practices:read:all',
      'practices:manage:all',
      'analytics:read:all',
      'roles:manage:all',
      'settings:read:all',
      'settings:update:all',
      'templates:manage:all'
    ]
  },
  {
    name: 'practice_admin',
    description: 'Practice administrator with full practice management',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'users:read:organization',
      'users:create:organization',
      'users:update:organization',
      'users:delete:organization',
      'practices:read:own',
      'practices:update:own',
      'practices:staff:manage:own',
      'analytics:read:organization',
      'analytics:export:organization',
      'roles:read:organization',
      'roles:create:organization',
      'roles:update:organization',
      'roles:delete:organization',
      'settings:read:organization',
      'settings:update:organization',
      'templates:read:organization',
      'api:read:organization',
      'api:write:organization'
    ]
  },
  {
    name: 'practice_manager',
    description: 'Practice manager with staff and operational management',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'users:read:organization',
      'users:create:organization',
      'users:update:organization',
      'practices:read:own',
      'practices:update:own',
      'practices:staff:manage:own',
      'analytics:read:organization',
      'analytics:export:organization',
      'roles:read:organization',
      'settings:read:organization',
      'templates:read:organization',
      'api:read:organization'
    ]
  },
  {
    name: 'practice_staff',
    description: 'Practice staff with basic operational access',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'users:read:organization',
      'practices:read:own',
      'analytics:read:organization',
      'templates:read:organization'
    ]
  },
  {
    name: 'practice_user',
    description: 'Basic practice user with minimal access',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'practices:read:own',
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
  console.log('🚀 Starting RBAC Migration...\n');

  try {
    console.log('🔍 Checking if RBAC data already exists...');

    // Check if permissions exist
    const existingPermissions = await db.select().from(permissions).limit(1);
    const existingOrganizations = await db.select().from(organizations).limit(1);
    const existingRoles = await db.select().from(roles).limit(1);

    if (existingPermissions.length > 0 || existingOrganizations.length > 0 || existingRoles.length > 0) {
      console.log('✅ RBAC data already exists in the database');
      console.log('ℹ️  If you need to reset RBAC data, delete and recreate the database tables\n');
      await client.end();
      return;
    }

    console.log('📝 RBAC data not found. Proceeding with seeding...\n');

    // 1. Insert base permissions
    console.log('📝 Inserting base permissions...');
    const insertedPermissions = await db
      .insert(permissions)
      .values(BASE_PERMISSIONS)
      .returning();

    console.log(`✅ Created ${insertedPermissions.length} permissions`);

    // 2. Insert sample organizations
    console.log('🏢 Inserting sample organizations...');
    const insertedOrganizations = await db
      .insert(organizations)
      .values(SAMPLE_ORGANIZATIONS)
      .returning();

    console.log(`✅ Created ${insertedOrganizations.length} organizations`);

    // 3. Insert base roles and their permissions
    console.log('👥 Inserting base roles with permissions...');
    const insertedRoles = [];

    for (const roleData of BASE_ROLES) {
      const { permissions: rolePermissions, ...roleInfo } = roleData;

      // Insert role
      const [role] = await db
        .insert(roles)
        .values(roleInfo)
        .returning();

      insertedRoles.push(role);

      // Get permission IDs for this role
      if (role && rolePermissions.length > 0) {
        const permissionRecords = await db
          .select({ permission_id: permissions.permission_id })
          .from(permissions)
          .where(require('drizzle-orm').inArray(permissions.name, rolePermissions));

        // Insert role-permission associations
        if (permissionRecords.length > 0) {
          await db
            .insert(role_permissions)
            .values(
              permissionRecords.map(p => ({
                role_id: role.role_id,
                permission_id: p.permission_id
              }))
            );
        }
      }
    }

    console.log(`✅ Created ${insertedRoles.length} roles with permissions`);

    // 4. Summary
    console.log('\n🎉 RBAC seeding completed successfully!');
    console.log('📊 Summary:');
    console.log(`   • ${insertedPermissions.length} permissions created`);
    console.log(`   • ${insertedRoles.length} roles created`);
    console.log(`   • ${insertedOrganizations.length} organizations created`);

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
