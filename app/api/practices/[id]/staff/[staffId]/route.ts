import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';
import type { UserContext } from '@/lib/types/rbac';
import { staffUpdateSchema } from '@/lib/validations/staff';

const getStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  let practiceId: string | undefined;
  let staffId: string | undefined;

  try {
    // Extract route params - they come as a single object with both id and staffId
    const params = await extractRouteParams(
      args[0],
      z.object({
        id: z.string().uuid('Invalid practice ID'),
        staffId: z.string().uuid('Invalid staff ID'),
      })
    );
    practiceId = params.id;
    staffId = params.staffId;

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    const staffMember = await staffService.getStaffMember(practiceId, staffId);

    return createSuccessResponse(staffMember);
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member get request failed', error, {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

const updateStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  let practiceId: string | undefined;
  let staffId: string | undefined;

  try {
    // Extract route params and validate request body
    const params = await extractRouteParams(
      args[0],
      z.object({
        id: z.string().uuid('Invalid practice ID'),
        staffId: z.string().uuid('Invalid staff ID'),
      })
    );
    practiceId = params.id;
    staffId = params.staffId;
    const validatedData = await validateRequest(request, staffUpdateSchema);

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    const updatedStaff = await staffService.updateStaffMember(practiceId, staffId, validatedData);

    return createSuccessResponse(updatedStaff, 'Staff member updated successfully');
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member update request failed', error, {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

const deleteStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  let practiceId: string | undefined;
  let staffId: string | undefined;

  try {
    // Extract route params
    const params = await extractRouteParams(
      args[0],
      z.object({
        id: z.string().uuid('Invalid practice ID'),
        staffId: z.string().uuid('Invalid staff ID'),
      })
    );
    practiceId = params.id;
    staffId = params.staffId;

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    await staffService.deleteStaffMember(practiceId, staffId);

    return createSuccessResponse(null, 'Staff member deleted successfully');
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member delete request failed', error, {
      practiceId,
      staffId,
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(errorMessage, 500, request);
  }
};

// Export with RBAC protection following users pattern
export const GET = rbacRoute(getStaffMemberHandler, {
  permission: ['practices:staff:read:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId, // Primary resource is the practice
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateStaffMemberHandler, {
  permission: ['practices:staff:manage:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteStaffMemberHandler, {
  permission: ['practices:staff:manage:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
