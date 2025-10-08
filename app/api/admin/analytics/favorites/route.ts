import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { getErrorStatusCode } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';
import { createRBACFavoritesService } from '@/lib/services/rbac-favorites-service';
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
    // Use favorites service with RBAC
    const favoritesService = createRBACFavoritesService(userContext);
    const result = await favoritesService.getUserFavorites();

    log.info('User favorites list retrieved successfully', {
      count: result.favorites.length,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(result, 'User favorites retrieved successfully');
  } catch (error) {
    log.error('User favorites list error', error, {
      duration: Date.now() - startTime,
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

    // Use favorites service with RBAC
    const favoritesService = createRBACFavoritesService(userContext);
    await favoritesService.addFavorite(validatedData.chart_definition_id);

    return createSuccessResponse(
      {
        message: 'Chart added to favorites successfully',
      },
      'Chart favorited successfully'
    );
  } catch (error) {
    log.error('Add chart to favorites error', error, {
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

// DELETE - Remove chart from favorites
const removeFavoriteHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Remove chart from favorites request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, favoriteDeleteSchema);

    // Use favorites service with RBAC
    const favoritesService = createRBACFavoritesService(userContext);
    await favoritesService.removeFavorite(validatedData.chart_definition_id);

    return createSuccessResponse(
      {
        message: 'Chart removed from favorites successfully',
      },
      'Chart unfavorited successfully'
    );
  } catch (error) {
    log.error('Remove chart from favorites error', error, {
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
