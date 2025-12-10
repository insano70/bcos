import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceParamsSchema } from '@/lib/validations/practice';

// Validation schema for reorder request
const reorderRequestSchema = z.object({
  practiceId: z.string().uuid().optional(), // Optional since we get it from route
  data: z
    .array(
      z.object({
        staffId: z.string().uuid('Invalid staff ID'),
        newOrder: z.number().int().min(0, 'Order must be non-negative'),
      })
    )
    .min(1, 'At least one staff member must be reordered'),
});

const reorderStaffHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    // Extract practice ID from route params
    const practiceParams = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = practiceParams.id;

    const requestData = await validateRequest(request, reorderRequestSchema);
    const reorderData = requestData.data;

    // Transform to service format
    const staffOrder = reorderData.map((item) => ({
      staff_id: item.staffId,
      display_order: item.newOrder,
    }));

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    await staffService.reorderStaff(practiceId, staffOrder);

    const duration = Date.now() - startTime;
    log.info('Staff members reordered', {
      operation: 'reorder_staff_members',
      userId: userContext.user_id,
      practiceId,
      count: staffOrder.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'api',
    });

    return createSuccessResponse(null, 'Staff members reordered successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff reorder request failed', error, {
      operation: 'reorder_staff_members',
      userId: userContext.user_id,
      practiceId,
      duration,
      component: 'api',
    });

    return handleRouteError(error, errorMessage, request);
  }
};

// Export with RBAC protection following users pattern
export const PUT = rbacRoute(reorderStaffHandler, {
  permission: ['practices:staff:manage:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
