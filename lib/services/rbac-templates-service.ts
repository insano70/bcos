import { and, asc, desc, eq, isNull, like, sql } from 'drizzle-orm';
import { db, templates } from '@/lib/db';
import { ConflictError, InternalServerError, NotFoundError } from '@/lib/errors/api-errors';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Templates Service with RBAC
 * Provides practice template management with automatic permission checking
 */

export interface TemplateQueryOptions {
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortField?: 'name' | 'slug' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

export interface TemplateData {
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  preview_image_url: string | null;
  is_active: boolean | null;
  created_at: Date | null;
}

export interface PaginatedTemplates {
  templates: TemplateData[];
  total: number;
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

/**
 * RBAC Templates Service
 * Provides secure template management with automatic permission checking
 */
export class RBACTemplatesService extends BaseRBACService {
  /**
   * Get templates list with filtering and pagination
   */
  async getTemplates(options: TemplateQueryOptions = {}): Promise<PaginatedTemplates> {
    const startTime = Date.now();

    // Check permissions - templates can be read by organization members
    this.requirePermission('templates:read:organization', undefined);

    // Build where conditions
    const whereConditions = [isNull(templates.deleted_at)];

    if (options.is_active !== undefined) {
      whereConditions.push(eq(templates.is_active, options.is_active));
    }

    if (options.search) {
      whereConditions.push(
        like(templates.name, `%${options.search}%`),
        like(templates.description, `%${options.search}%`)
      );
    }

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(templates)
      .where(and(...whereConditions));

    const totalCount = countResult?.count || 0;

    // Determine sort order
    const sortField = options.sortField || 'name';
    const sortOrder = options.sortOrder || 'asc';

    const sortColumn =
      sortField === 'slug'
        ? templates.slug
        : sortField === 'created_at'
          ? templates.created_at
          : templates.name;

    // Get paginated data
    const templatesData = await db
      .select({
        template_id: templates.template_id,
        name: templates.name,
        slug: templates.slug,
        description: templates.description,
        preview_image_url: templates.preview_image_url,
        is_active: templates.is_active,
        created_at: templates.created_at,
      })
      .from(templates)
      .where(and(...whereConditions))
      .orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(options.limit || 100)
      .offset(options.offset || 0);

    log.info('Templates list retrieved', {
      count: templatesData.length,
      total: totalCount,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return {
      templates: templatesData,
      total: totalCount,
    };
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string): Promise<TemplateData | null> {
    const startTime = Date.now();

    this.requirePermission('templates:read:organization', undefined);

    const [template] = await db
      .select({
        template_id: templates.template_id,
        name: templates.name,
        slug: templates.slug,
        description: templates.description,
        preview_image_url: templates.preview_image_url,
        is_active: templates.is_active,
        created_at: templates.created_at,
      })
      .from(templates)
      .where(and(eq(templates.template_id, templateId), isNull(templates.deleted_at)));

    log.info('Template retrieved by ID', {
      templateId,
      found: !!template,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return template || null;
  }

  /**
   * Get template by slug
   */
  async getTemplateBySlug(slug: string): Promise<TemplateData | null> {
    const startTime = Date.now();

    this.requirePermission('templates:read:organization', undefined);

    const [template] = await db
      .select({
        template_id: templates.template_id,
        name: templates.name,
        slug: templates.slug,
        description: templates.description,
        preview_image_url: templates.preview_image_url,
        is_active: templates.is_active,
        created_at: templates.created_at,
      })
      .from(templates)
      .where(and(eq(templates.slug, slug), isNull(templates.deleted_at)));

    log.info('Template retrieved by slug', {
      slug,
      found: !!template,
      duration: Date.now() - startTime,
      userId: this.userContext.user_id,
    });

    return template || null;
  }

  /**
   * Create new template
   */
  async createTemplate(data: CreateTemplateData): Promise<TemplateData> {
    const startTime = Date.now();

    // Check permissions - only admins can create templates
    this.requirePermission('templates:manage:all', undefined);

    // Check if slug already exists
    const existing = await this.getTemplateBySlug(data.slug);
    if (existing) {
      throw new ConflictError('Template with this slug already exists');
    }

    const [newTemplate] = await db
      .insert(templates)
      .values({
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        preview_image_url: data.preview_image_url || null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      })
      .returning();

    if (!newTemplate) {
      throw new InternalServerError('Failed to create template');
    }

    log.info('Template created', {
      templateId: newTemplate.template_id,
      name: newTemplate.name,
      slug: newTemplate.slug,
      createdBy: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    return newTemplate;
  }

  /**
   * Update template
   */
  async updateTemplate(templateId: string, data: UpdateTemplateData): Promise<TemplateData> {
    const startTime = Date.now();

    // Check permissions - only admins can update templates
    this.requirePermission('templates:manage:all', undefined);

    // Check if template exists
    const existing = await this.getTemplateById(templateId);
    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // If updating slug, check it's not already taken
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await this.getTemplateBySlug(data.slug);
      if (slugExists) {
        throw new ConflictError('Template with this slug already exists');
      }
    }

    const [updatedTemplate] = await db
      .update(templates)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.slug && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.preview_image_url !== undefined && { preview_image_url: data.preview_image_url }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        updated_at: new Date(),
      })
      .where(eq(templates.template_id, templateId))
      .returning();

    if (!updatedTemplate) {
      throw new InternalServerError('Failed to update template');
    }

    log.info('Template updated', {
      templateId,
      updatedBy: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    return updatedTemplate;
  }

  /**
   * Delete template (soft delete)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const startTime = Date.now();

    // Check permissions - only admins can delete templates
    this.requirePermission('templates:manage:all', undefined);

    // Check if template exists
    const existing = await this.getTemplateById(templateId);
    if (!existing) {
      throw new NotFoundError('Template not found');
    }

    // Soft delete
    await db
      .update(templates)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(templates.template_id, templateId));

    log.info('Template deleted', {
      templateId,
      deletedBy: this.userContext.user_id,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Factory function to create RBAC Templates Service
 */
export function createRBACTemplatesService(userContext: UserContext): RBACTemplatesService {
  return new RBACTemplatesService(userContext);
}
