import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { getPagination } from '@/lib/api/utils/request';
import { createRBACRolesService } from '@/lib/services/rbac-roles-service';
import type { UserContext } from '@/lib/types/rbac';
import { roleQuerySchema } from '@/lib/validations/role';
import { log, sanitizeFilters } from '@/lib/logger';

const getRolesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const query = validateQuery(searchParams, roleQuerySchema) || {};

    const rolesService = createRBACRolesService(userContext);

    const roles = await rolesService.getRoles({
      search: query.search,
      is_active: query.is_active,
      organization_id: query.organization_id,
      limit: 1000,
      offset: 0,
    });

    const totalCount = await rolesService.getRoleCount();

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      search: query.search,
      is_active: query.is_active,
      organization_id: query.organization_id,
    });

    const activeCount = roles.filter((r) => r.is_active).length;
    const systemRoleCount = roles.filter((r) => r.is_system_role).length;

    log.info(`roles list query completed - returned ${roles.length} of ${totalCount}`, {
      operation: 'list_roles',
      resourceType: 'roles',
      userId: userContext.user_id,
      filters,
      results: {
        returned: roles.length,
        total: totalCount,
        active: activeCount,
        inactive: roles.length - activeCount,
        systemRoles: systemRoleCount,
      },
      duration,
      slow: duration > 1000,
      component: 'rbac',
    });

    return createPaginatedResponse(
      roles.map((role) => ({
        id: role.role_id,
        name: role.name,
        description: role.description,
        organization_id: role.organization_id,
        is_system_role: role.is_system_role,
        is_active: role.is_active,
        created_at: role.created_at,
        permissions: role.permissions,
      })),
      {
        page: pagination.page,
        limit: pagination.limit,
        total: totalCount,
      }
    );
  } catch (error) {
    log.error('roles list query failed', error, {
      operation: 'list_roles',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'rbac',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection - users can read roles based on their scope
export const GET = rbacRoute(getRolesHandler, {
  permission: ['roles:read:organization', 'roles:read:all', 'roles:manage:all'],
  rateLimit: 'api',
});
