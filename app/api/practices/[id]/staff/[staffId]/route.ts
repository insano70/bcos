import type { NextRequest } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { staffUpdateSchema } from '@/lib/validations/staff';
import { z } from 'zod';
import { practiceRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import { 
  createAPILogger, 
  logDBOperation, 
  logPerformanceMetric 
} from '@/lib/logger';
import { parseSpecialties, parseEducation } from '@/lib/utils/safe-json';

const getStaffMemberHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    // Extract route params - they come as a single object with both id and staffId
    const params = await extractRouteParams(args[0], z.object({
      id: z.string().uuid('Invalid practice ID'),
      staffId: z.string().uuid('Invalid staff ID')
    }));
    const practiceId = params.id;
    const staffId = params.staffId;
    
    logger.info('Get staff member request initiated', {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id
    });

    // Verify practice exists and user has access
    const practiceStart = Date.now();
    const [practice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'practices', practiceStart, 1);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    // RBAC: Check if user can access this practice's staff
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to view staff for this practice');
    }

    // Get staff member
    const staffStart = Date.now();
    const [staffMember] = await db
      .select()
      .from(staff_members)
      .where(and(
        eq(staff_members.staff_id, staffId),
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'staff_members', staffStart, 1);

    if (!staffMember) {
      throw NotFoundError('Staff member');
    }

    // Parse JSON fields safely
    const parsedStaffMember = {
      ...staffMember,
      specialties: parseSpecialties(staffMember.specialties),
      education: parseEducation(staffMember.education),
    };

    const totalDuration = Date.now() - startTime;
    logger.info('Staff member retrieved successfully', {
      staffId,
      practiceId,
      totalDuration
    });

    logPerformanceMetric(logger, 'staff_get_total', totalDuration, {
      success: true
    });

    return createSuccessResponse(parsedStaffMember);
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    const errorName = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown';
    const constructorName = error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error;
    
    logger.error('Staff member get request failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
      errorType: constructorName
    });

    logPerformanceMetric(logger, 'staff_get_total', totalDuration, {
      success: false,
      errorType: errorName
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

const updateStaffMemberHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    // Extract route params and validate request body
    const params = await extractRouteParams(args[0], z.object({
      id: z.string().uuid('Invalid practice ID'),
      staffId: z.string().uuid('Invalid staff ID')
    }));
    const practiceId = params.id;
    const staffId = params.staffId;
    const validatedData = await validateRequest(request, staffUpdateSchema);
    
    logger.info('Update staff member request initiated', {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id
    });

    // Verify practice exists and user has access
    const practiceStart = Date.now();
    const [practice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'practices', practiceStart, 1);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    // RBAC: Check if user can manage staff for this practice
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to manage staff for this practice');
    }

    // Verify staff member exists and belongs to this practice
    const staffStart = Date.now();
    const [existingStaff] = await db
      .select()
      .from(staff_members)
      .where(and(
        eq(staff_members.staff_id, staffId),
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'staff_members', staffStart, 1);

    if (!existingStaff) {
      throw NotFoundError('Staff member');
    }

    // Prepare update data, stringify JSON fields
    const updateData = {
      ...validatedData,
      specialties: validatedData.specialties ? JSON.stringify(validatedData.specialties) : undefined,
      education: validatedData.education ? JSON.stringify(validatedData.education) : undefined,
      updated_at: new Date(),
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });

    // Update staff member
    const updateStart = Date.now();
    const [updatedStaff] = await db
      .update(staff_members)
      .set(updateData)
      .where(eq(staff_members.staff_id, staffId))
      .returning();
    logDBOperation(logger, 'UPDATE', 'staff_members', updateStart, 1);

    if (!updatedStaff) {
      throw new Error('Failed to update staff member');
    }

    // Parse JSON fields for response
    const parsedStaffMember = {
      ...updatedStaff,
      specialties: parseSpecialties(updatedStaff.specialties),
      education: parseEducation(updatedStaff.education),
    };

    const totalDuration = Date.now() - startTime;
    logger.info('Staff member updated successfully', {
      staffId,
      practiceId,
      totalDuration
    });

    logPerformanceMetric(logger, 'staff_update_total', totalDuration, {
      success: true
    });

    return createSuccessResponse(parsedStaffMember, 'Staff member updated successfully');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    const errorName = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown';
    const constructorName = error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error;
    
    logger.error('Staff member update request failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
      errorType: constructorName
    });

    logPerformanceMetric(logger, 'staff_update_total', totalDuration, {
      success: false,
      errorType: errorName
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

const deleteStaffMemberHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  try {
    // Extract route params
    const params = await extractRouteParams(args[0], z.object({
      id: z.string().uuid('Invalid practice ID'),
      staffId: z.string().uuid('Invalid staff ID')
    }));
    const practiceId = params.id;
    const staffId = params.staffId;
    
    logger.info('Delete staff member request initiated', {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id
    });

    // Verify practice exists and user has access
    const practiceStart = Date.now();
    const [practice] = await db
      .select()
      .from(practices)
      .where(and(
        eq(practices.practice_id, practiceId),
        isNull(practices.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'practices', practiceStart, 1);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    // RBAC: Check if user can manage staff for this practice
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to manage staff for this practice');
    }

    // Verify staff member exists and belongs to this practice
    const staffStart = Date.now();
    const [existingStaff] = await db
      .select()
      .from(staff_members)
      .where(and(
        eq(staff_members.staff_id, staffId),
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ))
      .limit(1);
    logDBOperation(logger, 'SELECT', 'staff_members', staffStart, 1);

    if (!existingStaff) {
      throw NotFoundError('Staff member');
    }

    // Soft delete staff member
    const deleteStart = Date.now();
    const [deletedStaff] = await db
      .update(staff_members)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(staff_members.staff_id, staffId))
      .returning();
    logDBOperation(logger, 'UPDATE', 'staff_members', deleteStart, 1);

    if (!deletedStaff) {
      throw new Error('Failed to delete staff member');
    }

    const totalDuration = Date.now() - startTime;
    logger.info('Staff member deleted successfully', {
      staffId,
      practiceId,
      totalDuration
    });

    logPerformanceMetric(logger, 'staff_delete_total', totalDuration, {
      success: true
    });

    return createSuccessResponse(null, 'Staff member deleted successfully');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    const errorName = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown';
    const constructorName = error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error;
    
    logger.error('Staff member delete request failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
      errorType: constructorName
    });

    logPerformanceMetric(logger, 'staff_delete_total', totalDuration, {
      success: false,
      errorType: errorName
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

// Export with RBAC protection following users pattern
export const GET = practiceRoute(
  ['practices:staff:read:own', 'practices:manage:all'],
  getStaffMemberHandler,
  { rateLimit: 'api' }
);

export const PUT = practiceRoute(
  ['practices:staff:manage:own', 'practices:manage:all'],
  updateStaffMemberHandler,
  { rateLimit: 'api' }
);

export const DELETE = practiceRoute(
  ['practices:staff:manage:own', 'practices:manage:all'],
  deleteStaffMemberHandler,
  { rateLimit: 'api' }
);
