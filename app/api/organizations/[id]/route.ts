import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, getErrorStatusCode, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { rbacCache } from '@/lib/cache';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACOrganizationsService } from '@/lib/services/organizations';
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

    const organizationService = createRBACOrganizationsService(userContext);
    const organization = await organizationService.getOrganizationById(organizationId);

    if (!organization) {
      throw NotFoundError('Organization');
    }

    // Enriched read log with organization context
    const template = logTemplates.crud.read('organization', {
      resourceId: organization.organization_id,
      resourceName: organization.name,
      userId: userContext.user_id,
      found: true,
      duration: Date.now() - startTime,
      metadata: {
        slug: organization.slug,
        isActive: organization.is_active,
        hasParent: !!organization.parent_organization_id,
        memberCount: organization.member_count,
        childrenCount: organization.children_count,
      },
    });
    log.info(template.message, template.context);

    return createSuccessResponse({
      id: organization.organization_id,
      name: organization.name,
      slug: organization.slug,
      parent_organization_id: organization.parent_organization_id,
      practice_uids: organization.practice_uids || [], // Analytics security field
      is_active: organization.is_active,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      member_count: organization.member_count,
      children_count: organization.children_count,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Get organization failed', error, {
      operation: 'read_organization',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      getErrorStatusCode(error),
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

    const organizationService = createRBACOrganizationsService(userContext);

    // Get current state BEFORE update for change tracking
    const before = await organizationService.getOrganizationById(organizationId);

    if (!before) {
      throw NotFoundError('Organization');
    }

    const updateData = await validateRequest(request, organizationUpdateSchema);

    // Perform update
    const updatedOrganization = await organizationService.updateOrganization(
      organizationId,
      updateData
    );

    // Invalidate organization hierarchy cache (practice_uids or structure may have changed)
    await rbacCache.invalidateOrganizationHierarchy();

    // Calculate changes for audit trail (using explicit object properties)
    const changes = calculateChanges(
      {
        name: before.name,
        slug: before.slug,
        parent_organization_id: before.parent_organization_id,
        practice_uids: before.practice_uids,
        is_active: before.is_active,
      },
      {
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        parent_organization_id: updatedOrganization.parent_organization_id,
        practice_uids: updatedOrganization.practice_uids,
        is_active: updatedOrganization.is_active,
      }
    );

    // Enriched update log with change tracking
    const template = logTemplates.crud.update('organization', {
      resourceId: updatedOrganization.organization_id,
      resourceName: updatedOrganization.name,
      userId: userContext.user_id,
      changes,
      duration: Date.now() - startTime,
      metadata: {
        parentOrg: updatedOrganization.parent_organization_id || 'none',
        memberCount: updatedOrganization.member_count,
        childrenCount: updatedOrganization.children_count,
        reason: changes.is_active && changes.is_active.to === false ? 'deactivation' : 'update',
      },
    });
    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: updatedOrganization.organization_id,
        name: updatedOrganization.name,
        slug: updatedOrganization.slug,
        parent_organization_id: updatedOrganization.parent_organization_id,
        practice_uids: updatedOrganization.practice_uids || [], // Analytics security field
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
    log.error('Update organization failed', error, {
      operation: 'update_organization',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

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

    const organizationService = createRBACOrganizationsService(userContext);
    
    // Get organization info BEFORE deletion for logging
    const organization = await organizationService.getOrganizationById(organizationId);
    if (!organization) {
      throw NotFoundError('Organization');
    }

    await organizationService.deleteOrganization(organizationId);

    // Invalidate organization hierarchy cache (org removed from tree)
    await rbacCache.invalidateOrganizationHierarchy();

    // Enriched deletion log with organization context
    const template = logTemplates.crud.delete('organization', {
      resourceId: organizationId,
      resourceName: organization.name,
      userId: userContext.user_id,
      soft: false,
      duration: Date.now() - startTime,
      metadata: {
        slug: organization.slug,
        wasActive: organization.is_active,
        hadMembers: organization.member_count,
        hadChildren: organization.children_count,
        hadParent: !!organization.parent_organization_id,
      },
    });
    log.info(template.message, template.context);

    return createSuccessResponse(null, 'Organization deleted successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Delete organization failed', error, {
      operation: 'delete_organization',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

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
