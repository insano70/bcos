import { NextRequest } from 'next/server';
import { db, chart_categories } from '@/lib/db';
import { eq, desc, isNull } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Chart Categories API
 * Manages chart categories for organizing charts
 */

// GET - List all chart categories
const getCategoriesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart categories list request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Fetch all categories with hierarchy
    const categories = await db
      .select()
      .from(chart_categories)
      .orderBy(chart_categories.category_name);

    logDBOperation(logger, 'chart_categories_list', 'chart_categories', startTime, categories.length);

    return createSuccessResponse({
      categories: categories,
      metadata: {
        total_count: categories.length,
        generatedAt: new Date().toISOString()
      }
    }, 'Chart categories retrieved successfully');
    
  } catch (error) {
    logger.error('Chart categories list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new chart category
const createCategoryHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart category creation request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    const body = await request.json();
    
    if (!body.category_name) {
      return createErrorResponse('Missing required field: category_name', 400);
    }

    // Create new category
    const [newCategory] = await db
      .insert(chart_categories)
      .values({
        category_name: body.category_name,
        category_description: body.category_description,
        parent_category_id: body.parent_category_id,
      })
      .returning();

    if (!newCategory) {
      return createErrorResponse('Failed to create category', 500, request);
    }

    logDBOperation(logger, 'chart_category_create', 'chart_categories', startTime, 1);

    logger.info('Chart category created successfully', {
      categoryId: newCategory.chart_category_id,
      categoryName: newCategory.category_name,
      createdBy: userContext.user_id
    });

    return createSuccessResponse({
      category: newCategory
    }, 'Chart category created successfully');
    
  } catch (error) {
    logger.error('Chart category creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Route handlers
export const GET = rbacRoute(getCategoriesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const POST = rbacRoute(createCategoryHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});
