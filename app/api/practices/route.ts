import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { log } from '@/lib/logger';
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

    log.info('List practices request initiated', {
      requestingUserId: userContext.user_id,
      filters: { status: query.status, template_id: query.template_id },
      pagination,
      sort,
    });

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practices with automatic RBAC filtering
    const [practicesData, totalCount] = await Promise.all([
      practicesService.getPractices({
        status: query.status,
        template_id: query.template_id,
        limit: pagination.limit,
        offset: pagination.offset,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      }),
      practicesService.getPracticeCount({
        status: query.status,
        template_id: query.template_id,
      }),
    ]);

    log.info('List practices completed successfully', {
      count: practicesData.length,
      total: totalCount,
      duration: Date.now() - startTime,
    });

    return createPaginatedResponse(practicesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount,
    });
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('List practices failed', error, {
      requestingUserId: userContext.user_id,
      duration: Date.now() - startTime,
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, practiceCreateSchema);

    log.info('Create practice request initiated', {
      requestingUserId: userContext.user_id,
      domain: validatedData.domain,
    });

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Create practice with automatic RBAC checking
    const newPractice = await practicesService.createPractice({
      name: validatedData.name,
      domain: validatedData.domain,
      template_id: validatedData.template_id,
      owner_user_id: validatedData.owner_user_id,
    });

    log.info('Practice created successfully', {
      practiceId: newPractice.id,
      domain: newPractice.domain,
      duration: Date.now() - startTime,
    });

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
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Create practice failed', error, {
      requestingUserId: userContext.user_id,
      duration: Date.now() - startTime,
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
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
