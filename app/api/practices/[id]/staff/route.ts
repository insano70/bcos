import { NextRequest, NextResponse } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql, like } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { staffCreateSchema, staffQuerySchema, staffParamsSchema } from '@/lib/validations/staff';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { practiceRoute, rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac'
import { logger } from '@/lib/logger';
import { parseSpecialties, parseEducation } from '@/lib/utils/safe-json';

const getPracticeStaffHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema))
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

    // RBAC: Check if user can access this practice's staff
    // Super admins can access all, practice owners can access their own practice staff
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to view staff for this practice')
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
      specialties: parseSpecialties(member.specialties),
      education: parseEducation(member.education),
    }))

    return createPaginatedResponse(parsedStaff, {
      page: pagination.page,
      limit: pagination.limit,
      total: countResult?.count || 0
    })
    
  } catch (error) {
    logger.error('Error fetching staff members', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      practiceId,
      operation: 'fetchStaffMembers'
    })
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

const createPracticeStaffHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema))
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

    // RBAC: Check if user can manage staff for this practice
    // Super admins can manage all, practice owners can manage their own practice staff
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to manage staff for this practice')
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
    logger.error('Error creating staff member', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      practiceId,
      operation: 'createStaffMember'
    });
    return NextResponse.json(
      { error: 'Failed to create staff member' },
      { status: 500 }
    );
  }
}

// Export with RBAC protection
export const GET = practiceRoute(
  ['practices:staff:manage:own', 'practices:manage:all'],
  getPracticeStaffHandler,
  { rateLimit: 'api' }
);

export const POST = practiceRoute(
  ['practices:staff:manage:own', 'practices:manage:all'],
  createPracticeStaffHandler,
  { rateLimit: 'api' }
);
