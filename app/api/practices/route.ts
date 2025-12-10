import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { log, logTemplates, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceCreateSchema, practiceQuerySchema } from '@/lib/validations/practice';

/**
 * RBAC-Enhanced Practices API
 * Integrates practice management with organization-based RBAC
 */

const getPracticesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'domain', 'status', 'created_at']);
    const query = validateQuery(searchParams, practiceQuerySchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practices with automatic RBAC filtering
    const [practicesData, totalCount] = await Promise.all([
      practicesService.getPractices({
        status: query.status,
        template_id: query.template_id,
        limit: pagination.limit,
        offset: pagination.offset,
        sortBy: sort.sortBy as 'name' | 'domain' | 'status' | 'created_at',
        sortOrder: sort.sortOrder,
      }),
      practicesService.getPracticeCount({
        status: query.status,
        template_id: query.template_id,
      }),
    ]);

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      status: query.status,
      template_id: query.template_id,
    });

    // Count practices by status
    const statusCounts = practicesData.reduce(
      (acc, practice) => {
        const status = practice.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Enriched success log - consolidates multiple logs into 1 comprehensive log
    log.info(`practices list query completed - returned ${practicesData.length} of ${totalCount}`, {
      operation: 'list_practices',
      resourceType: 'practices',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      filters,
      filterCount: Object.values(filters).filter((v) => v !== null && v !== undefined).length,
      results: {
        returned: practicesData.length,
        total: totalCount,
        statusBreakdown: statusCounts,
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

    return createPaginatedResponse(practicesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    log.error('Practices list query failed', error, {
      operation: 'list_practices',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return handleRouteError(error, clientErrorMessage, request);
  }
};

const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, practiceCreateSchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Create practice with automatic RBAC checking
    const newPractice = await practicesService.createPractice({
      name: validatedData.name,
      domain: validatedData.domain,
      template_id: validatedData.template_id,
      owner_user_id: validatedData.owner_user_id,
    });

    // Enriched creation success log using template
    const template = logTemplates.crud.create('practice', {
      resourceId: newPractice.id,
      resourceName: newPractice.name,
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      metadata: {
        domain: newPractice.domain,
        templateId: newPractice.template_id,
        status: newPractice.status,
        ownerId: newPractice.owner_user_id,
        createdBy: userContext.user_id,
        isSuperAdmin: userContext.is_super_admin,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        id: newPractice.id,
        name: newPractice.name,
        domain: newPractice.domain,
        template_id: newPractice.template_id,
        status: newPractice.status,
        owner_user_id: newPractice.owner_user_id,
        created_at: newPractice.created_at,
        updated_at: newPractice.updated_at,
      },
      'Practice created successfully'
    );
  } catch (error) {
    log.error('Practice creation failed', error, {
      operation: 'create_practice',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return handleRouteError(error, clientErrorMessage, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getPracticesHandler, {
  permission: ['practices:read:own', 'practices:read:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

// Only super admins can create new practices
export const POST = rbacRoute(createPracticeHandler, {
  ...rbacConfigs.superAdmin,
  rateLimit: 'api',
});
