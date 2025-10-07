import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { practiceCreateSchema, practiceQuerySchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';

/**
 * RBAC-Enhanced Practices API
 * Integrates practice management with organization-based RBAC
 */

const getPracticesHandler = async (request: NextRequest, userContext: UserContext) => {
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
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      }),
      practicesService.getPracticeCount({
        status: query.status,
        template_id: query.template_id,
      })
    ]);

    return createPaginatedResponse(practicesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount
    });

  } catch (error) {
    console.error('Error fetching practices:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

const createPracticeHandler = async (request: NextRequest, userContext: UserContext) => {
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

    return createSuccessResponse({
      id: newPractice.id,
      name: newPractice.name,
      domain: newPractice.domain,
      template_id: newPractice.template_id,
      status: newPractice.status,
      owner_user_id: newPractice.owner_user_id,
      created_at: newPractice.created_at,
      updated_at: newPractice.updated_at,
    }, 'Practice created successfully');

  } catch (error) {
    console.error('Error creating practice:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const GET = rbacRoute(
  getPracticesHandler,
  {
    permission: ['practices:read:own', 'practices:read:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

// Only super admins can create new practices
export const POST = rbacRoute(
  createPracticeHandler,
  {
    ...rbacConfigs.superAdmin,
    rateLimit: 'api'
  }
);