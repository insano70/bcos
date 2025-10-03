import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { dataSourceParamsSchema, dataSourceUpdateRefinedSchema, dataSourceColumnCreateRefinedSchema, dataSourceColumnUpdateRefinedSchema, dataSourceColumnQuerySchema, dataSourceColumnParamsSchema } from '@/lib/validations/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';

/**
 * Admin Data Sources Individual CRUD API
 * Manages individual data source operations
 */

// GET - Get single data source by ID
const getDataSourceHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source get request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    // Create service instance and get data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const dataSource = await dataSourcesService.getDataSourceById(dataSourceId);

    if (!dataSource) {
      return createErrorResponse('Data source not found', 404);
    }

    log.info('Data source retrieved', { duration: Date.now() - startTime });

    return createSuccessResponse({ dataSource }, 'Data source retrieved successfully');

  } catch (error) {
    log.error('Data source get error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// PATCH - Update data source by ID
const updateDataSourceHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source update request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    // Validate request body
    const updateData = await validateRequest(request, dataSourceUpdateRefinedSchema);

    // Create service instance and update data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const updatedDataSource = await dataSourcesService.updateDataSource(dataSourceId, updateData);

    if (!updatedDataSource) {
      return createErrorResponse('Data source not found or update failed', 404);
    }

    log.info('Data source updated', { duration: Date.now() - startTime });

    return createSuccessResponse({ dataSource: updatedDataSource }, 'Data source updated successfully');

  } catch (error) {
    log.error('Data source update error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// DELETE - Delete data source by ID
const deleteDataSourceHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source delete request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    // Create service instance and delete data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const deleted = await dataSourcesService.deleteDataSource(dataSourceId);

    if (!deleted) {
      return createErrorResponse('Data source not found or delete failed', 404);
    }

    log.info('Data source deleted', { duration: Date.now() - startTime });

    return createSuccessResponse({ deleted: true }, 'Data source deleted successfully');

  } catch (error) {
    log.error('Data source delete error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(getDataSourceHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api'
});

export const PATCH = rbacRoute(updateDataSourceHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api'
});

export const DELETE = rbacRoute(deleteDataSourceHandler, {
  permission: ['data-sources:delete:organization', 'data-sources:delete:all'],
  rateLimit: 'api'
});
