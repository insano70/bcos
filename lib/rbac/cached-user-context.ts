/**
 * Cached User Context Service
 * Provides user context with role-permission caching for performance
 */

import { and, eq } from 'drizzle-orm';
import { rbacCache } from '@/lib/cache';
import { db } from '@/lib/db';
import {
  organizations,
  permissions,
  role_permissions,
  roles,
  user_organizations,
  user_roles,
  users,
} from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type { Permission, Role, UserContext, UserRole } from '@/lib/types/rbac';

// Request-scoped cache to prevent multiple getUserContext calls per request
const requestCache = new Map<string, Promise<UserContext | null>>();

/**
 * Get role permissions from Redis cache or database
 * Redis-only approach for multi-instance consistency
 */
async function getRolePermissions(roleId: string, roleName: string): Promise<Permission[]> {
  // Check Redis cache first
  const redisCached = await rbacCache.getRolePermissions(roleId);
  if (redisCached) {
    return redisCached.permissions;
  }

  // Cache miss - query database
  log.debug('Role permissions cache miss, querying database', {
    roleId,
    roleName,
    component: 'rbac-cache',
  });

  const rolePermissions = await db
    .select({
      permission_id: permissions.permission_id,
      name: permissions.name,
      description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      scope: permissions.scope,
      is_active: permissions.is_active,
      created_at: permissions.created_at,
      updated_at: permissions.updated_at,
    })
    .from(role_permissions)
    .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
    .where(and(eq(role_permissions.role_id, roleId), eq(permissions.is_active, true)));

  // Transform and cache the results
  const transformedPermissions: Permission[] = rolePermissions.map((p) => ({
    permission_id: p.permission_id,
    name: p.name,
    description: p.description || undefined,
    resource: p.resource,
    action: p.action,
    scope: p.scope as 'own' | 'organization' | 'all',
    is_active: p.is_active ?? true,
    created_at: p.created_at ?? new Date(),
    updated_at: p.updated_at ?? new Date(),
  }));

  // Cache to Redis (fire and forget)
  rbacCache.setRolePermissions(roleId, roleName, transformedPermissions).catch(() => {
    // Ignore Redis cache errors
  });

  return transformedPermissions;
}

/**
 * Get complete user context with caching optimization
 */
export async function getCachedUserContext(userId: string): Promise<UserContext> {
  // 1. Get basic user information (including provider_uid for analytics security)
  const [user] = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      is_active: users.is_active,
      email_verified: users.email_verified,
      provider_uid: users.provider_uid, // Analytics security - provider-level filtering
      created_at: users.created_at,
      updated_at: users.updated_at,
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

  // 2. Get user's organizations (including practice_uids for analytics security)
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
      org_practice_uids: organizations.practice_uids, // Analytics security - practice_uid filtering
      org_is_active: organizations.is_active,
      org_created_at: organizations.created_at,
      org_updated_at: organizations.updated_at,
      org_deleted_at: organizations.deleted_at,
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

  // 3. Get user's roles (without permissions for now)
  const userRolesData = await db
    .select({
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
    })
    .from(user_roles)
    .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
    .where(
      and(eq(user_roles.user_id, userId), eq(user_roles.is_active, true), eq(roles.is_active, true))
    );

  // Enhanced debug logging for role loading (cached path)
  log.debug('User roles loaded from database (cached)', {
    userId: user.user_id,
    email: user.email,
    userRolesDataCount: userRolesData.length,
    uniqueRoleIds: Array.from(new Set(userRolesData.map(r => r.role_id))),
    uniqueRoleNames: Array.from(new Set(userRolesData.map(r => r.role_name))),
    hasSystemRoles: userRolesData.some(r => r.is_system_role),
    hasSuperAdminRole: userRolesData.some(r => r.is_system_role && r.role_name === 'super_admin'),
    organizationsCount: userOrgs.length,
    component: 'rbac',
  });

  // 4. Transform data into structured format
  const rolesMap = new Map<string, Role>();
  const userRolesMap = new Map<string, UserRole>();

  // Process each user role and get cached permissions
  for (const row of userRolesData) {
    // Build role if not already processed
    if (!rolesMap.has(row.role_id)) {
      // Get permissions from cache
      const permissions = await getRolePermissions(row.role_id, row.role_name);

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
        permissions,
      });
    }

    // Build user role mapping
    if (!userRolesMap.has(row.user_role_id)) {
      const role = rolesMap.get(row.role_id);
      if (role) {
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
          role: role,
        });
      }
    }
  }

  // 5. Transform organizations (including practice_uids for analytics security)
  const organizationsArray = userOrgs.map((org) => ({
    organization_id: org.organization_id,
    name: org.org_name,
    slug: org.org_slug,
    parent_organization_id: org.org_parent_id || undefined,
    practice_uids: org.org_practice_uids || undefined, // Analytics security - practice_uid filtering
    is_active: org.org_is_active ?? true,
    created_at: org.org_created_at ?? new Date(),
    updated_at: org.org_updated_at ?? new Date(),
    deleted_at: org.org_deleted_at || undefined,
  }));

  // 6. Get all unique permissions across all roles (O(1) deduplication with Set)
  const uniquePermissionsMap = new Map<string, Permission>();
  Array.from(rolesMap.values()).forEach((role) => {
    role.permissions.forEach((permission) => {
      uniquePermissionsMap.set(permission.permission_id, permission);
    });
  });
  const allPermissions = Array.from(uniquePermissionsMap.values());

  // 7. Determine admin status
  const allRoles = Array.from(rolesMap.values());
  const isSuperAdmin = allRoles.some(
    (role) => role.is_system_role && role.name === 'super_admin'
  );

  // Enhanced debug logging for super admin detection (cached path)
  if (process.env.NODE_ENV === 'development' || !isSuperAdmin) {
    log.debug('Super admin status determination (cached)', {
      userId: user.user_id,
      email: user.email,
      isSuperAdmin,
      rolesCount: allRoles.length,
      roles: allRoles.map(r => ({ 
        name: r.name, 
        isSystemRole: r.is_system_role, 
        organizationId: r.organization_id,
        permissionsCount: r.permissions?.length || 0 
      })),
      organizationsCount: userOrgs.length,
      component: 'rbac',
    });
  }

  const organizationAdminFor = allRoles
    .filter(
      (role) => !role.is_system_role && role.name === 'practice_admin' && role.organization_id
    )
    .map((role) => {
      if (!role.organization_id) {
        throw new Error('Organization ID required for practice_admin role');
      }
      return role.organization_id;
    })
    .filter(Boolean);

  // 8. Build final user context (including analytics security fields)
  const userContext: UserContext = {
    // Basic user information
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    email_verified: user.email_verified ?? false,

    // Analytics security - provider-level filtering
    provider_uid: user.provider_uid || undefined,

    // RBAC information
    roles: Array.from(rolesMap.values()),
    organizations: organizationsArray,
    accessible_organizations: organizationsArray, // For now, same as organizations
    user_roles: Array.from(userRolesMap.values()),
    user_organizations: userOrgs.map((org) => ({
      user_organization_id: org.user_organization_id,
      user_id: org.user_id,
      organization_id: org.organization_id,
      is_active: org.is_active ?? true,
      joined_at: org.joined_at ?? new Date(),
      created_at: org.created_at ?? new Date(),
    })),

    // Current context
    current_organization_id: userOrgs[0]?.organization_id || undefined,

    // Computed properties
    all_permissions: allPermissions,
    is_super_admin: isSuperAdmin,
    organization_admin_for: organizationAdminFor,
  };

  return userContext;
}

/**
 * Get cached user context with error handling and request-scoped caching
 * Now uses Redis cache before database fetch
 */
export async function getCachedUserContextSafe(userId: string): Promise<UserContext | null> {
  const isDev = process.env.NODE_ENV === 'development';

  // Check request-scoped cache first
  const cacheKey = `cached_user_context:${userId}`;
  if (requestCache.has(cacheKey)) {
    const cachedContext = await requestCache.get(cacheKey);
    if (cachedContext) {
      if (isDev) {
        log.debug('Request-scoped user context cache hit', {
          userId,
          operation: 'getCachedUserContext',
        });
      }
      return cachedContext;
    }
    // Cache had key but returned null/undefined - continue with fresh load
    if (isDev) {
      log.warn('Request cache had key but returned null value', { userId, cacheKey });
    }
  }

  // Create promise and cache it immediately to prevent race conditions
  const contextPromise = (async (): Promise<UserContext | null> => {
    try {
      // Check Redis cache before database fetch
      const redisContext = await rbacCache.getUserContext(userId);

      if (redisContext) {
        if (isDev) {
          log.debug('Redis user context cache hit', {
            userId,
            rolesCount: redisContext.roles?.length || 0,
            permissionsCount: redisContext.all_permissions?.length || 0,
            fromRedis: true,
          });
        }
        return redisContext;
      }

      // Redis cache miss - fetch from database
      const context = await getCachedUserContext(userId);

      // Cache to Redis (fire and forget)
      rbacCache.setUserContext(userId, context).catch(() => {
        // Ignore Redis cache errors
      });

      if (isDev) {
        log.debug('Cached user context loaded successfully', {
          userId,
          rolesCount: context.roles?.length || 0,
          permissionsCount: context.all_permissions?.length || 0,
          organizationsCount: context.organizations?.length || 0,
        });
      }
      return context;
    } catch (error) {
      log.error('Failed to get cached user context', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
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
