import { NextRequest } from 'next/server';
import { db, user_chart_favorites, chart_definitions } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { favoriteCreateSchema, favoriteDeleteSchema } from '@/lib/validations/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Chart Favorites API
 * Manages user chart bookmarks and favorites
 */

// GET - List user's favorite charts
const getFavoritesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('User favorites list request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Fetch user's favorite charts with chart details
    const favorites = await db
      .select({
        chart_definition_id: user_chart_favorites.chart_definition_id,
        chart_name: chart_definitions.chart_name,
        chart_description: chart_definitions.chart_description,
        chart_type: chart_definitions.chart_type,
        favorited_at: user_chart_favorites.favorited_at,
        is_active: chart_definitions.is_active,
      })
      .from(user_chart_favorites)
      .innerJoin(chart_definitions, eq(user_chart_favorites.chart_definition_id, chart_definitions.chart_definition_id))
      .where(
        and(
          eq(user_chart_favorites.user_id, userContext.user_id),
          eq(chart_definitions.is_active, true)
        )
      )
      .orderBy(desc(user_chart_favorites.favorited_at));

    logDBOperation(logger, 'user_favorites_list', 'user_chart_favorites', startTime, favorites.length);

    return createSuccessResponse({
      favorites: favorites,
      metadata: {
        total_count: favorites.length,
        user_id: userContext.user_id,
        generatedAt: new Date().toISOString()
      }
    }, 'User favorites retrieved successfully');
    
  } catch (error) {
    logger.error('User favorites list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Add chart to favorites
const addFavoriteHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Add chart to favorites request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, favoriteCreateSchema);

    // Check if chart exists and is active
    const [chart] = await db
      .select({ chart_definition_id: chart_definitions.chart_definition_id })
      .from(chart_definitions)
      .where(
        and(
          eq(chart_definitions.chart_definition_id, validatedData.chart_definition_id),
          eq(chart_definitions.is_active, true)
        )
      );

    if (!chart) {
      return createErrorResponse('Chart definition not found or inactive', 404);
    }

    // Check if already favorited
    const [existing] = await db
      .select()
      .from(user_chart_favorites)
      .where(
        and(
          eq(user_chart_favorites.user_id, userContext.user_id),
          eq(user_chart_favorites.chart_definition_id, validatedData.chart_definition_id)
        )
      );

    if (existing) {
      return createErrorResponse('Chart is already in favorites', 409);
    }

    // Add to favorites
    await db
      .insert(user_chart_favorites)
      .values({
        user_id: userContext.user_id,
        chart_definition_id: validatedData.chart_definition_id,
      });

    logDBOperation(logger, 'chart_favorite_add', 'user_chart_favorites', startTime, 1);

    logger.info('Chart added to favorites successfully', {
      chartId: validatedData.chart_definition_id,
      userId: userContext.user_id
    });

    return createSuccessResponse({
      message: 'Chart added to favorites successfully'
    }, 'Chart favorited successfully');
    
  } catch (error) {
    logger.error('Add chart to favorites error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    return createErrorResponse(errorMessage, 500, request);
  }
};

// DELETE - Remove chart from favorites
const removeFavoriteHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, favoriteDeleteSchema);

    // Remove from favorites
    const result = await db
      .delete(user_chart_favorites)
      .where(
        and(
          eq(user_chart_favorites.user_id, userContext.user_id),
          eq(user_chart_favorites.chart_definition_id, validatedData.chart_definition_id)
        )
      );

    logDBOperation(logger, 'chart_favorite_remove', 'user_chart_favorites', startTime, 1);

    return createSuccessResponse({
      message: 'Chart removed from favorites successfully'
    }, 'Chart unfavorited successfully');
    
  } catch (error) {
    logger.error('Remove chart from favorites error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    return createErrorResponse(errorMessage, 500, request);
  }
};

// Route handlers
export const GET = rbacRoute(getFavoritesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const POST = rbacRoute(
  addFavoriteHandler,
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);

export const DELETE = rbacRoute(
  removeFavoriteHandler,
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);
