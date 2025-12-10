import type { InferSelectModel } from 'drizzle-orm';

import { chart_categories } from '@/lib/db';
import { BaseCrudService, type CrudServiceConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Chart Categories Service with RBAC
 * Manages chart categories for organizing charts with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 */

// Entity type derived from Drizzle schema
export type ChartCategory = InferSelectModel<typeof chart_categories>;

export interface CreateCategoryData {
  category_name: string;
  category_description?: string;
  parent_category_id?: number;
}

export interface UpdateCategoryData {
  category_name?: string;
  category_description?: string | null;
  parent_category_id?: number | null;
}

// Legacy response format maintained for backward compatibility
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
export class RBACCategoriesService extends BaseCrudService<
  typeof chart_categories,
  ChartCategory,
  CreateCategoryData,
  UpdateCategoryData
> {
  protected config: CrudServiceConfig<
    typeof chart_categories,
    ChartCategory,
    CreateCategoryData,
    UpdateCategoryData
  > = {
    table: chart_categories,
    resourceName: 'chart-categories',
    displayName: 'chart category',
    primaryKeyName: 'chart_category_id',
    // No deletedAtColumnName - this table uses hard delete
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'analytics:read:all',
      create: 'analytics:read:all',
      update: 'analytics:read:all',
      delete: 'analytics:read:all',
    },
    // No organization scoping - categories are global
    transformers: {
      toCreateValues: (data) => ({
        category_name: data.category_name,
        category_description: data.category_description ?? null,
        parent_category_id: data.parent_category_id ?? null,
      }),
    },
  };

  /**
   * Get all chart categories (legacy method maintained for backward compatibility)
   * @returns CategoriesListResponse with categories array and metadata
   */
  async getCategories(): Promise<CategoriesListResponse> {
    // Use the base getList with high limit to get all categories
    // Note: For truly large datasets, consider pagination
    const result = await this.getList({ limit: 1000 });

    // Sort by category_name (since getList doesn't support custom sorting yet)
    const sortedCategories = result.items.sort((a, b) =>
      a.category_name.localeCompare(b.category_name)
    );

    return {
      categories: sortedCategories,
      metadata: {
        total_count: result.total,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Create new chart category (legacy method wrapper)
   * @param data - Category creation data
   * @returns Created ChartCategory
   */
  async createCategory(data: CreateCategoryData): Promise<ChartCategory> {
    return this.create(data);
  }

  /**
   * Get category by ID (legacy method wrapper)
   * @param categoryId - Category ID to retrieve
   * @returns ChartCategory or null if not found
   */
  async getCategoryById(categoryId: number): Promise<ChartCategory | null> {
    return this.getById(categoryId);
  }

  /**
   * Update category (new method provided by BaseCrudService)
   * @param categoryId - Category ID to update
   * @param data - Update data
   * @returns Updated ChartCategory
   */
  async updateCategory(categoryId: number, data: UpdateCategoryData): Promise<ChartCategory> {
    return this.update(categoryId, data);
  }

  /**
   * Delete category (new method provided by BaseCrudService)
   * Note: This is a hard delete as the table has no deleted_at column
   * @param categoryId - Category ID to delete
   */
  async deleteCategory(categoryId: number): Promise<void> {
    return this.delete(categoryId);
  }
}

/**
 * Factory function to create RBAC Categories Service
 */
export function createRBACCategoriesService(userContext: UserContext): RBACCategoriesService {
  return new RBACCategoriesService(userContext);
}
