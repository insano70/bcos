import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { chart_categories, db } from '@/lib/db';
import { log } from '@/lib/logger';
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
    // Fetch all categories with hierarchy
    const categories = await db
      .select()
      .from(chart_categories)
      .orderBy(chart_categories.category_name);

    log.db('SELECT', 'chart_categories', Date.now() - startTime, { rowCount: categories.length });

    return createSuccessResponse(
      {
        categories: categories,
        metadata: {
          total_count: categories.length,
          generatedAt: new Date().toISOString(),
        },
      },
      'Chart categories retrieved successfully'
    );
  } catch (error) {
    log.error('Chart categories list error', error, {
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

// POST - Create new chart category
const createCategoryHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Chart category creation request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, chartCategoryCreateSchema);

    // Create new category
    const [newCategory] = await db
      .insert(chart_categories)
      .values({
        category_name: validatedData.category_name,
        category_description: validatedData.category_description,
        parent_category_id: validatedData.parent_category_id,
      })
      .returning();

    if (!newCategory) {
      return createErrorResponse('Failed to create category', 500, request);
    }

    log.db('INSERT', 'chart_categories', Date.now() - startTime, { rowCount: 1 });

    log.info('Chart category created successfully', {
      categoryId: newCategory.chart_category_id,
      categoryName: newCategory.category_name,
      createdBy: userContext.user_id,
    });

    return createSuccessResponse(
      {
        category: newCategory,
      },
      'Chart category created successfully'
    );
  } catch (error) {
    log.error('Chart category creation error', error, {
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
