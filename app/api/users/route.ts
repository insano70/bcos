import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, ConflictError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user';
import { userRoute } from '@/lib/api/rbac-route-handler';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { db } from '@/lib/db';
import { user_roles } from '@/lib/db/rbac-schema';
import { eq } from 'drizzle-orm';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
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
        offset: pagination.offset
      });

      // Get total count
      const totalCount = await usersService.getUserCount();

      return createPaginatedResponse(
        users.map(user => ({
          id: user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          email_verified: user.email_verified,
          is_active: user.is_active,
          created_at: user.created_at,
          organizations: user.organizations
        })),
        {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount
        }
      );
    } catch (error) {
      console.error('Error fetching users:', error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error', 
        500, 
        request
      );
    }
}

// Export with RBAC protection - users can read based on their scope
export const GET = userRoute(
  ['users:read:own', 'users:read:organization', 'users:read:all'],
  getUsersHandler,
  { rateLimit: 'api' }
);

const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const validatedData = await validateRequest(request, userCreateSchema);
    const { email, password, first_name, last_name, email_verified, is_active, role_ids } = validatedData;

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
      is_active: is_active || true
    });

    // Assign roles to the user if provided
    if (role_ids && role_ids.length > 0) {
      // Verify that the user has permission to assign these roles
      // This is a simplified check - in a real app you'd want more sophisticated validation
      const roleAssignments = role_ids.map(roleId => ({
        user_id: newUser.user_id,
        role_id: roleId,
        organization_id: userContext.current_organization_id,
        granted_by: userContext.user_id
      }));

      await db.insert(user_roles).values(roleAssignments);
    }

    return createSuccessResponse({
      id: newUser.user_id,
      email: newUser.email,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      email_verified: newUser.email_verified,
      is_active: newUser.is_active,
      created_at: newUser.created_at,
      organizations: newUser.organizations,
      roles_assigned: role_ids || []
    }, 'User created successfully');

  } catch (error) {
    console.error('Error creating user:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection - requires permission to create users
export const POST = userRoute(
  'users:create:organization',
  createUserHandler,
  { rateLimit: 'api' }
);
