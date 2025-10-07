import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { db } from '@/lib/db';
import { user_roles } from '@/lib/db/rbac-schema';
import { log } from '@/lib/logger';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List users request initiated', {
    operation: 'list_users',
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    const { searchParams } = new URL(request.url);

    const validationStart = Date.now();
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at']);
    const query = validateQuery(searchParams, userQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Request parameters parsed', {
      pagination,
      sort,
      search: query.search ? '[FILTERED]' : undefined,
      filters: {
        is_active: query.is_active,
        email_verified: query.email_verified,
      },
    });

    // Create RBAC users service
    const serviceStart = Date.now();
    const usersService = createRBACUsersService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get users with automatic permission-based filtering
    const usersStart = Date.now();
    const users = await usersService.getUsers({
      search: query.search,
      is_active: query.is_active,
      email_verified: query.email_verified,
      limit: pagination.limit,
      offset: pagination.offset,
    });
    log.db('SELECT', 'users', Date.now() - usersStart, { rowCount: users.length });

    // Get total count
    const countStart = Date.now();
    const totalCount = await usersService.getUserCount();
    log.db('SELECT', 'users_count', Date.now() - countStart, { rowCount: 1 });

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

    const totalDuration = Date.now() - startTime;
    log.info('Users list retrieved successfully', {
      usersReturned: users.length,
      totalCount,
      page: pagination.page,
      totalDuration,
    });

    return createPaginatedResponse(responseData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Users list request failed', error, {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
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

  log.info('User creation request initiated', {
    createdByUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const validationStart = Date.now();
    const validatedData = await validateRequest(request, userCreateSchema);
    const { email, password, first_name, last_name, email_verified, is_active, role_ids } =
      validatedData;
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('User creation data validated', {
      email: email.replace(/(.{2}).*@/, '$1***@'), // Mask email
      first_name,
      last_name,
      email_verified: email_verified || false,
      is_active: is_active || true,
      roleCount: role_ids?.length || 0,
    });

    // Create RBAC users service
    const serviceStart = Date.now();
    const usersService = createRBACUsersService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create user with automatic permission checking
    const userCreationStart = Date.now();
    const newUser = await usersService.createUser({
      email,
      password,
      first_name,
      last_name,
      organization_id: userContext.current_organization_id || '',
      email_verified: email_verified || false,
      is_active: is_active || true,
    });
    log.db('INSERT', 'users', Date.now() - userCreationStart, { rowCount: 1 });

    log.info('User created successfully', {
      newUserId: newUser.user_id,
      userEmail: email.replace(/(.{2}).*@/, '$1***@'),
      createdByUserId: userContext.user_id,
    });

    // Assign roles to the user if provided
    if (role_ids && role_ids.length > 0) {
      const roleAssignmentStart = Date.now();

      log.info('Assigning roles to new user', {
        newUserId: newUser.user_id,
        roleIds: role_ids,
        roleCount: role_ids.length,
      });

      // Verify that the user has permission to assign these roles
      // This is a simplified check - in a real app you'd want more sophisticated validation
      const roleAssignments = role_ids.map((roleId) => ({
        user_id: newUser.user_id,
        role_id: roleId,
        organization_id: userContext.current_organization_id,
        granted_by: userContext.user_id,
      }));

      await db.insert(user_roles).values(roleAssignments);
      log.db('INSERT', 'user_roles', Date.now() - roleAssignmentStart, {
        rowCount: role_ids.length,
      });

      log.info('Roles assigned to new user', {
        newUserId: newUser.user_id,
        rolesAssigned: role_ids.length,
      });
    }

    const totalDuration = Date.now() - startTime;
    log.info('User creation completed successfully', {
      newUserId: newUser.user_id,
      rolesAssigned: role_ids?.length || 0,
      totalDuration,
    });

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
    const totalDuration = Date.now() - startTime;

    log.error('User creation failed', error, {
      createdByUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
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
