import { and, desc, eq } from 'drizzle-orm';
import { chart_definitions, db, user_chart_favorites } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Chart Favorites Service with RBAC
 * Manages user chart bookmarks and favorites with automatic permission checking
 */

export interface FavoriteChart {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | null;
  chart_type: string;
  favorited_at: Date | null;
  is_active: boolean | null;
}

export interface FavoritesListResponse {
  favorites: FavoriteChart[];
  metadata: {
    total_count: number;
    user_id: string;
    generatedAt: string;
  };
}

/**
 * RBAC Favorites Service
 * Provides secure chart favorites management with automatic permission checking
 */
export class RBACFavoritesService extends BaseRBACService {
  /**
   * Get user's favorite charts
   */
  async getUserFavorites(): Promise<FavoritesListResponse> {
    const startTime = Date.now();

    // Check permissions
    this.requirePermission('analytics:read:all', undefined);

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
          eq(user_chart_favorites.user_id, this.userContext.user_id),
          eq(chart_definitions.is_active, true)
        )
      )
      .orderBy(desc(user_chart_favorites.favorited_at));

    log.info('User favorites list retrieved', {
      count: favorites.length,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return {
      favorites,
      metadata: {
        total_count: favorites.length,
        user_id: this.userContext.user_id,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Add chart to user's favorites
   */
  async addFavorite(chartDefinitionId: string): Promise<void> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all', undefined);

    // Check if chart exists and is active
    const [chart] = await db
      .select({ chart_definition_id: chart_definitions.chart_definition_id })
      .from(chart_definitions)
      .where(
        and(
          eq(chart_definitions.chart_definition_id, chartDefinitionId),
          eq(chart_definitions.is_active, true)
        )
      );

    if (!chart) {
      throw new NotFoundError('Chart definition not found or inactive');
    }

    // Check if already favorited
    const [existing] = await db
      .select()
      .from(user_chart_favorites)
      .where(
        and(
          eq(user_chart_favorites.user_id, this.userContext.user_id),
          eq(user_chart_favorites.chart_definition_id, chartDefinitionId)
        )
      );

    if (existing) {
      throw new ConflictError('Chart is already in favorites');
    }

    // Add to favorites
    await db.insert(user_chart_favorites).values({
      user_id: this.userContext.user_id,
      chart_definition_id: chartDefinitionId,
    });

    log.info('Chart added to favorites', {
      chartId: chartDefinitionId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Remove chart from user's favorites
   */
  async removeFavorite(chartDefinitionId: string): Promise<void> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all', undefined);

    // Remove from favorites
    await db
      .delete(user_chart_favorites)
      .where(
        and(
          eq(user_chart_favorites.user_id, this.userContext.user_id),
          eq(user_chart_favorites.chart_definition_id, chartDefinitionId)
        )
      );

    log.info('Chart removed from favorites', {
      chartId: chartDefinitionId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Factory function to create RBAC Favorites Service
 */
export function createRBACFavoritesService(userContext: UserContext): RBACFavoritesService {
  return new RBACFavoritesService(userContext);
}
