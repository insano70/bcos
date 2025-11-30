import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log, logTemplates, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACDataSourceColumnsService } from '@/lib/services/rbac-data-source-columns-service';
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
    const columnsService = createRBACDataSourceColumnsService(userContext);
    const columns = await columnsService.getDataSourceColumns(validatedQuery);

    const responseData = {
      columns,
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: columns.length,
      },
      metadata: {
        dataSourceId,
        generatedAt: new Date().toISOString(),
      },
    };

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      data_source_id: dataSourceId,
      is_active: validatedQuery.is_active,
    });

    const activeCount = columns.filter((col) => col.is_active).length;
    const inactiveCount = columns.length - activeCount;
    const dataTypeCounts = columns.reduce(
      (acc, col) => {
        const type = col.data_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    log.info(`data source columns list completed - returned ${columns.length} columns`, {
      operation: 'list_data_source_columns',
      resourceType: 'data_source_columns',
      userId: userContext.user_id,
      dataSourceId,
      filters,
      results: {
        returned: columns.length,
        active: activeCount,
        inactive: inactiveCount,
        byDataType: dataTypeCounts,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'admin',
    });

    return createSuccessResponse(responseData, 'Data source columns retrieved successfully');
  } catch (error) {
    log.error('data source columns list failed', error, {
      operation: 'list_data_source_columns',
      userId: userContext.user_id,
      dataSourceId,
      component: 'admin',
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

    // Validate request body and ensure data_source_id matches route
    const createData = await validateRequest(request, dataSourceColumnCreateRefinedSchema);
    if (createData.data_source_id !== dataSourceId) {
      return createErrorResponse(
        'Data source ID in request body does not match route parameter',
        400
      );
    }

    // Create service instance and create column
    const columnsService = createRBACDataSourceColumnsService(userContext);
    const newColumn = await columnsService.createDataSourceColumn(createData);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('data_source_column', {
      resourceId: String(newColumn.column_id),
      resourceName: newColumn.column_name,
      userId: userContext.user_id,
      duration,
      metadata: {
        dataSourceId,
        displayName: newColumn.display_name,
        dataType: newColumn.data_type,
        isActive: newColumn.is_active,
        isFilterable: newColumn.is_filterable,
        isMeasure: newColumn.is_measure,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(newColumn, 'Data source column created successfully');
  } catch (error) {
    log.error('data source column creation failed', error, {
      operation: 'create_data_source_column',
      userId: userContext.user_id,
      dataSourceId,
      component: 'admin',
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
