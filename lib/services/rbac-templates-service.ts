import type { InferSelectModel, SQL } from 'drizzle-orm';
import { eq, like } from 'drizzle-orm';

import { db, templates } from '@/lib/db';
import { ConflictError } from '@/lib/errors/api-errors';
import { BaseCrudService, type BaseQueryOptions, type CrudServiceConfig } from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Templates Service with RBAC
 * Provides practice template management with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure.
 */

// Entity type derived from Drizzle schema
export type Template = InferSelectModel<typeof templates>;

// Legacy type alias for backward compatibility
export interface TemplateData {
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  preview_image_url: string | null;
  is_active: boolean | null;
  created_at: Date | null;
}

export interface TemplateQueryOptions extends BaseQueryOptions {
  is_active?: boolean;
  sortField?: 'name' | 'slug' | 'created_at';
}

export interface CreateTemplateData {
  name: string;
  slug: string;
  description?: string;
  preview_image_url?: string;
  is_active?: boolean;
}

export interface UpdateTemplateData {
  name?: string;
  slug?: string;
  description?: string;
  preview_image_url?: string;
  is_active?: boolean;
}

// Legacy response format maintained for backward compatibility
export interface PaginatedTemplates {
  templates: TemplateData[];
  total: number;
}

/**
 * RBAC Templates Service
 * Provides secure template management with automatic permission checking
 */
export class RBACTemplatesService extends BaseCrudService<
  typeof templates,
  Template,
  CreateTemplateData,
  UpdateTemplateData,
  TemplateQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof templates,
    Template,
    CreateTemplateData,
    UpdateTemplateData,
    TemplateQueryOptions
  > = {
    table: templates,
    resourceName: 'templates',
    displayName: 'template',
    primaryKeyName: 'template_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: 'templates:read:organization',
      create: 'templates:manage:all',
      update: 'templates:manage:all',
      delete: 'templates:manage:all',
    },
    // No organization scoping - templates are global
    transformers: {
      toCreateValues: (data) => ({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        preview_image_url: data.preview_image_url ?? null,
        is_active: data.is_active ?? true,
      }),
    },
    validators: {
      beforeCreate: async (data) => {
        // Check if slug already exists
        const existing = await this.findBySlug(data.slug);
        if (existing) {
          throw new ConflictError('Template with this slug already exists');
        }
      },
      beforeUpdate: async (_id, data, existing) => {
        // If updating slug, check it's not already taken
        if (data.slug && data.slug !== existing.slug) {
          const slugExists = await this.findBySlug(data.slug);
          if (slugExists) {
            throw new ConflictError('Template with this slug already exists');
          }
        }
      },
    },
  };

  /**
   * Build search conditions for name and description fields.
   */
  protected buildSearchConditions(search: string): SQL[] {
    return [like(templates.name, `%${search}%`), like(templates.description, `%${search}%`)];
  }

  /**
   * Build custom filter conditions for is_active.
   */
  protected buildCustomConditions(options: TemplateQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.is_active !== undefined) {
      conditions.push(eq(templates.is_active, options.is_active));
    }

    return conditions;
  }

  /**
   * Find template by slug (internal helper, no permission check).
   * Used for uniqueness validation.
   */
  private async findBySlug(slug: string): Promise<Template | null> {
    const [result] = await db
      .select()
      .from(templates)
      .where(eq(templates.slug, slug));

    if (!result || result.deleted_at !== null) {
      return null;
    }

    return result;
  }

  // ===========================================================================
  // Legacy Methods - Maintained for backward compatibility
  // ===========================================================================

  /**
   * Get templates list with filtering and pagination (legacy method)
   * @deprecated Use getList() instead
   */
  async getTemplates(options: TemplateQueryOptions = {}): Promise<PaginatedTemplates> {
    const result = await this.getList(options);

    return {
      templates: result.items as TemplateData[],
      total: result.total,
    };
  }

  /**
   * Get template by ID (legacy method)
   * @deprecated Use getById() instead
   */
  async getTemplateById(templateId: string): Promise<TemplateData | null> {
    return this.getById(templateId) as Promise<TemplateData | null>;
  }

  /**
   * Get template by slug
   * Note: This is a custom method not provided by BaseCrudService
   */
  async getTemplateBySlug(slug: string): Promise<TemplateData | null> {
    // Check permission
    this.requirePermission('templates:read:organization', undefined);

    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.slug, slug));

    if (!template || template.deleted_at !== null) {
      return null;
    }

    return template as TemplateData;
  }

  /**
   * Create new template (legacy method)
   * @deprecated Use create() instead
   */
  async createTemplate(data: CreateTemplateData): Promise<TemplateData> {
    return this.create(data) as Promise<TemplateData>;
  }

  /**
   * Update template (legacy method)
   * @deprecated Use update() instead
   */
  async updateTemplate(templateId: string, data: UpdateTemplateData): Promise<TemplateData> {
    return this.update(templateId, data) as Promise<TemplateData>;
  }

  /**
   * Delete template (soft delete) (legacy method)
   * @deprecated Use delete() instead
   */
  async deleteTemplate(templateId: string): Promise<void> {
    return this.delete(templateId);
  }
}

/**
 * Factory function to create RBAC Templates Service
 */
export function createRBACTemplatesService(userContext: UserContext): RBACTemplatesService {
  return new RBACTemplatesService(userContext);
}
