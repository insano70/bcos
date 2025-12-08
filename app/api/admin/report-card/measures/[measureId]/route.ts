import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { measureParamsSchema, measureUpdateSchema } from '@/lib/validations/report-card';
import { MeasureNotFoundError } from '@/lib/errors/report-card-errors';

/**
 * Report Card API - Individual measure CRUD
 */

// PUT - Update measure configuration
const updateMeasureHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { params } = args[0] as { params: Promise<{ measureId: string }> };
  const resolvedParams = await params;
  const measureId = resolvedParams.measureId;

  try {
    // Validate params
    const paramsResult = measureParamsSchema.safeParse({ measureId });

    if (!paramsResult.success) {
      return createErrorResponse('Invalid measure ID', 400, request);
    }

    // Parse and validate request body
    const requestBody = await request.json();
    const validationResult = measureUpdateSchema.safeParse(requestBody);

    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return createErrorResponse(`Validation failed: ${errorDetails}`, 400, request);
    }

    const measureIdNum = parseInt(paramsResult.data.measureId, 10);

    // Update measure
    const service = createRBACReportCardService(userContext);
    const measure = await service.updateMeasure(measureIdNum, validationResult.data);

    const duration = Date.now() - startTime;

    log.info('Measure updated successfully', {
      operation: 'update_measure',
      measureId,
      measureName: measure.measure_name,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { measure },
      'Measure updated successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof MeasureNotFoundError) {
      return createErrorResponse('Measure not found', 404, request);
    }

    log.error('Failed to update measure', error as Error, {
      measureId,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

// DELETE - Soft delete measure configuration
const deleteMeasureHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { params } = args[0] as { params: Promise<{ measureId: string }> };
  const resolvedParams = await params;
  const measureId = resolvedParams.measureId;

  try {
    // Validate params
    const paramsResult = measureParamsSchema.safeParse({ measureId });

    if (!paramsResult.success) {
      return createErrorResponse('Invalid measure ID', 400, request);
    }

    const measureIdNum = parseInt(paramsResult.data.measureId, 10);

    // Delete measure
    const service = createRBACReportCardService(userContext);
    await service.deleteMeasure(measureIdNum);

    const duration = Date.now() - startTime;

    log.info('Measure deleted successfully', {
      operation: 'delete_measure',
      measureId,
      userId: userContext.user_id,
      soft: true,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { success: true },
      'Measure deleted successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof MeasureNotFoundError) {
      return createErrorResponse('Measure not found', 404, request);
    }

    log.error('Failed to delete measure', error as Error, {
      measureId,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

export const PUT = rbacRoute(updateMeasureHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteMeasureHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
