import { NextRequest } from 'next/server';
import { db, practices, templates, users } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, ValidationError, ConflictError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { practiceCreateSchema, practiceQuerySchema } from '@/lib/validations/practice';

export async function GET(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const sort = getSortParams(searchParams, ['name', 'domain', 'status', 'created_at'])
    const query = validateQuery(searchParams, practiceQuerySchema)
    
    // Build where conditions
    const whereConditions = [isNull(practices.deleted_at)]
    if (query.status) {
      whereConditions.push(eq(practices.status, query.status))
    }
    if (query.template_id) {
      whereConditions.push(eq(practices.template_id, query.template_id))
    }
    
    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(practices)
      .where(and(...whereConditions))
    
    // Get paginated data
    const practicesData = await db
      .select({
        id: practices.practice_id,
        name: practices.name,
        domain: practices.domain,
        status: practices.status,
        template_id: practices.template_id,
        template_name: templates.name,
        owner_email: users.email,
        created_at: practices.created_at,
      })
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .leftJoin(users, eq(practices.owner_user_id, users.user_id))
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(practices[sort.sortBy as keyof typeof practices]) : desc(practices[sort.sortBy as keyof typeof practices]))
      .limit(pagination.limit)
      .offset(pagination.offset)

    return createPaginatedResponse(practicesData, {
      page: pagination.page,
      limit: pagination.limit,
      total: count
    })
    
  } catch (error) {
    console.error('Error fetching practices:', error)
    return createErrorResponse(error, 500, request)
  }
}

export async function POST(request: NextRequest) {
  try {
    await applyRateLimit(request, 'api')
    
    const validatedData = await validateRequest(request, practiceCreateSchema)
    const { name, domain, template_id, owner_user_id } = validatedData

    // Check if domain already exists
    const existingPractice = await db
      .select()
      .from(practices)
      .where(eq(practices.domain, domain))
      .where(isNull(practices.deleted_at))
      .limit(1)

    if (existingPractice.length > 0) {
      throw ConflictError('A practice with this domain already exists')
    }

    // Verify template exists
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.template_id, template_id))
      .where(eq(templates.is_active, true))
      .limit(1)
    
    if (!template) {
      throw ValidationError(null, 'Invalid template selected')
    }

    const [newPractice] = await db
      .insert(practices)
      .values({
        name,
        domain,
        template_id,
        owner_user_id,
        status: 'pending',
      })
      .returning()

    return createSuccessResponse({
      id: newPractice.practice_id,
      name: newPractice.name,
      domain: newPractice.domain,
      template_id: newPractice.template_id,
      status: newPractice.status,
      owner_user_id: newPractice.owner_user_id,
      created_at: newPractice.created_at,
      updated_at: newPractice.updated_at,
    }, 'Practice created successfully')
    
  } catch (error) {
    console.error('Error creating practice:', error)
    return createErrorResponse(error, 500, request)
  }
}
