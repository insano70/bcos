import { db } from './index';
import { 
  permissions, 
  roles, 
  role_permissions, 
  organizations 
} from './schema';
import { inArray, count } from 'drizzle-orm';

/**
 * RBAC Seed Data for Healthcare Practice Management System
 * Creates base permissions, roles, and sample organization structure
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
    description: 'Full user management (super admin)',
    resource: 'users',
    action: 'manage',
    scope: 'all'
  },

  // Practice/Organization Management Permissions
  {
    name: 'practices:read:own',
    description: 'Read own practice information',
    resource: 'practices',
    action: 'read',
    scope: 'own'
  },
  {
    name: 'practices:update:own',
    description: 'Update own practice information',
    resource: 'practices',
    action: 'update',
    scope: 'own'
  },
  {
    name: 'practices:staff:manage:own',
    description: 'Manage practice staff',
    resource: 'practices',
    action: 'staff:manage',
    scope: 'own'
  },
  {
    name: 'practices:create:all',
    description: 'Create new practices (super admin)',
    resource: 'practices',
    action: 'create',
    scope: 'all'
  },
  {
    name: 'practices:read:all',
    description: 'Read all practices (super admin)',
    resource: 'practices',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'practices:manage:all',
    description: 'Full practice management (super admin)',
    resource: 'practices',
    action: 'manage',
    scope: 'all'
  },

  // Analytics & Reporting Permissions
  {
    name: 'analytics:read:organization',
    description: 'View organization analytics',
    resource: 'analytics',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'analytics:export:organization',
    description: 'Export organization reports',
    resource: 'analytics',
    action: 'export',
    scope: 'organization'
  },
  {
    name: 'analytics:read:all',
    description: 'View all analytics (super admin)',
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
    description: 'Full role management (super admin)',
    resource: 'roles',
    action: 'manage',
    scope: 'all'
  },

  // Settings & Configuration Permissions
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
    description: 'Read all system settings',
    resource: 'settings',
    action: 'read',
    scope: 'all'
  },
  {
    name: 'settings:update:all',
    description: 'Update all system settings',
    resource: 'settings',
    action: 'update',
    scope: 'all'
  },

  // Template Management Permissions
  {
    name: 'templates:read:organization',
    description: 'Read available templates',
    resource: 'templates',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'templates:manage:all',
    description: 'Full template management (super admin)',
    resource: 'templates',
    action: 'manage',
    scope: 'all'
  },

  // API Access Permissions
  {
    name: 'api:read:organization',
    description: 'Read API access for organization',
    resource: 'api',
    action: 'read',
    scope: 'organization'
  },
  {
    name: 'api:write:organization',
    description: 'Write API access for organization',
    resource: 'api',
    action: 'write',
    scope: 'organization'
  }
];

// Base roles for healthcare practice management
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
    description: 'Practice staff member with basic access',
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

// Sample organizations for demonstration
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

/**
 * Seed the RBAC system with base permissions, roles, and sample data
 */
export async function seedRBACData() {
  console.log('🌱 Starting RBAC seed process...');

  try {
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

    // 3. Insert base roles
    console.log('👥 Inserting base roles...');
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
      const permissionIds = await db
        .select({ permission_id: permissions.permission_id })
        .from(permissions)
        .where(inArray(permissions.name, rolePermissions));

      // Insert role-permission associations
      if (permissionIds.length > 0 && role) {
        await db
          .insert(role_permissions)
          .values(
            permissionIds.map(p => ({
              role_id: role.role_id,
              permission_id: p.permission_id
            }))
          );
      }
    }

    console.log(`✅ Created ${insertedRoles.length} roles with permissions`);

    // 4. Summary
    console.log('\n🎉 RBAC seed completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   • ${insertedPermissions.length} permissions`);
    console.log(`   • ${insertedRoles.length} roles`);
    console.log(`   • ${insertedOrganizations.length} organizations`);
    console.log(`\n🔐 Available roles:`);
    insertedRoles.forEach(role => {
      if (role) {
        console.log(`   • ${role.name}: ${role.description}`);
      }
    });

    return {
      permissions: insertedPermissions,
      roles: insertedRoles,
      organizations: insertedOrganizations
    };

  } catch (error) {
    console.error('❌ RBAC seed failed:', error);
    throw error;
  }
}

/**
 * Clear all RBAC data (for testing/development)
 */
export async function clearRBACData() {
  console.log('🧹 Clearing RBAC data...');
  
  try {
    // Delete in correct order due to foreign key constraints
    await db.delete(role_permissions);
    await db.delete(roles);
    await db.delete(permissions);
    await db.delete(organizations);
    
    console.log('✅ RBAC data cleared successfully');
  } catch (error) {
    console.error('❌ Failed to clear RBAC data:', error);
    throw error;
  }
}

/**
 * Check if RBAC data already exists
 */
export async function checkRBACDataExists(): Promise<boolean> {
  try {
    const [result] = await db
      .select({ count: count() })
      .from(permissions);
    
    return (result?.count ?? 0) > 0;
  } catch (error) {
    console.error('Error checking RBAC data:', error);
    return false;
  }
}
