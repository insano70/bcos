import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';

// Validation schema for reorder request
const reorderRequestSchema = z.object({
  practiceId: z.string().uuid().optional(), // Optional since we get it from route
  data: z.array(z.object({
    staffId: z.string().uuid('Invalid staff ID'),
    newOrder: z.number().int().min(0, 'Order must be non-negative')
  })).min(1, 'At least one staff member must be reordered')
});

const reorderStaffHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  let practiceId: string | undefined;

  try {
    // Extract practice ID from route params
    const practiceParams = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = practiceParams.id;

    const requestData = await validateRequest(request, reorderRequestSchema);
    const reorderData = requestData.data;

    // Transform to service format
    const staffOrder = reorderData.map(item => ({
      staff_id: item.staffId,
      display_order: item.newOrder
    }));

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    await staffService.reorderStaff(practiceId, staffOrder);

    return createSuccessResponse(null, 'Staff members reordered successfully');

  } catch (error) {
    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';

    log.error('Staff reorder request failed', error, {
      practiceId,
      requestingUserId: userContext.user_id
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
