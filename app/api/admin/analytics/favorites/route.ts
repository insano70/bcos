import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { chart_definitions, db, user_chart_favorites } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { favoriteCreateSchema, favoriteDeleteSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Chart Favorites API
 * Manages user chart bookmarks and favorites
 */

// GET - List user's favorite charts
const getFavoritesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('User favorites list request initiated', {
    requestingUserId: userContext.user_id,
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
      .innerJoin(
        chart_definitions,
        eq(user_chart_favorites.chart_definition_id, chart_definitions.chart_definition_id)
      )
      .where(
        and(
          eq(user_chart_favorites.user_id, userContext.user_id),
          eq(chart_definitions.is_active, true)
        )
      )
      .orderBy(desc(user_chart_favorites.favorited_at));

    log.db('SELECT', 'user_chart_favorites', Date.now() - startTime, {
      rowCount: favorites.length,
    });

    return createSuccessResponse(
      {
        favorites: favorites,
        metadata: {
          total_count: favorites.length,
          user_id: userContext.user_id,
          generatedAt: new Date().toISOString(),
        },
      },
      'User favorites retrieved successfully'
    );
  } catch (error) {
    log.error('User favorites list error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Add chart to favorites
const addFavoriteHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Add chart to favorites request initiated', {
    requestingUserId: userContext.user_id,
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
    await db.insert(user_chart_favorites).values({
      user_id: userContext.user_id,
      chart_definition_id: validatedData.chart_definition_id,
    });

    log.db('INSERT', 'user_chart_favorites', Date.now() - startTime, { rowCount: 1 });

    log.info('Chart added to favorites successfully', {
      chartId: validatedData.chart_definition_id,
      userId: userContext.user_id,
    });

    return createSuccessResponse(
      {
        message: 'Chart added to favorites successfully',
      },
      'Chart favorited successfully'
    );
  } catch (error) {
    log.error('Add chart to favorites error', error, {
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

// DELETE - Remove chart from favorites
const removeFavoriteHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, favoriteDeleteSchema);

    // Remove from favorites
    const _result = await db
      .delete(user_chart_favorites)
      .where(
        and(
          eq(user_chart_favorites.user_id, userContext.user_id),
          eq(user_chart_favorites.chart_definition_id, validatedData.chart_definition_id)
        )
      );

    log.db('DELETE', 'user_chart_favorites', Date.now() - startTime, { rowCount: 1 });

    return createSuccessResponse(
      {
        message: 'Chart removed from favorites successfully',
      },
      'Chart unfavorited successfully'
    );
  } catch (error) {
    log.error('Remove chart from favorites error', error, {
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
export const GET = rbacRoute(getFavoritesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

export const POST = rbacRoute(addFavoriteHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(removeFavoriteHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
