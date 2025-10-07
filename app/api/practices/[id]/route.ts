import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { practiceUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import type { UserContext } from '@/lib/types/rbac';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';

const getPracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practice with automatic RBAC checking
    const practice = await practicesService.getPracticeById(practiceId);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    return createSuccessResponse({
      id: practice.id,
      name: practice.name,
      domain: practice.domain,
      template_id: practice.template_id,
      status: practice.status,
      owner_user_id: practice.owner_user_id,
      created_at: practice.created_at,
      updated_at: practice.updated_at,
    });

  } catch (error) {
    console.error('Error fetching practice:', error);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
}

const updatePracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema);
    const validatedData = await validateRequest(request, practiceUpdateSchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Update practice with automatic RBAC checking
    const updatedPractice = await practicesService.updatePractice(practiceId, {
      name: validatedData.name,
      domain: validatedData.domain,
      template_id: validatedData.template_id,
      status: validatedData.status,
    });

    return createSuccessResponse({
      id: updatedPractice.id,
      name: updatedPractice.name,
      domain: updatedPractice.domain,
      template_id: updatedPractice.template_id,
      status: updatedPractice.status,
      owner_user_id: updatedPractice.owner_user_id,
      created_at: updatedPractice.created_at,
      updated_at: updatedPractice.updated_at,
    }, 'Practice updated successfully');

  } catch (error) {
    console.error('Error updating practice:', error);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
}

const deletePracticeHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  try {
    const { id: practiceId } = await extractRouteParams(args[0], practiceParamsSchema);

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Delete practice with automatic RBAC checking
    await practicesService.deletePractice(practiceId);

    return createSuccessResponse(
      { id: practiceId },
      'Practice deleted successfully'
    );

  } catch (error) {
    console.error('Error deleting practice:', error);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
}

// Export with RBAC protection
export const GET = rbacRoute(
  getPracticeHandler,
  {
    permission: ['practices:read:own', 'practices:read:all', 'practices:create:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

export const PUT = rbacRoute(
  updatePracticeHandler,
  {
    permission: ['practices:update:own', 'practices:manage:all', 'practices:create:all'],
    extractResourceId: extractors.practiceId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);

// Only super admins can delete practices
export const DELETE = rbacRoute(
  deletePracticeHandler,
  {
    ...rbacConfigs.superAdmin,
    rateLimit: 'api'
  }
);
