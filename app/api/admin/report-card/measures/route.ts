import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { measureCreateSchema, measureQuerySchema } from '@/lib/validations/report-card';
import { MeasureDuplicateError } from '@/lib/errors/report-card-errors';

/**
 * Report Card API - Measure configuration CRUD
 */

// GET - List all measure configurations
const getMeasuresHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryResult = measureQuerySchema.safeParse({
      is_active: searchParams.get('is_active') || undefined,
    });

    const activeOnly = queryResult.success
      ? queryResult.data.is_active !== false
      : true;

    // Get measures
    const service = createRBACReportCardService(userContext);
    const measures = await service.getMeasures(activeOnly);

    const duration = Date.now() - startTime;

    log.info('Fetched measure configurations', {
      operation: 'get_measures',
      activeOnly,
      measureCount: measures.length,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { measures },
      'Measures retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to get measures', error as Error, {
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

// POST - Create new measure configuration
const createMeasureHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const requestBody = await request.json();
    const validationResult = measureCreateSchema.safeParse(requestBody);

    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return createErrorResponse(`Validation failed: ${errorDetails}`, 400, request);
    }

    // Create measure
    const service = createRBACReportCardService(userContext);
    const measure = await service.createMeasure(validationResult.data);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.create('measure', {
      resourceId: String(measure.measure_id),
      resourceName: measure.measure_name,
      userId: userContext.user_id,
      duration,
    });

    log.info(template.message, { ...template.context, component: 'report-card' });

    return createSuccessResponse(
      { measure },
      'Measure created successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof MeasureDuplicateError) {
      return createErrorResponse('Measure already exists', 409, request);
    }

    log.error('Failed to create measure', error as Error, {
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

// SECURITY: Measure configuration is admin-only (business intelligence protection)
export const GET = rbacRoute(getMeasuresHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

export const POST = rbacRoute(createMeasureHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});


