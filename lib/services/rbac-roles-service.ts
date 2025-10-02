import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { permissions, role_permissions, roles } from '@/lib/db/rbac-schema';
import type { UserContext } from '@/lib/types/rbac';

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

/**
 * RBAC Roles Service
 * Handles role management with automatic permission-based filtering
 */
export function createRBACRolesService(userContext: UserContext) {
  const hasManageAllPermission =
    userContext.all_permissions?.some((p) => p.name === 'roles:manage:all') || false;

  const hasReadAllPermission =
    userContext.all_permissions?.some((p) => p.name === 'roles:read:all') || false;

  const hasReadOrganizationPermission =
    userContext.all_permissions?.some((p) => p.name === 'roles:read:organization') || false;

  const hasReadOwnPermission =
    userContext.all_permissions?.some((p) => p.name === 'roles:read:own') || false;

  return {
    async getRoles(filters: RoleFilters = {}) {
      const { search, is_active, organization_id, limit = 50, offset = 0 } = filters;

      // Build the where conditions based on user permissions
      const whereConditions = [];

      // Filter by active status if specified
      if (is_active !== undefined) {
        whereConditions.push(eq(roles.is_active, is_active));
      }

      // Filter by organization based on permissions
      if (hasManageAllPermission || hasReadAllPermission) {
        // Can read all roles - no organization filter needed
      } else if (hasReadOrganizationPermission) {
        // Can read roles from their organization
        if (userContext.current_organization_id) {
          whereConditions.push(
            or(
              eq(roles.organization_id, userContext.current_organization_id),
              eq(roles.is_system_role, true) // System roles are global
            )
          );
        } else {
          // No organization specified, only show system roles
          whereConditions.push(eq(roles.is_system_role, true));
        }
      } else if (hasReadOwnPermission) {
        // Can only read roles assigned to them (more complex query needed)
        // For now, fall back to organization scope
        if (userContext.current_organization_id) {
          whereConditions.push(
            or(
              eq(roles.organization_id, userContext.current_organization_id),
              eq(roles.is_system_role, true)
            )
          );
        } else {
          // No organization specified, only show system roles
          whereConditions.push(eq(roles.is_system_role, true));
        }
      } else {
        // No read permission - return empty array
        return [];
      }

      // Filter by specific organization if requested and user has permission
      if (organization_id) {
        if (
          hasManageAllPermission ||
          hasReadAllPermission ||
          (hasReadOrganizationPermission && organization_id === userContext.current_organization_id)
        ) {
          whereConditions.push(eq(roles.organization_id, organization_id));
        }
      }

      // Search filter
      if (search) {
        whereConditions.push(
          or(ilike(roles.name, `%${search}%`), ilike(roles.description, `%${search}%`))
        );
      }

      // Build the final where clause
      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      // Query roles with their permissions
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

      return Array.from(roleMap.values());
    },

    async getRoleCount() {
      const whereConditions = [];

      // Apply same permission-based filtering as getRoles
      if (hasReadAllPermission) {
        // Can read all roles
      } else if (hasReadOrganizationPermission) {
        if (userContext.current_organization_id) {
          whereConditions.push(
            or(
              eq(roles.organization_id, userContext.current_organization_id),
              eq(roles.is_system_role, true)
            )
          );
        } else {
          whereConditions.push(eq(roles.is_system_role, true));
        }
      } else if (hasReadOwnPermission) {
        if (userContext.current_organization_id) {
          whereConditions.push(
            or(
              eq(roles.organization_id, userContext.current_organization_id),
              eq(roles.is_system_role, true)
            )
          );
        } else {
          whereConditions.push(eq(roles.is_system_role, true));
        }
      } else {
        return 0;
      }

      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const result = await db.select({ count: roles.role_id }).from(roles).where(whereClause);

      return result.length;
    },

    async getRoleById(roleId: string) {
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
        .where(eq(roles.role_id, roleId))
        .limit(1);

      if (rolesWithPermissions.length === 0) {
        return null;
      }

      const row = rolesWithPermissions[0];
      if (!row) {
        return null;
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

      return {
        role_id: row.role_id,
        name: row.name,
        description: row.description,
        organization_id: row.organization_id,
        is_system_role: row.is_system_role ?? false,
        is_active: row.is_active ?? true,
        created_at: row.created_at ?? new Date(),
        permissions: rolePermissions,
      };
    },
  };
}
