import { db } from '@/lib/db'
import { logger } from '@/lib/logger';
import { createAppLogger } from '@/lib/logger/factory';
import { isPhase3MigrationEnabled } from '@/lib/logger/phase3-migration-flags';
import {
  users,
  roles,
  permissions,
  user_roles,
  organizations,
  role_permissions,
  user_organizations
} from '@/lib/db/schema';
import { eq, and, } from 'drizzle-orm';
import type {
  UserContext,
  Role,
  Organization,
  UserRole,
  UserOrganization,
  Permission
} from '@/lib/types/rbac';

/**
 * User Context Service
 * Loads complete user information with roles, permissions, and organization access
 */

// Universal logger for RBAC user context operations
const rbacUserContextLogger = createAppLogger('rbac-user-context', {
  component: 'security',
  feature: 'user-context-management',
  securityLevel: 'critical'
})

/**
 * Get complete user context with RBAC information
 * This is the primary function for loading user data for permission checking
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const startTime = Date.now()
  
  // Enhanced user context loading logging
  if (isPhase3MigrationEnabled('enableEnhancedUserContextLogging')) {
    rbacUserContextLogger.info('User context loading initiated', {
      userId,
      operation: 'get_user_context',
      securityLevel: 'critical'
    })
  }
  
  // 1. Get basic user information
  const userQueryStart = Date.now()
  const [user] = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      is_active: users.is_active,
      email_verified: users.email_verified,
      created_at: users.created_at,
      updated_at: users.updated_at
    })
    .from(users)
    .where(eq(users.user_id, userId))
    .limit(1);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (!user.is_active) {
    throw new Error(`User account is inactive: ${userId}`);
  }

  // 2. Get user's organizations
  const userOrgs = await db
    .select({
      user_organization_id: user_organizations.user_organization_id,
      user_id: user_organizations.user_id,
      organization_id: user_organizations.organization_id,
      is_active: user_organizations.is_active,
      joined_at: user_organizations.joined_at,
      created_at: user_organizations.created_at,
      // Organization details
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_parent_id: organizations.parent_organization_id,
      org_is_active: organizations.is_active,
      org_created_at: organizations.created_at,
      org_updated_at: organizations.updated_at,
      org_deleted_at: organizations.deleted_at
    })
    .from(user_organizations)
    .innerJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id))
    .where(
      and(
        eq(user_organizations.user_id, userId),
        eq(user_organizations.is_active, true),
        eq(organizations.is_active, true)
      )
    );

  // 3. Get accessible organizations (includes children via hierarchy)
  const accessibleOrganizations = await getAccessibleOrganizations(
    userOrgs.map(org => org.organization_id)
  );

  // 4. Get user's roles with permissions (optimized with database-level deduplication)
  const userRolesData = await db
    .selectDistinct({
      // User role info
      user_role_id: user_roles.user_role_id,
      user_id: user_roles.user_id,
      role_id: user_roles.role_id,
      user_role_organization_id: user_roles.organization_id,
      granted_by: user_roles.granted_by,
      granted_at: user_roles.granted_at,
      expires_at: user_roles.expires_at,
      user_role_is_active: user_roles.is_active,
      user_role_created_at: user_roles.created_at,
      
      // Role info
      role_name: roles.name,
      role_description: roles.description,
      role_organization_id: roles.organization_id,
      is_system_role: roles.is_system_role,
      role_is_active: roles.is_active,
      role_created_at: roles.created_at,
      role_updated_at: roles.updated_at,
      role_deleted_at: roles.deleted_at,
      
      // Permission info
      permission_id: permissions.permission_id,
      permission_name: permissions.name,
      permission_description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      scope: permissions.scope,
      permission_is_active: permissions.is_active,
      permission_created_at: permissions.created_at,
      permission_updated_at: permissions.updated_at
    })
    .from(user_roles)
    .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
    .innerJoin(role_permissions, eq(roles.role_id, role_permissions.role_id))
    .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
    .where(
      and(
        eq(user_roles.user_id, userId),
        eq(user_roles.is_active, true),
        eq(roles.is_active, true),
        eq(permissions.is_active, true)
      )
    );

  // 5. Transform data into structured format
  const rolesMap = new Map<string, Role>();
  const userRolesMap = new Map<string, UserRole>();
  // Performance optimization: Use Set for O(1) permission duplicate checking
  const rolePermissionSets = new Map<string, Set<string>>();

  userRolesData.forEach(row => {
    // Build role with permissions
    if (!rolesMap.has(row.role_id)) {
      rolesMap.set(row.role_id, {
        role_id: row.role_id,
        name: row.role_name,
        description: row.role_description || undefined,
        organization_id: row.role_organization_id || undefined,
        is_system_role: row.is_system_role ?? false,
        is_active: row.role_is_active ?? true,
        created_at: row.role_created_at ?? new Date(),
        updated_at: row.role_updated_at ?? new Date(),
        deleted_at: row.role_deleted_at || undefined,
        permissions: []
      });
      // Initialize permission tracking set for this role
      rolePermissionSets.set(row.role_id, new Set<string>());
    }

    const role = rolesMap.get(row.role_id)!;
    const permissionSet = rolePermissionSets.get(row.role_id)!;
    
    // Add permission to role (O(1) duplicate checking with Set)
    if (!permissionSet.has(row.permission_id)) {
      permissionSet.add(row.permission_id);
      role.permissions.push({
        permission_id: row.permission_id,
        name: row.permission_name,
        description: row.permission_description || undefined,
        resource: row.resource,
        action: row.action,
        scope: row.scope as 'own' | 'organization' | 'all',
        is_active: row.permission_is_active ?? true,
        created_at: row.permission_created_at ?? new Date(),
        updated_at: row.permission_updated_at ?? new Date()
      });
    }

    // Build user role mapping
    if (!userRolesMap.has(row.user_role_id)) {
      userRolesMap.set(row.user_role_id, {
        user_role_id: row.user_role_id,
        user_id: row.user_id,
        role_id: row.role_id,
        organization_id: row.user_role_organization_id || undefined,
        granted_by: row.granted_by || undefined,
        granted_at: row.granted_at ?? new Date(),
        expires_at: row.expires_at || undefined,
        is_active: row.user_role_is_active ?? true,
        created_at: row.user_role_created_at ?? new Date(),
        role: role
      });
    }
  });

  // 6. Build user organizations array
  const userOrganizationsArray: UserOrganization[] = userOrgs.map(org => ({
    user_organization_id: org.user_organization_id,
    user_id: org.user_id,
    organization_id: org.organization_id,
    is_active: org.is_active ?? true,
    joined_at: org.joined_at ?? new Date(),
    created_at: org.created_at ?? new Date(),
    organization: {
      organization_id: org.organization_id,
      name: org.org_name,
      slug: org.org_slug,
      parent_organization_id: org.org_parent_id || undefined,
      is_active: org.org_is_active ?? true,
      created_at: org.org_created_at ?? new Date(),
      updated_at: org.org_updated_at ?? new Date(),
      deleted_at: org.org_deleted_at || undefined
    }
  }));

  // 7. Get all unique permissions across all roles (O(1) deduplication with Set)
  const uniquePermissionsMap = new Map<string, Permission>();
  Array.from(rolesMap.values()).forEach(role => {
    role.permissions.forEach(permission => {
      uniquePermissionsMap.set(permission.permission_id, permission);
    });
  });
  const allPermissions = Array.from(uniquePermissionsMap.values());

  // 8. Determine admin status
  const isSuperAdmin = Array.from(rolesMap.values()).some(role => 
    role.is_system_role && role.name === 'super_admin'
  );

  const organizationAdminFor = Array.from(rolesMap.values())
    .filter(role => 
      !role.is_system_role && 
      role.name === 'practice_admin' && 
      role.organization_id
    )
    .map(role => role.organization_id!)
    .filter(Boolean);

  // 9. Build final user context
  const userContext: UserContext = {
    // Basic user info
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    email_verified: user.email_verified ?? false,

    // RBAC data
    roles: Array.from(rolesMap.values()),
    organizations: userOrganizationsArray.map(uo => uo.organization!),
    accessible_organizations: accessibleOrganizations,
    user_roles: Array.from(userRolesMap.values()),
    user_organizations: userOrganizationsArray,

    // Current context (default to first organization)
    current_organization_id: userOrganizationsArray[0]?.organization_id,

    // Computed properties
    all_permissions: allPermissions,
    is_super_admin: isSuperAdmin,
    organization_admin_for: organizationAdminFor
  };

  // Enhanced user context completion logging
  if (isPhase3MigrationEnabled('enableEnhancedUserContextLogging')) {
    const duration = Date.now() - startTime
    
    // Security analytics for user context loading
    rbacUserContextLogger.security('user_context_loaded', 'low', {
      action: 'rbac_context_success',
      userId,
      organizationCount: userContext.organizations.length,
      roleCount: userContext.roles.length,
      permissionCount: userContext.all_permissions.length,
      isSuperAdmin: userContext.is_super_admin,
      hasActiveOrganization: !!userContext.current_organization_id
    })
    
    // Business intelligence for user analytics
    rbacUserContextLogger.debug('User context analytics', {
      userSegment: userContext.roles[0]?.name || 'no_role',
      organizationScope: userContext.current_organization_id,
      accessLevel: userContext.is_super_admin ? 'super_admin' : 'standard',
      permissionCategories: countPermissionCategories(userContext.all_permissions),
      contextComplexity: calculateContextComplexity(userContext)
    })
    
    // Performance monitoring
    rbacUserContextLogger.timing('User context loading completed', startTime, {
      userQueryTime: userQueryStart ? Date.now() - userQueryStart : 0,
      totalQueries: 4, // user, orgs, roles, permissions
      cacheEnabled: false, // This is the non-cached version
      optimizationPotential: duration > 100 ? 'high' : 'low'
    })
  }

  return userContext;
}

/**
 * Get organizations accessible to user (includes children via hierarchy)
 */
async function getAccessibleOrganizations(directOrganizationIds: string[]): Promise<Organization[]> {
  if (directOrganizationIds.length === 0) {
    return [];
  }

  // Import hierarchy service
  const { getOrganizationHierarchy } = await import('./organization-hierarchy');

  // Get all accessible organizations including children
  const accessibleOrgs = new Map<string, Organization>();

  for (const orgId of directOrganizationIds) {
    try {
      const hierarchy = await getOrganizationHierarchy(orgId);
      hierarchy.forEach(org => {
        accessibleOrgs.set(org.organization_id, org);
      });
    } catch (error) {
      logger.warn('Failed to get organization hierarchy', {
        organizationId: orgId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Fallback: add just the direct organization
      const [org] = await db
        .select({
          organization_id: organizations.organization_id,
          name: organizations.name,
          slug: organizations.slug,
          parent_organization_id: organizations.parent_organization_id,
          is_active: organizations.is_active,
          created_at: organizations.created_at,
          updated_at: organizations.updated_at,
          deleted_at: organizations.deleted_at
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.organization_id, orgId),
            eq(organizations.is_active, true)
          )
        )
        .limit(1);

      if (org) {
        accessibleOrgs.set(org.organization_id, {
          organization_id: org.organization_id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: org.parent_organization_id || undefined,
          is_active: org.is_active ?? true,
          created_at: org.created_at ?? new Date(),
          updated_at: org.updated_at ?? new Date(),
          deleted_at: org.deleted_at || undefined
        });
      }
    }
  }

  return Array.from(accessibleOrgs.values());
}

// Request-scoped cache to prevent multiple getUserContext calls per request
const requestCache = new Map<string, Promise<UserContext | null>>();

/**
 * Get user context for API route handlers (with error handling and request-scoped caching)
 */
export async function getUserContextSafe(userId: string): Promise<UserContext | null> {
  const startTime = Date.now()
  const isDev = process.env.NODE_ENV === 'development';
  
  // Enhanced safe user context loading logging
  if (isPhase3MigrationEnabled('enableEnhancedUserContextLogging')) {
    rbacUserContextLogger.info('Safe user context loading initiated', {
      userId,
      operation: 'get_user_context_safe',
      securityLevel: 'critical',
      cacheEnabled: true
    })
  }
  
  // Check request-scoped cache first
  const cacheKey = `user_context:${userId}`;
  if (requestCache.has(cacheKey)) {
    // Enhanced cache hit logging
    if (isPhase3MigrationEnabled('enableEnhancedUserContextLogging')) {
      rbacUserContextLogger.debug('User context cache analytics', {
        userId,
        cacheHit: true,
        cacheKey,
        performance: 'optimized',
        duration: Date.now() - startTime
      })
    } else if (isDev) {
      logger.debug('User context cache hit', {
        userId,
        operation: 'getUserContext'
      });
    }
    return await requestCache.get(cacheKey)!;
  }
  
  // Enhanced cache miss logging
  if (isPhase3MigrationEnabled('enableEnhancedUserContextLogging')) {
    rbacUserContextLogger.debug('User context cache miss', {
      userId,
      cacheKey,
      loadingFromDatabase: true
    })
  } else if (isDev) {
    logger.debug('Loading user context', {
      userId,
      operation: 'getUserContext'
    });
  }
  
  // Create promise and cache it immediately to prevent race conditions
  const contextPromise = (async (): Promise<UserContext | null> => {
    try {
      const context = await getUserContext(userId);
      if (isDev) {
        logger.debug('User context loaded successfully', {
          userId,
          rolesCount: context.roles?.length || 0,
          permissionsCount: context.all_permissions?.length || 0,
          organizationsCount: context.organizations?.length || 0
        });
      }
      return context;
    } catch (error) {
      // ✅ SECURITY: Use sanitized error logging for production
      if (process.env.NODE_ENV === 'development') {
        logger.error('Failed to get user context', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      } else {
        logger.error('Failed to get user context (detailed)', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
          // Don't log sensitive user context details in production
        });
      }
      return null;
    } finally {
      // Clean up cache entry after request completes (prevent memory leaks)
      setTimeout(() => {
        requestCache.delete(cacheKey);
      }, 1000); // Clean up after 1 second
    }
  })();
  
  requestCache.set(cacheKey, contextPromise);
  return await contextPromise;
}

/**
 * Refresh user context (for cache invalidation)
 */
export async function refreshUserContext(userId: string): Promise<UserContext> {
  // In a production system, this would clear any cached user context
  // For now, just fetch fresh data
  return await getUserContext(userId);
}

/**
 * Check if user exists and is active
 */
export async function validateUserExists(userId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ user_id: users.user_id, is_active: users.is_active })
      .from(users)
      .where(eq(users.user_id, userId))
      .limit(1);

    return user?.is_active === true;
  } catch (error) {
    logger.error('Error validating user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

/**
 * Helper function to count permission categories for analytics
 */
function countPermissionCategories(permissions: Permission[]): Record<string, number> {
  const categories: Record<string, number> = {}
  
  permissions.forEach(permission => {
    const category = permission.name.split(':')[0] || 'unknown' // e.g., 'users:read' -> 'users'
    categories[category] = (categories[category] ?? 0) + 1
  })
  
  return categories
}

/**
 * Helper function to calculate context complexity for performance monitoring
 */
function calculateContextComplexity(userContext: UserContext): 'low' | 'medium' | 'high' {
  const totalItems = userContext.roles.length + 
                    userContext.organizations.length + 
                    userContext.all_permissions.length
  
  if (totalItems > 50) return 'high'
  if (totalItems > 20) return 'medium'
  return 'low'
}
