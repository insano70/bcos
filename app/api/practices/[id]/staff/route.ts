import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination } from '@/lib/api/utils/request';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { staffCreateSchema, staffQuerySchema } from '@/lib/validations/staff';

const getPracticeStaffHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema));
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sortBy = searchParams.get('sort') || 'display_order';
    const sortOrder = searchParams.get('order') === 'desc' ? 'desc' : 'asc';
    const query = validateQuery(searchParams, staffQuerySchema);

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    const { staff, total } = await staffService.getStaffMembers(practiceId, {
      is_active: query.is_active,
      search: query.search,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy,
      sortOrder,
    });

    const duration = Date.now() - startTime;
    log.info('Staff members retrieved', {
      operation: 'list_staff_members',
      userId: userContext.user_id,
      practiceId,
      returned: staff.length,
      total,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'api',
    });

    return createPaginatedResponse(staff, {
      page: pagination.page,
      limit: pagination.limit,
      total,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error fetching staff members', error, {
      operation: 'list_staff_members',
      userId: userContext.user_id,
      practiceId,
      duration,
      component: 'api',
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return handleRouteError(error, clientErrorMessage, request);
  }
};

const createPracticeStaffHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema));
    const validatedData = await validateRequest(request, staffCreateSchema);

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    const newStaff = await staffService.createStaffMember(practiceId, validatedData);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('staff_member', {
      resourceId: newStaff.staff_id,
      resourceName: newStaff.name,
      userId: userContext.user_id,
      duration,
    });
    log.info(template.message, template.context);

    return createSuccessResponse(newStaff, 'Staff member created successfully');
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error creating staff member', error, {
      operation: 'create_staff_member',
      userId: userContext.user_id,
      practiceId,
      duration,
      component: 'api',
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return handleRouteError(error, clientErrorMessage, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getPracticeStaffHandler, {
  permission: ['practices:staff:manage:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const POST = rbacRoute(createPracticeStaffHandler, {
  permission: ['practices:staff:manage:own', 'practices:manage:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
