import { and, asc, desc, eq, isNull, like, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { validateQuery } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { db, templates } from '@/lib/db';
import type { UserContext } from '@/lib/types/rbac';
import { templateQuerySchema } from '@/lib/validations/template';

const getTemplatesHandler = async (request: NextRequest, _userContext: UserContext) => {
  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['name', 'slug', 'created_at']);
    const query = validateQuery(searchParams, templateQuerySchema);

    // Build where conditions
    const whereConditions = [isNull(templates.deleted_at)];
    if (query.is_active !== undefined) {
      whereConditions.push(eq(templates.is_active, query.is_active));
    }
    if (query.search) {
      whereConditions.push(
        like(templates.name, `%${query.search}%`),
        like(templates.description, `%${query.search}%`)
      );
    }

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(templates)
      .where(and(...whereConditions));

    // Get paginated data
    const templatesData = await db
      .select({
        id: templates.template_id,
        name: templates.name,
        slug: templates.slug,
        description: templates.description,
        preview_image_url: templates.preview_image_url,
        is_active: templates.is_active,
        created_at: templates.created_at,
      })
      .from(templates)
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(templates.name) : desc(templates.name))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return createPaginatedResponse(templatesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: countResult?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export with RBAC protection - templates can be read by organization members
export const GET = rbacRoute(getTemplatesHandler, {
  permission: 'templates:read:organization',
  rateLimit: 'api',
});
