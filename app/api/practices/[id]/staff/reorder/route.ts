import type { NextRequest } from 'next/server';
import { db, practices, staff_members } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError, ValidationError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';
import { log } from '@/lib/logger';

// Validation schema for reorder request
const reorderRequestSchema = z.object({
  practiceId: z.string().uuid().optional(), // Optional since we get it from route
  data: z.array(z.object({
    staffId: z.string().uuid('Invalid staff ID'),
    newOrder: z.number().int().min(0, 'Order must be non-negative')
  })).min(1, 'At least one staff member must be reordered')
});

const reorderStaffHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    // Extract practice ID from route params
    const practiceParams = await extractRouteParams(args[0], practiceParamsSchema);
    const practiceId = practiceParams.id;

    const requestData = await validateRequest(request, reorderRequestSchema);
    const reorderData = requestData.data;

    log.info('Reorder staff request initiated', {
      practiceId,
      staffCount: reorderData.length,
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
    log.db('SELECT', 'practices', Date.now() - practiceStart, { rowCount: 1 });

    if (!practice) {
      throw NotFoundError('Practice');
    }

    // RBAC: Check if user can manage staff for this practice
    if (!userContext.is_super_admin && practice.owner_user_id !== userContext.user_id) {
      throw new Error('Access denied: You do not have permission to manage staff for this practice');
    }

    // Verify all staff members exist and belong to this practice
    const verifyStart = Date.now();
    const staffIds = reorderData.map(item => item.staffId);
    const existingStaff = await db
      .select({ staff_id: staff_members.staff_id })
      .from(staff_members)
      .where(and(
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ));
    log.db('SELECT', 'staff_members', Date.now() - verifyStart, { rowCount: existingStaff.length });

    const existingStaffIds = existingStaff.map(s => s.staff_id);
    const invalidStaffIds = staffIds.filter(id => !existingStaffIds.includes(id));
    
    if (invalidStaffIds.length > 0) {
      throw ValidationError(null, `Invalid staff IDs: ${invalidStaffIds.join(', ')}`);
    }

    // Update display orders in a transaction
    const updateStart = Date.now();
    const updates = [];
    
    for (const { staffId, newOrder } of reorderData) {
      const updatePromise = db
        .update(staff_members)
        .set({
          display_order: newOrder,
          updated_at: new Date()
        })
        .where(and(
          eq(staff_members.staff_id, staffId),
          eq(staff_members.practice_id, practiceId)
        ));
      updates.push(updatePromise);
    }

    // Execute all updates
    await Promise.all(updates);
    log.db('UPDATE', 'staff_members', Date.now() - updateStart, { rowCount: reorderData.length });

    // Get updated staff list to return
    const finalStart = Date.now();
    const updatedStaff = await db
      .select()
      .from(staff_members)
      .where(and(
        eq(staff_members.practice_id, practiceId),
        isNull(staff_members.deleted_at)
      ))
      .orderBy(staff_members.display_order);
    log.db('SELECT', 'staff_members', Date.now() - finalStart, { rowCount: updatedStaff.length });

    const totalDuration = Date.now() - startTime;
    log.info('Staff reorder completed successfully', {
      practiceId,
      staffCount: reorderData.length,
      totalDuration
    });

    return createSuccessResponse(updatedStaff, 'Staff members reordered successfully');
    
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    // Safe error handling without instanceof
    let errorMessage = 'Unknown error';

    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    log.error('Staff reorder request failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

// Export with RBAC protection following users pattern
export const PUT = rbacRoute(
  reorderStaffHandler,
  {
    permission: ['practices:staff:manage:own', 'practices:manage:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
