import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACOrganizationsService } from '@/lib/services/organizations';
import type { UserContext } from '@/lib/types/rbac';
import {
  organizationParamsSchema,
  organizationUsersBatchUpdateSchema,
} from '@/lib/validations/organization';

const getOrganizationUsersHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: organizationId } = await extractRouteParams(args[0], organizationParamsSchema);

    const organizationService = createRBACOrganizationsService(userContext);

    // Get all users with membership status
    const usersWithStatus =
      await organizationService.getOrganizationUsersWithStatus(organizationId);

    const duration = Date.now() - startTime;
    const memberCount = usersWithStatus.filter((u) => u.is_member).length;

    log.info(
      `organization users list completed - returned ${usersWithStatus.length} users (${memberCount} members)`,
      {
        operation: 'list_organization_users',
        resourceType: 'organization_users',
        userId: userContext.user_id,
        organizationId,
        isSuperAdmin: userContext.is_super_admin,
        results: {
          total: usersWithStatus.length,
          members: memberCount,
          nonMembers: usersWithStatus.length - memberCount,
        },
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'api',
      }
    );

    return createSuccessResponse(
      usersWithStatus.map((user) => ({
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        email_verified: user.email_verified,
        created_at: user.created_at,
        is_member: user.is_member,
        joined_at: user.joined_at,
      }))
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Organization users list query failed', error, {
      operation: 'list_organization_users',
      userId: userContext.user_id,
      duration: totalDuration,
      component: 'api',
    });

    return handleRouteError(error, 'Failed to process organization users request', request);
  }
};

export const GET = rbacRoute(getOrganizationUsersHandler, {
  permission: 'organizations:manage:all',
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

const updateOrganizationUsersHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: organizationId } = await extractRouteParams(args[0], organizationParamsSchema);
    const validatedData = await validateRequest(request, organizationUsersBatchUpdateSchema);

    const organizationService = createRBACOrganizationsService(userContext);

    // Perform batch update
    const result = await organizationService.updateOrganizationUsers(
      organizationId,
      validatedData.add_user_ids,
      validatedData.remove_user_ids
    );

    const duration = Date.now() - startTime;

    // Log batch update operation
    log.info(`organization users updated - ${result.added} added, ${result.removed} removed`, {
      operation: 'update_organization_users',
      resourceType: 'organization_users',
      resourceId: organizationId,
      userId: userContext.user_id,
      organizationId,
      addedCount: result.added,
      removedCount: result.removed,
      totalChanges: result.added + result.removed,
      addUserIds: validatedData.add_user_ids,
      removeUserIds: validatedData.remove_user_ids,
      duration,
      slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
      component: 'api',
    });

    return createSuccessResponse(
      {
        added: result.added,
        removed: result.removed,
        organization_id: organizationId,
      },
      `Successfully updated organization users: ${result.added} added, ${result.removed} removed`
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Organization users batch update failed', error, {
      operation: 'update_organization_users',
      userId: userContext.user_id,
      duration: totalDuration,
      component: 'api',
    });

    return handleRouteError(error, 'Failed to process organization users request', request);
  }
};

export const PUT = rbacRoute(updateOrganizationUsersHandler, {
  permission: 'organizations:manage:all',
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
