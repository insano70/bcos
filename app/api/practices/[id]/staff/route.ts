import { NextRequest } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
import { eq, isNull, and, asc, desc, sql, like } from 'drizzle-orm';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { staffCreateSchema, staffQuerySchema, staffParamsSchema } from '@/lib/validations/staff';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac'
import { log } from '@/lib/logger';
import { parseSpecialties, parseEducation } from '@/lib/utils/safe-json';

const getPracticeStaffHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema))
    const { searchParams } = new URL(request.url)
    const pagination = getPagination(searchParams)
    // Default to display_order for proper staff ordering and reorder functionality
    const sortBy = searchParams.get('sort') || 'display_order'
    const sortOrder = searchParams.get('order') === 'desc' ? 'desc' : 'asc'
    const allowedFields = ['name', 'title', 'display_order', 'created_at']
    
    if (!allowedFields.includes(sortBy)) {
      throw new Error(`Invalid sort field. Allowed: ${allowedFields.join(', ')}`)
    }
    
    const sort = { sortBy, sortOrder }
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

    // Get paginated data - default to display_order for proper reordering
    const orderByColumn = sort.sortBy === 'name' ? staff_members.name :
                         sort.sortBy === 'title' ? staff_members.title :
                         sort.sortBy === 'created_at' ? staff_members.created_at :
                         staff_members.display_order; // Default to display_order
    
    const staff = await db
      .select()
      .from(staff_members)
      .where(and(...whereConditions))
      .orderBy(sort.sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn))
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
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';

    log.error('Error fetching staff members', error, {
      practiceId,
      operation: 'fetchStaffMembers'
    })

    const clientErrorMessage = process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request)
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
      throw NotFoundError('Practice');
    }

    // RBAC: Check if user can manage staff for this practice
    // Super admins can manage all, practice owners can manage their own practice staff
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to manage staff for this practice')
    }

    // Get the next display_order by finding the max current order
    const [maxOrderResult] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${staff_members.display_order}), -1)` })
      .from(staff_members)
      .where(and(
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ));
    
    const nextDisplayOrder = (maxOrderResult?.maxOrder ?? -1) + 1;

    // Prepare staff data, stringify JSON fields
    const staffData = {
      ...validatedData,
      practice_id: practiceId,
      display_order: validatedData.display_order ?? nextDisplayOrder, // Use provided order or next available
      specialties: validatedData.specialties ? JSON.stringify(validatedData.specialties) : null,
      education: validatedData.education ? JSON.stringify(validatedData.education) : null,
    };

    const [newStaff] = await db
      .insert(staff_members)
      .values(staffData)
      .returning();

    if (!newStaff) {
      throw new Error('Failed to create staff member');
    }

    // Parse JSON fields for response
    const parsedStaffMember = {
      ...newStaff,
      specialties: parseSpecialties(newStaff.specialties),
      education: parseEducation(newStaff.education),
    };

    return createSuccessResponse(parsedStaffMember, 'Staff member created successfully');
  } catch (error) {
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';

    log.error('Error creating staff member', error, {
      practiceId,
      operation: 'createStaffMember'
    });

    const clientErrorMessage = process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
}

// Export with RBAC protection
export const GET = rbacRoute(
  getPracticeStaffHandler,
  {
    permission: ['practices:staff:manage:own', 'practices:manage:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

export const POST = rbacRoute(
  createPracticeStaffHandler,
  {
    permission: ['practices:staff:manage:own', 'practices:manage:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
