import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { getPagination } from '@/lib/api/utils/request';
import { createRBACRolesService } from '@/lib/services/rbac-roles-service';
import type { UserContext } from '@/lib/types/rbac';
import { roleQuerySchema } from '@/lib/validations/role';

const getRolesHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const query = validateQuery(searchParams, roleQuerySchema) || {};

    // Create RBAC roles service
    const rolesService = createRBACRolesService(userContext);

    // Get roles with automatic permission-based filtering
    // For roles dropdown, we want all roles, not paginated results
    const roles = await rolesService.getRoles({
      search: query.search,
      is_active: query.is_active,
      organization_id: query.organization_id,
      limit: 1000, // Get all roles
      offset: 0,
    });

    // Get total count
    const totalCount = await rolesService.getRoleCount();

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
    console.error('Error fetching roles:', error);
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
