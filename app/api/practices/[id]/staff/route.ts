import type { NextRequest } from 'next/server';
import { validateQuery, validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { getPagination } from '@/lib/api/utils/request';
import { log } from '@/lib/logger';
import { createRBACStaffMembersService } from '@/lib/services/rbac-staff-members-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceParamsSchema } from '@/lib/validations/practice';
import { staffCreateSchema, staffQuerySchema } from '@/lib/validations/staff';

const getPracticeStaffHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
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

    return createPaginatedResponse(staff, {
      page: pagination.page,
      limit: pagination.limit,
      total,
    });
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error fetching staff members', error, {
      practiceId,
      operation: 'fetchStaffMembers',
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const createPracticeStaffHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  let practiceId: string | undefined;
  try {
    ({ id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema));
    const validatedData = await validateRequest(request, staffCreateSchema);

    // Use the RBAC staff members service
    const staffService = createRBACStaffMembersService(userContext);
    const newStaff = await staffService.createStaffMember(practiceId, validatedData);

    return createSuccessResponse(newStaff, 'Staff member created successfully');
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error creating staff member', error, {
      practiceId,
      operation: 'createStaffMember',
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
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
