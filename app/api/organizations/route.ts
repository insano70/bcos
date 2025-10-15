import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACOrganizationsService } from '@/lib/services/organizations';
import type { UserContext } from '@/lib/types/rbac';
import { organizationCreateSchema, organizationQuerySchema } from '@/lib/validations/organization';
import { rbacCache } from '@/lib/cache';

const getOrganizationsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'created_at']);
    const query = validateQuery(searchParams, organizationQuerySchema);

    // Create RBAC service
    const organizationService = createRBACOrganizationsService(userContext);

    // Get organizations with automatic permission-based filtering (no limit - fetch all)
    const organizations = await organizationService.getOrganizations({
      search: query.search,
      is_active: query.is_active,
      parent_organization_id: query.parent_organization_id,
    });

    const totalCount = organizations.length; // Service already filters, so count is length

    const responseData = organizations.map((organization) => ({
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
    }));

    // Count active vs inactive organizations
    const activeCount = organizations.filter((org) => org.is_active).length;
    const inactiveCount = totalCount - activeCount;

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      is_active: query.is_active,
      search: query.search,
      parent_organization_id: query.parent_organization_id,
    });

    // Enriched success log with RBAC context and filter details
    log.info(`organizations list query completed - returned ${totalCount} organizations`, {
      operation: 'list_organizations',
      resourceType: 'organizations',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      isSuperAdmin: userContext.is_super_admin,
      filters,
      filterCount: Object.values(filters).filter((v) => v !== null && v !== undefined).length,
      results: {
        returned: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        page: pagination.page,
        pageSize: pagination.limit,
      },
      sort: {
        field: sort.sortBy,
        direction: sort.sortOrder,
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > 1000,
      component: 'business-logic',
    });

    return createPaginatedResponse(responseData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Organizations list query failed', error, {
      operation: 'list_organizations',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: totalDuration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getOrganizationsHandler, {
  permission: [
    'organizations:read:own',
    'organizations:read:organization',
    'organizations:read:all',
  ],
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

const createOrganizationHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, organizationCreateSchema);

    // Create RBAC service
    const organizationService = createRBACOrganizationsService(userContext);

    // Create organization with automatic permission checking
    const newOrganization = await organizationService.createOrganization({
      name: validatedData.name,
      slug: validatedData.slug,
      parent_organization_id: validatedData.parent_organization_id,
      practice_uids: validatedData.practice_uids || [], // Analytics security field
      is_active: validatedData.is_active ?? true,
    });

    // Invalidate organization hierarchy cache (new org added to tree)
    await rbacCache.invalidateOrganizationHierarchy();

    // Use CRUD template for organization creation
    const template = logTemplates.crud.create('organization', {
      resourceId: newOrganization.organization_id,
      resourceName: newOrganization.name,
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      metadata: {
        slug: newOrganization.slug,
        isActive: newOrganization.is_active,
        ...(newOrganization.parent_organization_id && {
          parentOrganizationId: newOrganization.parent_organization_id,
        }),
        isChildOrganization: !!newOrganization.parent_organization_id,
        createdBy: userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: newOrganization.organization_id,
        name: newOrganization.name,
        slug: newOrganization.slug,
        parent_organization_id: newOrganization.parent_organization_id,
        practice_uids: newOrganization.practice_uids || [], // Analytics security field
        is_active: newOrganization.is_active,
        created_at: newOrganization.created_at,
        member_count: newOrganization.member_count,
        children_count: newOrganization.children_count,
      },
      'Organization created successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Organization creation failed', error, {
      operation: 'create_organization',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: totalDuration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const POST = rbacRoute(createOrganizationHandler, {
  permission: 'organizations:create:all',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
