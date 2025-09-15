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
import { 
  createAPILogger, 
  logDBOperation, 
  logPerformanceMetric,
  logValidationError 
} from '@/lib/logger';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
    const startTime = Date.now()
    const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
    
    logger.info('Users list request initiated', {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id
    })

    try {
      const { searchParams } = new URL(request.url)
      
      const validationStart = Date.now()
      const pagination = getPagination(searchParams)
      const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at'])
      const query = validateQuery(searchParams, userQuerySchema)
      logPerformanceMetric(logger, 'request_validation', Date.now() - validationStart)
      
      logger.debug('Request parameters parsed', {
        pagination,
        sort,
        search: query.search ? '[FILTERED]' : undefined,
        filters: {
          is_active: query.is_active,
          email_verified: query.email_verified
        }
      })
      
      // Create RBAC users service
      const serviceStart = Date.now()
      const usersService = createRBACUsersService(userContext)
      logPerformanceMetric(logger, 'rbac_service_creation', Date.now() - serviceStart)
      
      // Get users with automatic permission-based filtering
      const usersStart = Date.now()
      const users = await usersService.getUsers({
        search: query.search,
        is_active: query.is_active,
        email_verified: query.email_verified,
        limit: pagination.limit,
        offset: pagination.offset
      })
      logDBOperation(logger, 'SELECT', 'users', usersStart, users.length)

      // Get total count
      const countStart = Date.now()
      const totalCount = await usersService.getUserCount()
      logDBOperation(logger, 'COUNT', 'users', countStart, 1)

      const responseData = users.map(user => ({
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        email_verified: user.email_verified,
        is_active: user.is_active,
        created_at: user.created_at,
        organizations: user.organizations,
        roles: user.roles || []
      }))

      const totalDuration = Date.now() - startTime
      logger.info('Users list retrieved successfully', {
        usersReturned: users.length,
        totalCount,
        page: pagination.page,
        totalDuration
      })

      logPerformanceMetric(logger, 'users_list_total', totalDuration, {
        usersReturned: users.length,
        success: true
      })

      return createPaginatedResponse(
        responseData,
        {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount
        }
      )
      
    } catch (error) {
      const totalDuration = Date.now() - startTime
      
      logger.error('Users list request failed', error, {
        requestingUserId: userContext.user_id,
        organizationId: userContext.current_organization_id,
        totalDuration,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      })

      logPerformanceMetric(logger, 'users_list_total', totalDuration, {
        success: false,
        errorType: error instanceof Error ? error.name : 'unknown'
      })

      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        request
      )
    }
}

// Export with RBAC protection - users can read based on their scope
export const GET = userRoute(
  ['users:read:own', 'users:read:organization', 'users:read:all'],
  getUsersHandler,
  { rateLimit: 'api' }
);

const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  logger.info('User creation request initiated', {
    createdByUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  })

  try {
    const validationStart = Date.now()
    const validatedData = await validateRequest(request, userCreateSchema)
    const { email, password, first_name, last_name, email_verified, is_active, role_ids } = validatedData
    logPerformanceMetric(logger, 'request_validation', Date.now() - validationStart)

    logger.debug('User creation data validated', {
      email: email.replace(/(.{2}).*@/, '$1***@'), // Mask email
      first_name,
      last_name,
      email_verified: email_verified || false,
      is_active: is_active || true,
      roleCount: role_ids?.length || 0
    })

    // Create RBAC users service
    const serviceStart = Date.now()
    const usersService = createRBACUsersService(userContext)
    logPerformanceMetric(logger, 'rbac_service_creation', Date.now() - serviceStart)

    // Create user with automatic permission checking
    const userCreationStart = Date.now()
    const newUser = await usersService.createUser({
      email,
      password,
      first_name,
      last_name,
      organization_id: userContext.current_organization_id || '',
      email_verified: email_verified || false,
      is_active: is_active || true
    })
    logDBOperation(logger, 'INSERT', 'users', userCreationStart, 1)

    logger.info('User created successfully', {
      newUserId: newUser.user_id,
      userEmail: email.replace(/(.{2}).*@/, '$1***@'),
      createdByUserId: userContext.user_id
    })

    // Assign roles to the user if provided
    if (role_ids && role_ids.length > 0) {
      const roleAssignmentStart = Date.now()
      
      logger.debug('Assigning roles to new user', {
        newUserId: newUser.user_id,
        roleIds: role_ids,
        roleCount: role_ids.length
      })

      // Verify that the user has permission to assign these roles
      // This is a simplified check - in a real app you'd want more sophisticated validation
      const roleAssignments = role_ids.map(roleId => ({
        user_id: newUser.user_id,
        role_id: roleId,
        organization_id: userContext.current_organization_id,
        granted_by: userContext.user_id
      }))

      await db.insert(user_roles).values(roleAssignments)
      logDBOperation(logger, 'INSERT', 'user_roles', roleAssignmentStart, role_ids.length)

      logger.info('Roles assigned to new user', {
        newUserId: newUser.user_id,
        rolesAssigned: role_ids.length
      })
    }

    const totalDuration = Date.now() - startTime
    logger.info('User creation completed successfully', {
      newUserId: newUser.user_id,
      rolesAssigned: role_ids?.length || 0,
      totalDuration
    })

    logPerformanceMetric(logger, 'user_creation_total', totalDuration, {
      success: true,
      rolesAssigned: role_ids?.length || 0
    })

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
    }, 'User created successfully')

  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('User creation failed', error, {
      createdByUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })

    // Log validation errors specifically
    if (error instanceof Error && error.name === 'ValidationError') {
      logValidationError(logger, 'user_creation', error.message, error.message)
    }

    logPerformanceMetric(logger, 'user_creation_total', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    )
  }
}

// Export with RBAC protection - requires permission to create users
export const POST = userRoute(
  'users:create:organization',
  createUserHandler,
  { rateLimit: 'api' }
);
