import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACOrganizationsService } from '@/lib/services/rbac-organizations-service';
import type { UserContext } from '@/lib/types/rbac';
import { organizationParamsSchema, organizationUpdateSchema } from '@/lib/validations/organization';

const getOrganizationHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: organizationId } = await extractRouteParams(args[0], organizationParamsSchema);

    log.info('Get organization request initiated', {
      targetOrganizationId: organizationId,
      requestingUserId: userContext.user_id,
    });

    const organizationService = createRBACOrganizationsService(userContext);
    const organization = await organizationService.getOrganizationById(organizationId);

    if (!organization) {
      throw NotFoundError('Organization');
    }

    log.info('Organization retrieved successfully', {
      targetOrganizationId: organizationId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse({
      id: organization.organization_id,
      name: organization.name,
      slug: organization.slug,
      parent_organization_id: organization.parent_organization_id,
      is_active: organization.is_active,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      member_count: organization.member_count,
      children_count: organization.children_count,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Get organization failed', error, { duration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

const updateOrganizationHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: organizationId } = await extractRouteParams(args[0], organizationParamsSchema);

    log.info('Update organization request initiated', {
      targetOrganizationId: organizationId,
      requestingUserId: userContext.user_id,
    });

    const updateData = await validateRequest(request, organizationUpdateSchema);

    const organizationService = createRBACOrganizationsService(userContext);
    const updatedOrganization = await organizationService.updateOrganization(
      organizationId,
      updateData
    );

    log.info('Organization updated successfully', {
      targetOrganizationId: organizationId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(
      {
        id: updatedOrganization.organization_id,
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        parent_organization_id: updatedOrganization.parent_organization_id,
        is_active: updatedOrganization.is_active,
        created_at: updatedOrganization.created_at,
        updated_at: updatedOrganization.updated_at,
        member_count: updatedOrganization.member_count,
        children_count: updatedOrganization.children_count,
      },
      'Organization updated successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Update organization failed', error, { duration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

const deleteOrganizationHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { id: organizationId } = await extractRouteParams(args[0], organizationParamsSchema);

    log.info('Delete organization request initiated', {
      targetOrganizationId: organizationId,
      requestingUserId: userContext.user_id,
    });

    const organizationService = createRBACOrganizationsService(userContext);
    await organizationService.deleteOrganization(organizationId);

    log.info('Organization deleted successfully', {
      targetOrganizationId: organizationId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(null, 'Organization deleted successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Delete organization failed', error, { duration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getOrganizationHandler, {
  permission: [
    'organizations:read:own',
    'organizations:read:organization',
    'organizations:read:all',
  ],
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateOrganizationHandler, {
  permission: [
    'organizations:update:own',
    'organizations:update:organization',
    'organizations:manage:all',
  ],
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteOrganizationHandler, {
  permission: ['organizations:delete:organization', 'organizations:manage:all'],
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
