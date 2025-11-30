import type { NextRequest } from 'next/server';
import { inArray } from 'drizzle-orm';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { account_security, db } from '@/lib/db';
import { log, logTemplates, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import { createUserRolesService } from '@/lib/services/user-roles-service';
import type { UserContext } from '@/lib/types/rbac';
import { userCreateSchema, userQuerySchema } from '@/lib/validations/user';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at']);
    const query = validateQuery(searchParams, userQuerySchema);

    // Create services
    const usersService = createRBACUsersService(userContext);
    const rolesService = createUserRolesService(userContext);

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

    // Batch fetch roles for all users (prevents N+1)
    const userIds = users.map((u) => u.user_id);
    const rolesMap = await rolesService.batchGetUserRoles(userIds);

    // Batch fetch MFA status for all users (prevents N+1)
    const mfaStatusMap = new Map<string, { mfa_enabled: boolean; mfa_method: string | null }>();
    if (userIds.length > 0) {
      const mfaStatuses = await db
        .select({
          user_id: account_security.user_id,
          mfa_enabled: account_security.mfa_enabled,
          mfa_method: account_security.mfa_method,
        })
        .from(account_security)
        .where(inArray(account_security.user_id, userIds));

      for (const status of mfaStatuses) {
        mfaStatusMap.set(status.user_id, {
          mfa_enabled: status.mfa_enabled,
          mfa_method: status.mfa_method,
        });
      }
    }

    // Batch fetch MFA credential counts
    const credentialCountsMap = await usersService.getMFACredentialCounts(userIds);

    const responseData = users.map((user) => {
      const mfaStatus = mfaStatusMap.get(user.user_id);
      const credentialCount = credentialCountsMap.get(user.user_id) || 0;

      return {
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        email_verified: user.email_verified,
        is_active: user.is_active,
        created_at: user.created_at,
        organization_id: user.organizations[0]?.organization_id || null, // Primary organization for form
        organizations: user.organizations,
        roles: rolesMap.get(user.user_id) || [],
        mfa_enabled: mfaStatus?.mfa_enabled || false,
        mfa_method: mfaStatus?.mfa_method || null,
        mfa_credentials_count: credentialCount,
      };
    });

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
      slow: Date.now() - startTime > SLOW_THRESHOLDS.API_OPERATION,
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
    const {
      email,
      password,
      first_name,
      last_name,
      organization_id,
      email_verified,
      is_active,
      role_ids,
      provider_uid,
    } = validatedData;

    // Create services
    const usersService = createRBACUsersService(userContext);
    const rolesService = createUserRolesService(userContext);

    // Create user with automatic permission checking
    const newUser = await usersService.createUser({
      email,
      password,
      first_name,
      last_name,
      organization_id,
      email_verified: email_verified || false,
      is_active: is_active || true,
      ...(provider_uid !== null && provider_uid !== undefined && { provider_uid }),
    });

    // Assign roles to the user if provided
    if (role_ids && role_ids.length > 0) {
      await rolesService.assignRolesToUser(newUser.user_id, role_ids);
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
