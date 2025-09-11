import { NextRequest } from 'next/server';
import { db, templates } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql, like } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { templateQuerySchema } from '@/lib/validations/template';
import { requireAuth } from '@/lib/api/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    await requireAuth(request) // Require authentication
    
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const sort = getSortParams(searchParams, ['name', 'slug', 'created_at'])
    const query = validateQuery(searchParams, templateQuerySchema)
    
    // Build where conditions
    const whereConditions = [isNull(templates.deleted_at)]
    if (query.is_active !== undefined) {
      whereConditions.push(eq(templates.is_active, query.is_active))
    }
    if (query.search) {
      whereConditions.push(
        like(templates.name, `%${query.search}%`),
        like(templates.description, `%${query.search}%`)
      )
    }
    
    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(templates)
      .where(and(...whereConditions))
    
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
      .offset(pagination.offset)

    return createPaginatedResponse(templatesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: countResult?.count || 0
    })
    
  } catch (error) {
    console.error('Error fetching templates:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
