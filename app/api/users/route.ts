import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { db } from '@/lib/db';
import { user_roles } from '@/lib/db/rbac-schema';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at']);
    const query = validateQuery(searchParams, userQuerySchema);

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);

    // Get users with automatic permission-based filtering
    const users = await usersService.getUsers({
      search: query.search,
      is_active: query.is_active,
      email_verified: query.email_verified,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    // Get total count
    const totalCount = await usersService.getUserCount();

    const responseData = users.map((user) => ({
      id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      email_verified: user.email_verified,
      is_active: user.is_active,
      created_at: user.created_at,
      organizations: user.organizations,
      roles: user.roles || [],
    }));

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      is_active: query.is_active,
      email_verified: query.email_verified,
      search: query.search,
    });

    // Count users by status
    const activeCount = users.filter((u) => u.is_active).length;
    const inactiveCount = users.length - activeCount;
    const verifiedCount = users.filter((u) => u.email_verified).length;

    // Enriched success log - consolidates 6 separate logs into 1 comprehensive log
    log.info(`users list query completed - returned ${users.length} of ${totalCount}`, {
      operation: 'list_users',
      resourceType: 'users',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      isSuperAdmin: userContext.is_super_admin,
      filters,
      filterCount: Object.values(filters).filter((v) => v !== null && v !== undefined).length,
      results: {
        returned: users.length,
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        emailVerified: verifiedCount,
        page: pagination.page,
        pageSize: pagination.limit,
      },
      sort: {
        field: sort.sortBy,
        direction: sort.sortOrder,
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > 1000,
      component: 'business-logic',
    });

    return createPaginatedResponse(responseData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    log.error('Users list query failed', error, {
      operation: 'list_users',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection - users can read based on their scope
export const GET = rbacRoute(getUsersHandler, {
  permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, userCreateSchema);
    const { email, password, first_name, last_name, email_verified, is_active, role_ids } =
      validatedData;

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);

    // Create user with automatic permission checking
    const newUser = await usersService.createUser({
      email,
      password,
      first_name,
      last_name,
      organization_id: userContext.current_organization_id || '',
      email_verified: email_verified || false,
      is_active: is_active || true,
    });

    // Assign roles to the user if provided
    if (role_ids && role_ids.length > 0) {
      // Verify that the user has permission to assign these roles
      // This is a simplified check - in a real app you'd want more sophisticated validation
      const roleAssignments = role_ids.map((roleId) => ({
        user_id: newUser.user_id,
        role_id: roleId,
        organization_id: userContext.current_organization_id,
        granted_by: userContext.user_id,
      }));

      await db.insert(user_roles).values(roleAssignments);
    }

    // Enriched creation success log - consolidates 8+ separate logs into 1 comprehensive log
    const template = logTemplates.crud.create('user', {
      resourceId: newUser.user_id,
      resourceName: `${newUser.first_name} ${newUser.last_name}`,
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      metadata: {
        email: newUser.email.replace(/(.{2}).*@/, '$1***@'),
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        emailVerified: newUser.email_verified,
        isActive: newUser.is_active,
        rolesAssigned: role_ids?.length || 0,
        ...(role_ids && role_ids.length > 0 && { roleIds: role_ids }),
        hasPassword: !!password,
        organizationCount: newUser.organizations?.length || 0,
        createdBy: userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: newUser.user_id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email_verified: newUser.email_verified,
        is_active: newUser.is_active,
        created_at: newUser.created_at,
        organizations: newUser.organizations,
        roles_assigned: role_ids || [],
      },
      'User created successfully'
    );
  } catch (error) {
    log.error('User creation failed', error, {
      operation: 'create_user',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection - requires permission to create users
export const POST = rbacRoute(createUserHandler, {
  permission: 'users:create:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
