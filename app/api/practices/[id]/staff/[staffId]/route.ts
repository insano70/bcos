import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { calculateChanges, log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';
import type { UserContext } from '@/lib/types/rbac';
import { staffUpdateSchema } from '@/lib/validations/staff';

const getStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
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

    const duration = Date.now() - startTime;
    log.info('Staff member retrieved', {
      operation: 'get_staff_member',
      userId: userContext.user_id,
      practiceId,
      staffId,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'api',
    });

    return createSuccessResponse(staffMember);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member get request failed', error, {
      operation: 'get_staff_member',
      userId: userContext.user_id,
      practiceId,
      staffId,
      duration,
      component: 'api',
    });

    return handleRouteError(error, errorMessage, request);
  }
};

const updateStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
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

    // Get current staff member for change tracking
    const beforeStaff = await staffService.getStaffMember(practiceId, staffId);

    // Perform update
    const updatedStaff = await staffService.updateStaffMember(practiceId, staffId, validatedData);

    const duration = Date.now() - startTime;

    // Calculate actual changes for audit trail
    const changes = calculateChanges(beforeStaff, updatedStaff);

    const template = logTemplates.crud.update('staff_member', {
      resourceId: staffId,
      userId: userContext.user_id,
      changes,
      duration,
    });
    log.info(template.message, template.context);

    return createSuccessResponse(updatedStaff, 'Staff member updated successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member update request failed', error, {
      operation: 'update_staff_member',
      userId: userContext.user_id,
      practiceId,
      staffId,
      duration,
      component: 'api',
    });

    return handleRouteError(error, errorMessage, request);
  }
};

const deleteStaffMemberHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
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

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('staff_member', {
      resourceId: staffId,
      userId: userContext.user_id,
      soft: true,
      duration,
    });
    log.info(template.message, template.context);

    return createSuccessResponse(null, 'Staff member deleted successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Staff member delete request failed', error, {
      operation: 'delete_staff_member',
      userId: userContext.user_id,
      practiceId,
      staffId,
      duration,
      component: 'api',
    });

    return handleRouteError(error, errorMessage, request);
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
