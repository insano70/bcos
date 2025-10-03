import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { userUpdateSchema, userParamsSchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const getUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    log.info('Get user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);
    
    // Get user with automatic permission checking
    const user = await usersService.getUserById(userId);
    
    if (!user) {
      throw NotFoundError('User');
    }

    log.info('User retrieved successfully', {
      targetUserId: userId,
      hasOrganizations: user.organizations.length > 0,
      duration: Date.now() - startTime
    });

    return createSuccessResponse({
      id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      email_verified: user.email_verified,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      organizations: user.organizations,
      roles: user.roles || []
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Get user failed', error, {
      duration
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

const updateUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    log.info('Update user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    // Parse the request body to extract the data field
    const requestBody = await request.text();
    const parsedBody = JSON.parse(requestBody);
    const userData = parsedBody.data; // Extract the nested data field
    
    // Create new request with just the user data for validation
    const requestForValidation = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(userData)
    });

    let updateData;
    try {
      updateData = await validateRequest(requestForValidation, userUpdateSchema);
    } catch (validationError) {
      log.error('Validation failed', validationError, {
        targetUserId: userId
      });
      throw validationError;
    }

    log.info('Validation successful', {
      targetUserId: userId,
      requestingUserId: userContext.user_id,
      updateFields: Object.keys(updateData),
      hasRoleIds: !!updateData.role_ids,
      roleCount: updateData.role_ids?.length || 0
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);
    
    // Filter out undefined values to match UpdateUserData type requirements
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );
    
    // Update user with automatic permission checking
    const dbStart = Date.now();
    const updatedUser = await usersService.updateUser(userId, cleanUpdateData);
    log.db('UPDATE', 'users', Date.now() - dbStart, { rowCount: 1 });

    log.info('User updated successfully', {
      targetUserId: userId,
      updatedFields: Object.keys(updateData),
      duration: Date.now() - startTime
    });

    return createSuccessResponse({
      id: updatedUser.user_id,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      email: updatedUser.email,
      email_verified: updatedUser.email_verified,
      is_active: updatedUser.is_active,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at,
      organizations: updatedUser.organizations
    }, 'User updated successfully');

  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Update user failed', error, {
      duration
    });
    
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

const deleteUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    log.info('Delete user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);

    // Delete user with automatic permission checking
    const dbStart = Date.now();
    await usersService.deleteUser(userId);
    log.db('DELETE', 'users', Date.now() - dbStart, { rowCount: 1 });

    log.info('User deleted successfully', {
      targetUserId: userId,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(null, 'User deleted successfully');

  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Delete user failed', error, {
      duration
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const GET = rbacRoute(
  getUserHandler,
  {
    permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

export const PUT = rbacRoute(
  updateUserHandler,
  {
    permission: ['users:update:own', 'users:update:organization', 'users:manage:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

export const DELETE = rbacRoute(
  deleteUserHandler,
  {
    permission: ['users:delete:organization', 'users:manage:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
