import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { userUpdateSchema, userParamsSchema } from '@/lib/validations/user';
import { userRoute } from '@/lib/api/rbac-route-handler';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { 
  createAPILogger, 
  logDBOperation, 
  logPerformanceMetric 
} from '@/lib/logger';

const getUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);
    
    logger.info('Get user request initiated', {
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

    logPerformanceMetric(logger, 'get_user_total', Date.now() - startTime);
    
    logger.info('User retrieved successfully', {
      targetUserId: userId,
      hasOrganizations: user.organizations.length > 0
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
      organizations: user.organizations
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Get user failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);
    
    logger.info('Update user request initiated', {
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
      logger.error('Validation failed', {
        targetUserId: userId,
        validationError: validationError instanceof Error ? validationError.message : String(validationError),
        validationStack: validationError instanceof Error ? validationError.stack : undefined
      });
      throw validationError;
    }
    
    logger.info('Validation successful', {
      targetUserId: userId,
      requestingUserId: userContext.user_id,
      updateFields: Object.keys(updateData),
      hasRoleIds: !!updateData.role_ids,
      roleCount: updateData.role_ids?.length || 0
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);
    
    // Update user with automatic permission checking
    const dbStart = Date.now();
    const updatedUser = await usersService.updateUser(userId, updateData);
    logDBOperation(logger, 'update_user', Date.now() - dbStart);
    
    logPerformanceMetric(logger, 'update_user_total', Date.now() - startTime);
    
    logger.info('User updated successfully', {
      targetUserId: userId,
      updatedFields: Object.keys(updateData)
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
    
    // Enhanced error logging
    if (error instanceof Error) {
      logger.error('Update user failed', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        duration,
        targetUserId: 'unknown'
      });
    } else {
      logger.error('Update user failed with unknown error', {
        error: String(error),
        duration
      });
    }
    
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

const deleteUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);
    
    logger.info('Delete user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);
    
    // Delete user with automatic permission checking
    const dbStart = Date.now();
    await usersService.deleteUser(userId);
    logDBOperation(logger, 'delete_user', Date.now() - dbStart);
    
    logPerformanceMetric(logger, 'delete_user_total', Date.now() - startTime);
    
    logger.info('User deleted successfully', {
      targetUserId: userId
    });

    return createSuccessResponse(null, 'User deleted successfully');

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Delete user failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
export const GET = userRoute(
  ['users:read:own', 'users:read:organization', 'users:read:all'],
  getUserHandler,
  { rateLimit: 'api' }
);

export const PUT = userRoute(
  ['users:update:own', 'users:update:organization', 'users:manage:all'],
  updateUserHandler,
  { rateLimit: 'api' }
);

export const DELETE = userRoute(
  ['users:delete:organization', 'users:manage:all'],
  deleteUserHandler,
  { rateLimit: 'api' }
);
