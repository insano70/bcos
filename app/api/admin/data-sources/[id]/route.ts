import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, handleRouteError, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  dataSourceParamsSchema,
  dataSourceUpdateRefinedSchema,
} from '@/lib/validations/data-sources';

/**
 * Admin Data Sources Individual CRUD API
 * Manages individual data source operations
 */

// GET - Get single data source by ID
const getDataSourceHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    // Create service instance and get data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const dataSource = await dataSourcesService.getDataSourceById(dataSourceId);

    if (!dataSource) {
      const template = logTemplates.crud.read('data_source', {
        resourceId: String(dataSourceId),
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      return createErrorResponse(NotFoundError('Data source'), 404, request);
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('data_source', {
      resourceId: String(dataSource.data_source_id),
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        databaseType: dataSource.database_type,
        schemaName: dataSource.schema_name,
        isActive: dataSource.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ dataSource }, 'Data source retrieved successfully');
  } catch (error) {
    log.error('data source read failed', error, {
      operation: 'read_data_source',
      resourceId: String(dataSourceId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to process data source request', request);
  }
};

// PATCH - Update data source by ID
const updateDataSourceHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    // Validate request body
    const updateData = await validateRequest(request, dataSourceUpdateRefinedSchema);

    // Get before state for change tracking
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const before = await dataSourcesService.getDataSourceById(dataSourceId);

    if (!before) {
      return createErrorResponse(NotFoundError('Data source'), 404, request);
    }

    // Update data source
    const updatedDataSource = await dataSourcesService.updateDataSource(dataSourceId, updateData);

    if (!updatedDataSource) {
      log.error('Data source update returned null', null, {
        dataSourceId,
        userId: userContext.user_id,
      });
      return handleRouteError(new Error('Data source update failed'), 'Data source update failed', request);
    }

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        database_type: before.database_type,
        schema_name: before.schema_name,
        is_active: before.is_active,
        connection_config: before.connection_config,
      },
      {
        database_type: updatedDataSource.database_type,
        schema_name: updatedDataSource.schema_name,
        is_active: updatedDataSource.is_active,
        connection_config: updatedDataSource.connection_config,
      }
    );

    const template = logTemplates.crud.update('data_source', {
      resourceId: String(updatedDataSource.data_source_id),
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        databaseType: updatedDataSource.database_type,
        schemaName: updatedDataSource.schema_name,
        isActive: updatedDataSource.is_active,
        configUpdated: !!updateData.connection_config,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      { dataSource: updatedDataSource },
      'Data source updated successfully'
    );
  } catch (error) {
    log.error('data source update failed', error, {
      operation: 'update_data_source',
      resourceId: String(dataSourceId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to process data source request', request);
  }
};

// DELETE - Delete data source by ID
const deleteDataSourceHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    // Get data source info before deletion
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const dataSource = await dataSourcesService.getDataSourceById(dataSourceId);

    if (!dataSource) {
      return createErrorResponse(NotFoundError('Data source'), 404, request);
    }

    // Delete data source
    const deleted = await dataSourcesService.deleteDataSource(dataSourceId);

    if (!deleted) {
      log.error('Data source deletion returned false', null, {
        dataSourceId,
        userId: userContext.user_id,
      });
      return handleRouteError(new Error('Data source delete failed'), 'Data source delete failed', request);
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('data_source', {
      resourceId: String(dataSource.data_source_id),
      userId: userContext.user_id,
      soft: false,
      duration,
      metadata: {
        databaseType: dataSource.database_type,
        schemaName: dataSource.schema_name,
        wasActive: dataSource.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ deleted: true }, 'Data source deleted successfully');
  } catch (error) {
    log.error('data source deletion failed', error, {
      operation: 'delete_data_source',
      resourceId: String(dataSourceId),
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to process data source request', request);
  }
};

export const GET = rbacRoute(getDataSourceHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});

export const PATCH = rbacRoute(updateDataSourceHandler, {
  permission: ['data-sources:update:organization', 'data-sources:update:all'],
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteDataSourceHandler, {
  permission: ['data-sources:delete:organization', 'data-sources:delete:all'],
  rateLimit: 'api',
});
