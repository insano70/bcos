import type { SQL } from 'drizzle-orm';
import { and, count, eq, ilike, or } from 'drizzle-orm';
import { NotFoundError } from '@/lib/api/responses/error';
import { db } from '@/lib/db';
import { permissions, role_permissions, roles } from '@/lib/db/rbac-schema';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

// ============================================================
// INTERFACES
// ============================================================

export interface RolesServiceInterface {
  getRoles(filters?: RoleFilters): Promise<RoleWithPermissions[]>;
  getRoleCount(): Promise<number>;
  getRoleById(roleId: string): Promise<RoleWithPermissions | null>;
}

export interface RoleFilters {
  search?: string | undefined;
  is_active?: boolean | undefined;
  organization_id?: string | undefined;
  limit?: number;
  offset?: number;
}

export interface RoleWithPermissions {
  role_id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  is_system_role: boolean;
  is_active: boolean;
  created_at: Date;
  permissions: Array<{
    permission_id: string;
    name: string;
    description: string | null;
    resource: string;
    action: string;
    scope: string;
  }>;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

/**
 * RBAC Roles Service
 *
 * Manages role retrieval with automatic RBAC filtering.
 * Read-only service for querying roles and their associated permissions.
 * Extends BaseRBACService for standardized permission checking.
 *
 * **RBAC Scopes:**
 * - `all` - Super admins or users with `roles:read:all` permission
 * - `organization` - Users with `roles:read:organization` permission (see roles in their org + system roles)
 * - `own` - Users with `roles:read:own` permission (see their assigned roles + system roles)
 * - `none` - No permission (returns empty results)
 *
 * **Key Features:**
 * - System roles are globally visible to all users with read permissions
 * - Organization roles are scoped to organization membership
 * - Permissions are eagerly loaded with each role
 * - RBAC filtering applied at database level for security and performance
 *
 * @example
 * ```typescript
 * const rolesService = createRBACRolesService(userContext);
 *
 * // List all accessible roles
 * const roles = await rolesService.getRoles();
 *
 * // Search roles with filter
 * const activeRoles = await rolesService.getRoles({
 *   search: 'admin',
 *   is_active: true,
 *   limit: 10
 * });
 *
 * // Get specific role with permissions
 * const role = await rolesService.getRoleById('role-123');
 * ```
 */
class RolesService extends BaseRBACService implements RolesServiceInterface {
  /**
   * Check if user can manage all roles
   */
  private canManageAll(): boolean {
    return this.checker.hasPermission('roles:manage:all');
  }

  /**
   * Check if user can read all roles
   */
  private canReadAll(): boolean {
    return this.isSuperAdmin() || this.checker.hasPermission('roles:read:all');
  }

  /**
   * Check if user can read organization roles
   */
  private canReadOrganization(): boolean {
    return this.checker.hasPermission('roles:read:organization');
  }

  /**
   * Check if user can read own roles
   */
  private canReadOwn(): boolean {
    return this.checker.hasPermission('roles:read:own');
  }

  /**
   * Build RBAC WHERE conditions for role queries
   *
   * Applies permission-based filtering:
   * - `all` scope: No additional conditions (super admin or roles:read:all)
   * - `organization` scope: Filters to current organization + system roles
   * - `own` scope: Filters to current organization + system roles (simplified)
   * - `none` scope: Returns conditions that match nothing
   *
   * @returns Array of SQL conditions to apply to role queries
   */
  private buildRBACWhereConditions(): SQL[] {
    const conditions: SQL[] = [];

    if (this.canManageAll() || this.canReadAll()) {
      // Can read all roles - no organization filter needed
      return conditions;
    }

    if (this.canReadOrganization() || this.canReadOwn()) {
      // Can read roles from their organization + system roles
      if (this.userContext.current_organization_id) {
        const orgCondition = or(
          eq(roles.organization_id, this.userContext.current_organization_id),
          eq(roles.is_system_role, true) // System roles are global
        );
        if (orgCondition) {
          conditions.push(orgCondition);
        }
      } else {
        // No organization specified, only show system roles
        conditions.push(eq(roles.is_system_role, true));
      }
      return conditions;
    }

    // No read permission - return impossible condition
    return [eq(roles.role_id, 'no-permission')];
  }

  /**
   * Determine RBAC scope for logging
   */
  private getRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll()) return 'all';
    if (this.canReadOrganization()) return 'organization';
    if (this.canReadOwn()) return 'own';
    return 'none';
  }

  /**
   * Check if user can access a specific role
   */
  private canAccessRole(role: {
    organization_id: string | null;
    is_system_role: boolean;
  }): boolean {
    // Super admins and roles:read:all can access everything
    if (this.canReadAll()) return true;

    // System roles are accessible to anyone with read permissions
    if (role.is_system_role) {
      return this.canReadOrganization() || this.canReadOwn();
    }

    // Organization roles require matching organization
    if (this.canReadOrganization() || this.canReadOwn()) {
      return role.organization_id === this.userContext.current_organization_id;
    }

    return false;
  }

  /**
   * Get roles with filters
   *
   * Retrieves roles with their associated permissions, filtered by RBAC scope.
   * System roles are visible to all users with read permissions.
   * Organization roles are scoped to user's current organization.
   *
   * @param filters - Optional filters for search, active status, organization, pagination
   * @returns Array of roles with permissions
   *
   * @example
   * ```typescript
   * // Get all accessible roles
   * const roles = await rolesService.getRoles();
   *
   * // Search with filters
   * const adminRoles = await rolesService.getRoles({
   *   search: 'admin',
   *   is_active: true,
   *   limit: 20,
   *   offset: 0
   * });
   * ```
   */
  async getRoles(filters: RoleFilters = {}): Promise<RoleWithPermissions[]> {
    const startTime = Date.now();

    try {
      const { search, is_active, organization_id, limit = 50, offset = 0 } = filters;

      // Build RBAC where conditions
      const whereConditions = this.buildRBACWhereConditions();

      const scope = this.getRBACScope();

      // Early return for no permissions
      if (scope === 'none') {
        const template = logTemplates.crud.list('roles', {
          userId: this.userContext.user_id,
          filters: filters as Record<string, unknown>,
          results: { returned: 0, total: 0, page: 1 },
          duration: Date.now() - startTime,
          metadata: {
            noPermission: true,
            rbacScope: scope,
            component: 'service',
          },
        });

        log.info(template.message, template.context);
        return [];
      }

      // Filter by active status if specified
      if (is_active !== undefined) {
        whereConditions.push(eq(roles.is_active, is_active));
      }

      // Filter by specific organization if requested and user has permission
      if (organization_id) {
        if (
          this.canManageAll() ||
          this.canReadAll() ||
          (this.canReadOrganization() && organization_id === this.userContext.current_organization_id)
        ) {
          whereConditions.push(eq(roles.organization_id, organization_id));
        }
      }

      // Search filter
      if (search) {
        const searchCondition = or(
          ilike(roles.name, `%${search}%`),
          ilike(roles.description, `%${search}%`)
        );
        if (searchCondition) {
          whereConditions.push(searchCondition);
        }
      }

      // Build the final where clause
      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      // Query roles with their permissions
      const queryStart = Date.now();
      const rolesWithPermissions = await db
        .select({
          role_id: roles.role_id,
          name: roles.name,
          description: roles.description,
          organization_id: roles.organization_id,
          is_system_role: roles.is_system_role,
          is_active: roles.is_active,
          created_at: roles.created_at,
          permission_id: permissions.permission_id,
          permission_name: permissions.name,
          permission_description: permissions.description,
          resource: permissions.resource,
          action: permissions.action,
          scope: permissions.scope,
        })
        .from(roles)
        .leftJoin(role_permissions, eq(roles.role_id, role_permissions.role_id))
        .leftJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
        .where(whereClause)
        .orderBy(roles.name)
        .limit(limit)
        .offset(offset);

      const queryDuration = Date.now() - queryStart;

      // Group by role and aggregate permissions
      const roleMap = new Map<string, RoleWithPermissions>();

      for (const row of rolesWithPermissions) {
        const roleId = row.role_id;

        if (!roleMap.has(roleId)) {
          roleMap.set(roleId, {
            role_id: row.role_id,
            name: row.name,
            description: row.description,
            organization_id: row.organization_id,
            is_system_role: row.is_system_role ?? false,
            is_active: row.is_active ?? true,
            created_at: row.created_at ?? new Date(),
            permissions: [],
          });
        }

        // Add permission if it exists
        if (row.permission_id) {
          const role = roleMap.get(roleId);
          if (!role) {
            throw new Error(`Role ${roleId} not found in roleMap`);
          }
          if (!row.permission_name || !row.resource || !row.action || !row.scope) {
            throw new Error('Permission data incomplete');
          }
          role.permissions.push({
            permission_id: row.permission_id,
            name: row.permission_name,
            description: row.permission_description,
            resource: row.resource,
            action: row.action,
            scope: row.scope,
          });
        }
      }

      const results = Array.from(roleMap.values());
      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('roles', {
        userId: this.userContext.user_id,
        filters: filters as Record<string, unknown>,
        results: {
          returned: results.length,
          total: results.length,
          page: offset ? Math.floor(offset / limit) + 1 : 1,
        },
        duration,
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: scope,
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return results;
    } catch (error) {
      log.error('list roles failed', error, {
        operation: 'list_roles',
        userId: this.userContext.user_id,
        filters,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get total count of accessible roles
   *
   * Returns the count of roles the user can access based on their RBAC scope.
   * Uses the same permission filtering as getRoles().
   *
   * @returns Total count of accessible roles
   *
   * @example
   * ```typescript
   * const totalRoles = await rolesService.getRoleCount();
   * console.log(`User can access ${totalRoles} roles`);
   * ```
   */
  async getRoleCount(): Promise<number> {
    const startTime = Date.now();

    try {
      // Build RBAC where conditions
      const whereConditions = this.buildRBACWhereConditions();

      const scope = this.getRBACScope();

      // Early return for no permissions
      if (scope === 'none') {
        log.info('role count retrieved - no permission', {
          operation: 'get_role_count',
          userId: this.userContext.user_id,
          count: 0,
          duration: Date.now() - startTime,
          metadata: {
            noPermission: true,
            rbacScope: scope,
            component: 'service',
          },
        });
        return 0;
      }

      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const queryStart = Date.now();
      const [countResult] = await db.select({ count: count() }).from(roles).where(whereClause);

      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      const totalCount = Number(countResult?.count ?? 0);

      log.info('role count retrieved', {
        operation: 'get_role_count',
        userId: this.userContext.user_id,
        count: totalCount,
        duration,
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: scope,
          component: 'service',
        },
      });

      return totalCount;
    } catch (error) {
      log.error('get role count failed', error, {
        operation: 'get_role_count',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Get role by ID with permissions
   *
   * Retrieves a specific role with all its associated permissions.
   * Validates RBAC access before returning the role.
   *
   * @param roleId - The role ID to retrieve
   * @returns Role with permissions, or null if not found or no access
   * @throws NotFoundError if role doesn't exist
   *
   * @example
   * ```typescript
   * const role = await rolesService.getRoleById('role-123');
   * if (role) {
   *   console.log(`Role: ${role.name}, Permissions: ${role.permissions.length}`);
   * }
   * ```
   */
  async getRoleById(roleId: string): Promise<RoleWithPermissions | null> {
    const startTime = Date.now();

    try {
      const queryStart = Date.now();
      const rolesWithPermissions = await db
        .select({
          role_id: roles.role_id,
          name: roles.name,
          description: roles.description,
          organization_id: roles.organization_id,
          is_system_role: roles.is_system_role,
          is_active: roles.is_active,
          created_at: roles.created_at,
          permission_id: permissions.permission_id,
          permission_name: permissions.name,
          permission_description: permissions.description,
          resource: permissions.resource,
          action: permissions.action,
          scope: permissions.scope,
        })
        .from(roles)
        .leftJoin(role_permissions, eq(roles.role_id, role_permissions.role_id))
        .leftJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
        .where(eq(roles.role_id, roleId));

      const queryDuration = Date.now() - queryStart;

      if (rolesWithPermissions.length === 0) {
        const duration = Date.now() - startTime;

        log.info('role not found', {
          operation: 'get_role_by_id',
          resourceId: roleId,
          userId: this.userContext.user_id,
          found: false,
          duration,
          metadata: {
            queryDuration,
            component: 'service',
          },
        });

        throw NotFoundError('Role');
      }

      const row = rolesWithPermissions[0];
      if (!row) {
        throw NotFoundError('Role');
      }

      // Check RBAC access
      if (
        !this.canAccessRole({
          organization_id: row.organization_id,
          is_system_role: row.is_system_role ?? false,
        })
      ) {
        const duration = Date.now() - startTime;

        log.info('role access denied - insufficient permissions', {
          operation: 'get_role_by_id',
          resourceId: roleId,
          userId: this.userContext.user_id,
          accessDenied: true,
          duration,
          metadata: {
            rbacScope: this.getRBACScope(),
            roleOrganizationId: row.organization_id,
            isSystemRole: row.is_system_role ?? false,
            component: 'service',
          },
        });

        throw NotFoundError('Role');
      }

      const rolePermissions = rolesWithPermissions
        .filter((r) => r.permission_id)
        .map((r) => {
          if (!r.permission_id || !r.permission_name || !r.resource || !r.action || !r.scope) {
            throw new Error('Permission data incomplete for role');
          }
          return {
            permission_id: r.permission_id,
            name: r.permission_name,
            description: r.permission_description,
            resource: r.resource,
            action: r.action,
            scope: r.scope,
          };
        });

      const role: RoleWithPermissions = {
        role_id: row.role_id,
        name: row.name,
        description: row.description,
        organization_id: row.organization_id,
        is_system_role: row.is_system_role ?? false,
        is_active: row.is_active ?? true,
        created_at: row.created_at ?? new Date(),
        permissions: rolePermissions,
      };

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.read('role', {
        resourceId: roleId,
        resourceName: role.name,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          permissionCount: role.permissions.length,
          isSystemRole: role.is_system_role,
          rbacScope: this.getRBACScope(),
          component: 'service',
        },
      });

      log.info(template.message, template.context);

      return role;
    } catch (error) {
      log.error('get role by id failed', error, {
        operation: 'get_role_by_id',
        resourceId: roleId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create RBAC Roles Service
 *
 * Factory function to create a new RBAC Roles Service instance.
 * The service provides read-only access to roles with automatic RBAC filtering.
 *
 * @param userContext - User context with RBAC permissions and organization membership
 * @returns Service interface for role operations
 *
 * @example
 * ```typescript
 * const rolesService = createRBACRolesService(userContext);
 *
 * // List roles
 * const roles = await rolesService.getRoles({ is_active: true });
 *
 * // Get count
 * const count = await rolesService.getRoleCount();
 *
 * // Get specific role
 * const role = await rolesService.getRoleById('role-123');
 * ```
 */
export function createRBACRolesService(userContext: UserContext): RolesServiceInterface {
  return new RolesService(userContext);
}
