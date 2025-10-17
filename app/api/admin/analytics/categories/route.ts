import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { getErrorStatusCode } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';
import { createRBACCategoriesService } from '@/lib/services/rbac-categories-service';
import type { UserContext } from '@/lib/types/rbac';
import { chartCategoryCreateSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Chart Categories API
 * Manages chart categories for organizing charts
 */

// GET - List all chart categories
const getCategoriesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Chart categories list request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Use categories service with RBAC
    const categoriesService = createRBACCategoriesService(userContext);
    const result = await categoriesService.getCategories();

    log.info('Chart categories list retrieved successfully', {
      count: result.categories.length,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(result, 'Chart categories retrieved successfully');
  } catch (error) {
    log.error('Chart categories list error', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id,
    });

    const statusCode = getErrorStatusCode(error);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, statusCode, request);
  }
};

// POST - Create new chart category
const createCategoryHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Chart category creation request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, chartCategoryCreateSchema);

    // Use categories service with RBAC
    const categoriesService = createRBACCategoriesService(userContext);
    const newCategory = await categoriesService.createCategory({
      category_name: validatedData.category_name,
      ...(validatedData.category_description && {
        category_description: validatedData.category_description,
      }),
      ...(validatedData.parent_category_id && {
        parent_category_id: validatedData.parent_category_id,
      }),
    });

    return createSuccessResponse(
      {
        category: newCategory,
      },
      'Chart category created successfully'
    );
  } catch (error) {
    log.error('Chart category creation error', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

// Route handlers
export const GET = rbacRoute(getCategoriesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

export const POST = rbacRoute(createCategoryHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
