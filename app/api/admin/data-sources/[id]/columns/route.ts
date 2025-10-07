import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  dataSourceColumnCreateRefinedSchema,
  dataSourceColumnQuerySchema,
  dataSourceParamsSchema,
} from '@/lib/validations/data-sources';

/**
 * Admin Data Source Columns CRUD API
 * Manages column configurations for individual data sources
 */

// GET - List all columns for a data source
const getDataSourceColumnsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source columns list request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      data_source_id: dataSourceId,
      is_active: searchParams.get('is_active') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    };

    const validatedQuery = dataSourceColumnQuerySchema.parse(queryParams);

    // Create service instance and get columns
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const columns = await dataSourcesService.getDataSourceColumns(validatedQuery);

    const responseData = {
      columns,
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: columns.length, // For now, could add separate count query later
      },
      metadata: {
        dataSourceId,
        generatedAt: new Date().toISOString(),
      },
    };

    log.info('Data source columns list completed', { duration: Date.now() - startTime });

    return createSuccessResponse(responseData, 'Data source columns retrieved successfully');
  } catch (error) {
    log.error('Data source columns list error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new column for a data source
const createDataSourceColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source column creation request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    // Validate request body and ensure data_source_id matches route
    const createData = await validateRequest(request, dataSourceColumnCreateRefinedSchema);
    if (createData.data_source_id !== dataSourceId) {
      return createErrorResponse(
        'Data source ID in request body does not match route parameter',
        400
      );
    }

    // Create service instance and create column
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const newColumn = await dataSourcesService.createDataSourceColumn(createData);

    log.info('Data source column created', { duration: Date.now() - startTime });

    return createSuccessResponse(newColumn, 'Data source column created successfully');
  } catch (error) {
    log.error('Data source column creation error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(getDataSourceColumnsHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createDataSourceColumnHandler, {
  permission: ['data-sources:create:organization', 'data-sources:create:all'],
  rateLimit: 'api',
});
