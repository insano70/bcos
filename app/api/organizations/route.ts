import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { organizationCreateSchema, organizationQuerySchema } from '@/lib/validations/organization';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACOrganizationsService } from '@/lib/services/rbac-organizations-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const getOrganizationsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List organizations request initiated', {
    operation: 'list_organizations',
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    const { searchParams } = new URL(request.url);

    const validationStart = Date.now();
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'created_at']);
    const query = validateQuery(searchParams, organizationQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Request parameters parsed', {
      pagination,
      sort,
      filters: {
        is_active: query.is_active,
        search: query.search,
      },
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const organizationService = createRBACOrganizationsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get organizations with automatic permission-based filtering (no limit - fetch all)
    const organizationsStart = Date.now();
    const organizations = await organizationService.getOrganizations({
      search: query.search,
      is_active: query.is_active,
      parent_organization_id: query.parent_organization_id,
    });
    log.db('SELECT', 'organizations', Date.now() - organizationsStart, { rowCount: organizations.length });

    // Get total count
    const countStart = Date.now();
    const totalCount = organizations.length; // Service already filters, so count is length
    log.db('SELECT', 'organizations_count', Date.now() - countStart, { rowCount: 1 });

    const responseData = organizations.map((organization) => ({
      id: organization.organization_id,
      name: organization.name,
      slug: organization.slug,
      parent_organization_id: organization.parent_organization_id,
      is_active: organization.is_active,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      member_count: organization.member_count,
      children_count: organization.children_count,
    }));

    const totalDuration = Date.now() - startTime;
    log.info('Organizations list retrieved successfully', {
      organizationsReturned: organizations.length,
      totalCount,
      page: pagination.page,
      totalDuration,
    });

    return createPaginatedResponse(responseData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Organizations list request failed', error, {
      requestingUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getOrganizationsHandler, {
  permission: ['organizations:read:own', 'organizations:read:organization', 'organizations:read:all'],
  extractResourceId: extractors.organizationResourceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

const createOrganizationHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Organization creation request initiated', {
    createdByUserId: userContext.user_id,
    organizationId: userContext.current_organization_id,
  });

  try {
    const validationStart = Date.now();
    const validatedData = await validateRequest(request, organizationCreateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    // Create RBAC service
    const serviceStart = Date.now();
    const organizationService = createRBACOrganizationsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create organization with automatic permission checking
    const organizationCreationStart = Date.now();
    const newOrganization = await organizationService.createOrganization({
      name: validatedData.name,
      slug: validatedData.slug,
      parent_organization_id: validatedData.parent_organization_id,
      is_active: validatedData.is_active ?? true,
    });
    log.db('INSERT', 'organizations', Date.now() - organizationCreationStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Organization creation completed successfully', {
      newOrganizationId: newOrganization.organization_id,
      totalDuration,
    });

    return createSuccessResponse(
      {
        id: newOrganization.organization_id,
        name: newOrganization.name,
        slug: newOrganization.slug,
        parent_organization_id: newOrganization.parent_organization_id,
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
      createdByUserId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      totalDuration,
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
