import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, logTemplates, calculateChanges, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACPracticeAttributesService } from '@/lib/services/rbac-practice-attributes-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceAttributesUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';

const getPracticeAttributesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    // Use the RBAC practice attributes service
    const attributesService = createRBACPracticeAttributesService(userContext);
    const attributes = await attributesService.getPracticeAttributes(practiceId);

    const duration = Date.now() - startTime;

    log.info('Practice attributes retrieved', {
      operation: 'read_practice_attributes',
      userId: userContext.user_id,
      practiceId,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'api',
    });

    return createSuccessResponse(attributes);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Practice attributes retrieval failed', error, {
      operation: 'read_practice_attributes',
      userId: userContext.user_id,
      practiceId,
      duration,
      component: 'api',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

const updatePracticeAttributesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let practiceId: string | undefined;

  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;
    const validatedData = await validateRequest(request, practiceAttributesUpdateSchema);

    // Use the RBAC practice attributes service
    const attributesService = createRBACPracticeAttributesService(userContext);

    // Get current attributes for change tracking
    const beforeAttributes = await attributesService.getPracticeAttributes(practiceId);

    // Perform update
    const updatedAttributes = await attributesService.updatePracticeAttributes(
      practiceId,
      validatedData
    );

    const duration = Date.now() - startTime;

    // Calculate actual changes for audit trail
    const changes = calculateChanges(
      beforeAttributes as unknown as Record<string, unknown>,
      updatedAttributes as unknown as Record<string, unknown>
    );

    const template = logTemplates.crud.update('practice_attributes', {
      resourceId: practiceId,
      userId: userContext.user_id,
      changes,
      duration,
    });
    log.info(template.message, template.context);

    return createSuccessResponse(updatedAttributes, 'Practice attributes updated successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Practice attributes update failed', error, {
      operation: 'update_practice_attributes',
      userId: userContext.user_id,
      practiceId,
      duration,
      component: 'api',
    });

    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';
    const clientErrorMessage =
      process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error';
    return createErrorResponse(clientErrorMessage, 500, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getPracticeAttributesHandler, {
  permission: ['practices:read:own', 'practices:read:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const PUT = rbacRoute(updatePracticeAttributesHandler, {
  permission: ['practices:update:own', 'practices:manage:all', 'practices:create:all'],
  extractResourceId: extractors.practiceId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
