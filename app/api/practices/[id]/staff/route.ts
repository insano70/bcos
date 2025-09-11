import { NextRequest, NextResponse } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql, like } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateRequest, validateParams, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { staffCreateSchema, staffQuerySchema, staffParamsSchema } from '@/lib/validations/staff';
import { practiceParamsSchema } from '@/lib/validations/practice';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    const sort = getSortParams(searchParams, ['name', 'title', 'display_order', 'created_at'])
    const query = validateQuery(searchParams, staffQuerySchema)

    // Verify practice exists
    const [practice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1)

    if (!practice) {
      throw NotFoundError('Practice')
    }

    // Build where conditions
    const whereConditions = [
      eq(staff_members.practice_id, practiceId),
      isNull(staff_members.deleted_at)
    ]
    if (query.is_active !== undefined) {
      whereConditions.push(eq(staff_members.is_active, query.is_active))
    }
    if (query.search) {
      whereConditions.push(
        like(staff_members.name, `%${query.search}%`),
        like(staff_members.title, `%${query.search}%`)
      )
    }

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(staff_members)
      .where(and(...whereConditions))

    // Get paginated data
    const staff = await db
      .select()
      .from(staff_members)
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(staff_members.name) : desc(staff_members.name))
      .limit(pagination.limit)
      .offset(pagination.offset)

    // Parse JSON fields safely
    const parsedStaff = staff.map(member => ({
      ...member,
      specialties: member.specialties ? JSON.parse(member.specialties) : [],
      education: member.education ? JSON.parse(member.education) : [],
    }))

    return createPaginatedResponse(parsedStaff, {
      page: pagination.page,
      limit: pagination.limit,
      total: countResult?.count || 0
    })
    
  } catch (error) {
    console.error('Error fetching staff members:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await applyRateLimit(request, 'api')
    
    const { id: practiceId } = validateParams(await params, practiceParamsSchema)
    const validatedData = await validateRequest(request, staffCreateSchema)

    // Verify practice exists
    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.practice_id, practiceId))
      .limit(1);

    if (!practice) {
      return NextResponse.json(
        { error: 'Practice not found' },
        { status: 404 }
      );
    }

    // Prepare staff data, stringify JSON fields
    const staffData = {
      ...validatedData,
      practice_id: practiceId,
      specialties: validatedData.specialties ? JSON.stringify(validatedData.specialties) : null,
      education: validatedData.education ? JSON.stringify(validatedData.education) : null,
    };

    const [newStaff] = await db
      .insert(staff_members)
      .values(staffData)
      .returning();

    return NextResponse.json(newStaff, { status: 201 });
  } catch (error) {
    console.error('Error creating staff member:', error);
    return NextResponse.json(
      { error: 'Failed to create staff member' },
      { status: 500 }
    );
  }
}
