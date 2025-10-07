import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACPracticeAttributesService } from '@/lib/services/rbac-practice-attributes-service';
import type { UserContext } from '@/lib/types/rbac';
import { practiceAttributesUpdateSchema, practiceParamsSchema } from '@/lib/validations/practice';

const getPracticeAttributesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  let practiceId: string | undefined;
  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;

    // Use the RBAC practice attributes service
    const attributesService = createRBACPracticeAttributesService(userContext);
    const attributes = await attributesService.getPracticeAttributes(practiceId);

    return createSuccessResponse(attributes);
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error fetching practice attributes', error, {
      practiceId,
      operation: 'fetchPracticeAttributes',
    });

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
  let practiceId: string | undefined;
  try {
    const params = await extractRouteParams(args[0], practiceParamsSchema);
    practiceId = params.id;
    const validatedData = await validateRequest(request, practiceAttributesUpdateSchema);

    // Use the RBAC practice attributes service
    const attributesService = createRBACPracticeAttributesService(userContext);
    const updatedAttributes = await attributesService.updatePracticeAttributes(
      practiceId,
      validatedData
    );

    return createSuccessResponse(updatedAttributes, 'Practice attributes updated successfully');
  } catch (error) {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown error';

    log.error('Error updating practice attributes', error, {
      practiceId,
      operation: 'updatePracticeAttributes',
    });

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
