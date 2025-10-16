import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import { createUserRolesService } from '@/lib/services/user-roles-service';
import type { UserContext } from '@/lib/types/rbac';
import { userParamsSchema, userUpdateSchema } from '@/lib/validations/user';
import type { z } from 'zod';

const getUserHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    // Create services
    const usersService = createRBACUsersService(userContext);
    const rolesService = createUserRolesService(userContext);

    // Get user with automatic permission checking
    const user = await usersService.getUserById(userId);

    if (!user) {
      throw NotFoundError('User');
    }

    // Fetch user roles separately
    const roles = await rolesService.getUserRoles(userId);

    // Enriched read log with user context
    const template = logTemplates.crud.read('user', {
      resourceId: user.user_id,
      resourceName: `${user.first_name} ${user.last_name}`,
      userId: userContext.user_id,
      found: true,
      duration: Date.now() - startTime,
      metadata: {
        email: user.email.replace(/(.{2}).*@/, '$1***@'),
        emailVerified: user.email_verified,
        isActive: user.is_active,
        organizationCount: user.organizations.length,
        roleCount: roles.length,
        isSelfRead: userId === userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      email_verified: user.email_verified,
      is_active: user.is_active,
      provider_uid: user.provider_uid || null, // Analytics security field
      created_at: user.created_at,
      updated_at: user.updated_at,
      organizations: user.organizations,
      roles,
    });
  } catch (error) {
    log.error('Get user failed', error, {
      operation: 'read_user',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof Error && error.name === 'NotFoundError' ? 404 : 500,
      request
    );
  }
};

const updateUserHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    // Parse the request body to extract the data field
    const requestBody = await request.text();
    const parsedBody = JSON.parse(requestBody);
    const userData = parsedBody.data; // Extract the nested data field

    // Create new request with just the user data for validation
    const requestForValidation = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(userData),
    });

    let updateData: z.infer<typeof userUpdateSchema>;
    try {
      updateData = await validateRequest(requestForValidation, userUpdateSchema);
    } catch (validationError) {
      log.error('Validation failed', validationError, {
        operation: 'update_user',
        targetUserId: userId,
        component: 'validation',
      });
      throw validationError;
    }

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);

    // Get current state BEFORE update for change tracking
    const before = await usersService.getUserById(userId);
    if (!before) {
      throw NotFoundError('User');
    }

    // Filter out undefined values to match UpdateUserData type requirements
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );

    // Update user with automatic permission checking
    const updatedUser = await usersService.updateUser(userId, cleanUpdateData);

    // Calculate changes for audit trail
    const changes = calculateChanges(
      {
        first_name: before.first_name,
        last_name: before.last_name,
        email: before.email,
        email_verified: before.email_verified,
        is_active: before.is_active,
        provider_uid: before.provider_uid,
      },
      {
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        email: updatedUser.email,
        email_verified: updatedUser.email_verified,
        is_active: updatedUser.is_active,
        provider_uid: updatedUser.provider_uid,
      }
    );

    // Enriched update log with change tracking
    const template = logTemplates.crud.update('user', {
      resourceId: updatedUser.user_id,
      resourceName: `${updatedUser.first_name} ${updatedUser.last_name}`,
      userId: userContext.user_id,
      changes,
      duration: Date.now() - startTime,
      metadata: {
        email: updatedUser.email.replace(/(.{2}).*@/, '$1***@'),
        organizationCount: updatedUser.organizations?.length || 0,
        isSelfUpdate: userId === userContext.user_id,
        ...(changes.is_active && changes.is_active.to === false && { reason: 'deactivation' }),
        ...(changes.email_verified && {
          emailVerificationChanged: `${changes.email_verified.from} -> ${changes.email_verified.to}`,
        }),
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: updatedUser.user_id,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        email: updatedUser.email,
        email_verified: updatedUser.email_verified,
        is_active: updatedUser.is_active,
        provider_uid: updatedUser.provider_uid || null, // Analytics security field
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at,
        organizations: updatedUser.organizations,
      },
      'User updated successfully'
    );
  } catch (error) {
    log.error('Update user failed', error, {
      operation: 'update_user',
      userId: userContext.user_id,
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

const deleteUserHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    // Create services
    const usersService = createRBACUsersService(userContext);
    const rolesService = createUserRolesService(userContext);

    // Get user info BEFORE deletion for logging
    const user = await usersService.getUserById(userId);
    if (!user) {
      throw NotFoundError('User');
    }

    // Get roles for logging
    const roles = await rolesService.getUserRoles(userId);

    // Delete user with automatic permission checking
    await usersService.deleteUser(userId);

    // Enriched deletion log with user context
    const template = logTemplates.crud.delete('user', {
      resourceId: userId,
      resourceName: `${user.first_name} ${user.last_name}`,
      userId: userContext.user_id,
      soft: false,
      duration: Date.now() - startTime,
      metadata: {
        email: user.email.replace(/(.{2}).*@/, '$1***@'),
        wasActive: user.is_active,
        emailVerified: user.email_verified,
        hadOrganizations: user.organizations.length,
        hadRoles: roles.length,
        isSelfDelete: userId === userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(null, 'User deleted successfully');
  } catch (error) {
    log.error('Delete user failed', error, {
      operation: 'delete_user',
      userId: userContext.user_id,
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

// Export with RBAC protection
export const GET = rbacRoute(getUserHandler, {
  permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateUserHandler, {
  permission: ['users:update:own', 'users:update:organization', 'users:manage:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteUserHandler, {
  permission: ['users:delete:organization', 'users:manage:all'],
  extractResourceId: extractors.userId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
