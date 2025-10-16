import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import {
  dataSourceColumnParamsSchema,
  dataSourceColumnUpdateRefinedSchema,
  dataSourceParamsSchema,
} from '@/lib/validations/data-sources';

const combinedParamsSchema = dataSourceParamsSchema.extend({
  columnId: dataSourceColumnParamsSchema.shape.id,
});

import { log, logTemplates, calculateChanges } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import { chartDataCache } from '@/lib/cache/chart-data-cache';

/**
 * Admin Individual Data Source Column CRUD API
 * Manages individual column operations
 */

// GET - Get single column by ID
const getDataSourceColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const _dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    // Create service instance and get column
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const column = await dataSourcesService.getDataSourceColumnById(columnId);

    if (!column) {
      const template = logTemplates.crud.read('data_source_column', {
        resourceId: String(columnId),
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      return createErrorResponse('Data source column not found', 404);
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('data_source_column', {
      resourceId: String(column.column_id),
      resourceName: column.column_name,
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        dataSourceId: column.data_source_id,
        displayName: column.display_name,
        dataType: column.data_type,
        isActive: column.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ column }, 'Data source column retrieved successfully');
  } catch (error) {
    log.error('data source column read failed', error, {
      operation: 'read_data_source_column',
      resourceId: String(columnId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// PATCH - Update column by ID
const updateDataSourceColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const _dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    // Validate request body
    const updateData = await validateRequest(request, dataSourceColumnUpdateRefinedSchema);

    // Get before state for change tracking
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const before = await dataSourcesService.getDataSourceColumnById(columnId);

    if (!before) {
      return createErrorResponse('Data source column not found', 404);
    }

    // Update column
    const updatedColumn = await dataSourcesService.updateDataSourceColumn(columnId, updateData);

    if (!updatedColumn) {
      return createErrorResponse('Data source column update failed', 500);
    }

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        display_name: before.display_name,
        data_type: before.data_type,
        is_active: before.is_active,
        is_filterable: before.is_filterable,
        is_measure: before.is_measure,
        sort_order: before.sort_order,
      },
      {
        display_name: updatedColumn.display_name,
        data_type: updatedColumn.data_type,
        is_active: updatedColumn.is_active,
        is_filterable: updatedColumn.is_filterable,
        is_measure: updatedColumn.is_measure,
        sort_order: updatedColumn.sort_order,
      }
    );

    const template = logTemplates.crud.update('data_source_column', {
      resourceId: String(updatedColumn.column_id),
      resourceName: updatedColumn.column_name,
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        dataSourceId: updatedColumn.data_source_id,
        dataType: updatedColumn.data_type,
        isActive: updatedColumn.is_active,
      },
    });

    log.info(template.message, template.context);

    // Phase 6: Invalidate cache for all charts using this data source
    await chartDataCache.invalidateByDataSource(updatedColumn.data_source_id);
    
    log.info('Cache invalidated after column update', {
      columnId: updatedColumn.column_id,
      dataSourceId: updatedColumn.data_source_id,
    });

    return createSuccessResponse(
      { column: updatedColumn },
      'Data source column updated successfully'
    );
  } catch (error) {
    log.error('data source column update failed', error, {
      operation: 'update_data_source_column',
      resourceId: String(columnId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// DELETE - Delete column by ID
const deleteDataSourceColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let columnId: number | undefined;

  try {
    const { id, columnId: columnIdParam } = await extractRouteParams(args[0], combinedParamsSchema);
    const _dataSourceId = parseInt(id, 10);
    columnId = parseInt(columnIdParam, 10);

    // Get column info before deletion
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const column = await dataSourcesService.getDataSourceColumnById(columnId);

    if (!column) {
      return createErrorResponse('Data source column not found', 404);
    }

    // Delete column
    const deleted = await dataSourcesService.deleteDataSourceColumn(columnId);

    if (!deleted) {
      return createErrorResponse('Data source column delete failed', 500);
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('data_source_column', {
      resourceId: String(column.column_id),
      resourceName: column.column_name,
      userId: userContext.user_id,
      soft: false,
      duration,
      metadata: {
        dataSourceId: column.data_source_id,
        dataType: column.data_type,
        wasActive: column.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ deleted: true }, 'Data source column deleted successfully');
  } catch (error) {
    log.error('data source column deletion failed', error, {
      operation: 'delete_data_source_column',
      resourceId: String(columnId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(getDataSourceColumnHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});

export const PATCH = rbacRoute(updateDataSourceColumnHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateDataSourceColumnHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteDataSourceColumnHandler, {
  permission: ['data-sources:delete:organization', 'data-sources:delete:all'],
  rateLimit: 'api',
});
