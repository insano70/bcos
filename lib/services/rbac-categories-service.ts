import { eq } from 'drizzle-orm';
import { chart_categories, db } from '@/lib/db';
import { InternalServerError } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Chart Categories Service with RBAC
 * Manages chart categories for organizing charts with automatic permission checking
 */

export interface ChartCategory {
  chart_category_id: number;
  category_name: string;
  category_description: string | null;
  parent_category_id: number | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface CreateCategoryData {
  category_name: string;
  category_description?: string;
  parent_category_id?: number;
}

export interface CategoriesListResponse {
  categories: ChartCategory[];
  metadata: {
    total_count: number;
    generatedAt: string;
  };
}

/**
 * RBAC Categories Service
 * Provides secure chart category management with automatic permission checking
 */
export class RBACCategoriesService extends BaseRBACService {
  /**
   * Get all chart categories
   */
  async getCategories(): Promise<CategoriesListResponse> {
    const startTime = Date.now();

    // Check permissions
    this.requirePermission('analytics:read:all', undefined);

    // Fetch all categories with hierarchy
    const categories = await db
      .select()
      .from(chart_categories)
      .orderBy(chart_categories.category_name);

    log.info('Chart categories list retrieved', {
      count: categories.length,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return {
      categories,
      metadata: {
        total_count: categories.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Create new chart category
   */
  async createCategory(data: CreateCategoryData): Promise<ChartCategory> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all', undefined);

    // Create new category
    const [newCategory] = await db
      .insert(chart_categories)
      .values({
        category_name: data.category_name,
        category_description: data.category_description || null,
        parent_category_id: data.parent_category_id || null,
      })
      .returning();

    if (!newCategory) {
      throw new InternalServerError('Failed to create category');
    }

    log.info('Chart category created', {
      categoryId: newCategory.chart_category_id,
      categoryName: newCategory.category_name,
      createdBy: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    return newCategory;
  }

  /**
   * Get category by ID
   */
  async getCategoryById(categoryId: number): Promise<ChartCategory | null> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all', undefined);

    const [category] = await db
      .select()
      .from(chart_categories)
      .where(eq(chart_categories.chart_category_id, categoryId));

    log.info('Chart category retrieved by ID', {
      categoryId,
      found: !!category,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return category || null;
  }
}

/**
 * Factory function to create RBAC Categories Service
 */
export function createRBACCategoriesService(userContext: UserContext): RBACCategoriesService {
  return new RBACCategoriesService(userContext);
}
