import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { dataSourceParamsSchema, dataSourceColumnParamsSchema, dataSourceColumnUpdateRefinedSchema } from '@/lib/validations/data-sources';

const combinedParamsSchema = dataSourceParamsSchema.extend({
  columnId: dataSourceColumnParamsSchema.shape.id
});
import type { UserContext } from '@/lib/types/rbac';
import { createAppLogger, logPerformanceMetric } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';

/**
 * Admin Individual Data Source Column CRUD API
 * Manages individual column operations
 */

// GET - Get single column by ID
const getDataSourceColumnHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    logger.info('Data source column get request initiated', {
      requestingUserId: userContext.user_id,
      columnId
    });

    // Create service instance and get column
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const column = await dataSourcesService.getDataSourceColumnById(columnId);

    if (!column) {
      return createErrorResponse('Data source column not found', 404);
    }

    logPerformanceMetric(logger, 'data_source_column_get', Date.now() - startTime);

    return createSuccessResponse({ column }, 'Data source column retrieved successfully');

  } catch (error) {
    logger.error('Data source column get error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id,
      columnId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// PATCH - Update column by ID
const updateDataSourceColumnHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    logger.info('Data source column update request initiated', {
      requestingUserId: userContext.user_id,
      columnId
    });

    // Validate request body
    const updateData = await validateRequest(request, dataSourceColumnUpdateRefinedSchema);

    // Create service instance and update column
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const updatedColumn = await dataSourcesService.updateDataSourceColumn(columnId, updateData);

    if (!updatedColumn) {
      return createErrorResponse('Data source column not found or update failed', 404);
    }

    logPerformanceMetric(logger, 'data_source_column_update', Date.now() - startTime);

    return createSuccessResponse({ column: updatedColumn }, 'Data source column updated successfully');

  } catch (error) {
    logger.error('Data source column update error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id,
      columnId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// DELETE - Delete column by ID
const deleteDataSourceColumnHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    logger.info('Data source column delete request initiated', {
      requestingUserId: userContext.user_id,
      columnId
    });

    // Create service instance and delete column
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const deleted = await dataSourcesService.deleteDataSourceColumn(columnId);

    if (!deleted) {
      return createErrorResponse('Data source column not found or delete failed', 404);
    }

    logPerformanceMetric(logger, 'data_source_column_delete', Date.now() - startTime);

    return createSuccessResponse({ deleted: true }, 'Data source column deleted successfully');

  } catch (error) {
    logger.error('Data source column delete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id,
      columnId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(getDataSourceColumnHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api'
});

export const PATCH = rbacRoute(updateDataSourceColumnHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api'
});

export const PUT = rbacRoute(updateDataSourceColumnHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api'
});

export const DELETE = rbacRoute(deleteDataSourceColumnHandler, {
  permission: ['data-sources:delete:organization', 'data-sources:delete:all'],
  rateLimit: 'api'
});
