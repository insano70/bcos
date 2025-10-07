import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceParamsSchema, practiceUpdateSchema } from '@/lib/validations/practice';

const getPracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    log.info('Get practice by ID request initiated', {
      requestingUserId: userContext.user_id,
      practiceId,
    });

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Get practice with automatic RBAC checking
    const practice = await practicesService.getPracticeById(practiceId);

    if (!practice) {
      throw NotFoundError('Practice');
    }

    log.info('Get practice by ID completed successfully', {
      practiceId,
      duration: Date.now() - startTime,
    });

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
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Get practice by ID failed', error, {
      practiceId,
      requestingUserId: userContext.user_id,
      duration: Date.now() - startTime,
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const updatePracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;
    const validatedData = await validateRequest(request, practiceUpdateSchema);

    log.info('Update practice request initiated', {
      requestingUserId: userContext.user_id,
      practiceId,
      updateFields: Object.keys(validatedData),
    });

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Update practice with automatic RBAC checking
    const updatedPractice = await practicesService.updatePractice(practiceId, {
      name: validatedData.name,
      domain: validatedData.domain,
      template_id: validatedData.template_id,
      status: validatedData.status,
    });

    log.info('Practice updated successfully', {
      practiceId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(
      {
        id: updatedPractice.id,
        name: updatedPractice.name,
        domain: updatedPractice.domain,
        template_id: updatedPractice.template_id,
        status: updatedPractice.status,
        owner_user_id: updatedPractice.owner_user_id,
        created_at: updatedPractice.created_at,
        updated_at: updatedPractice.updated_at,
      },
      'Practice updated successfully'
    );
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Update practice failed', error, {
      practiceId,
      requestingUserId: userContext.user_id,
      duration: Date.now() - startTime,
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const deletePracticeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    log.info('Delete practice request initiated', {
      requestingUserId: userContext.user_id,
      practiceId,
    });

    // Use the RBAC practices service
    const practicesService = createRBACPracticesService(userContext);

    // Delete practice with automatic RBAC checking
    await practicesService.deletePractice(practiceId);

    log.info('Practice deleted successfully', {
      practiceId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse({ id: practiceId }, 'Practice deleted successfully');
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Delete practice failed', error, {
      practiceId,
      requestingUserId: userContext.user_id,
      duration: Date.now() - startTime,
    });

    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getPracticeHandler, {
  permission: ['practices:read:own', 'practices:read:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updatePracticeHandler, {
  permission: ['practices:update:own', 'practices:manage:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

// Only super admins can delete practices
export const DELETE = rbacRoute(deletePracticeHandler, {
  ...rbacConfigs.superAdmin,
  rateLimit: 'api',
});
