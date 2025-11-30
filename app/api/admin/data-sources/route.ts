import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  dataSourceCreateRefinedSchema,
  dataSourceQuerySchema,
  tableColumnsQuerySchema,
} from '@/lib/validations/data-sources';

/**
 * Admin Data Sources CRUD API
 * Manages data source definitions stored in the database
 */

// GET - List all data sources
const getDataSourcesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      search: searchParams.get('search') || undefined,
      is_active: searchParams.get('is_active') || undefined,
      database_type: searchParams.get('database_type') || undefined,
      schema_name: searchParams.get('schema_name') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    };

    const validatedQuery = dataSourceQuerySchema.parse(queryParams);

    // Create service instance and get data sources
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const dataSources = await dataSourcesService.getDataSources(validatedQuery);

    const responseData = {
      dataSources,
      pagination: {
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
        total: dataSources.length,
      },
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      search: validatedQuery.search,
      is_active: validatedQuery.is_active,
      database_type: validatedQuery.database_type,
      schema_name: validatedQuery.schema_name,
    });

    const dbTypeCounts = dataSources.reduce(
      (acc, ds) => {
        const type = ds.database_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const activeCount = dataSources.filter((ds) => ds.is_active).length;
    const inactiveCount = dataSources.length - activeCount;

    log.info(`data sources list query completed - returned ${dataSources.length} sources`, {
      operation: 'list_data_sources',
      resourceType: 'data_sources',
      userId: userContext.user_id,
      isSuperAdmin: userContext.is_super_admin,
      filters,
      results: {
        returned: dataSources.length,
        active: activeCount,
        inactive: inactiveCount,
        byType: dbTypeCounts,
        page: Math.floor((validatedQuery.offset || 0) / (validatedQuery.limit || 50)) + 1,
        pageSize: validatedQuery.limit || 50,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'admin',
    });

    return createSuccessResponse(responseData, 'Data sources retrieved successfully');
  } catch (error) {
    log.error('data sources list query failed', error, {
      operation: 'list_data_sources',
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new data source
const createDataSourceHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Validate request body
    const createData = await validateRequest(request, dataSourceCreateRefinedSchema);

    // Create service instance and create data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const newDataSource = await dataSourcesService.createDataSource(createData);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('data_source', {
      resourceId: String(newDataSource.data_source_id),
      userId: userContext.user_id,
      duration,
      metadata: {
        databaseType: newDataSource.database_type,
        schemaName: newDataSource.schema_name,
        isActive: newDataSource.is_active,
        hasCredentials: !!createData.connection_config?.password,
        isSuperAdmin: userContext.is_super_admin,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(newDataSource, 'Data source created successfully');
  } catch (error) {
    log.error('data source creation failed', error, {
      operation: 'create_data_source',
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// GET - Get table columns for schema/table
const getTableColumnsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = {
      schema_name: searchParams.get('schema_name') || '',
      table_name: searchParams.get('table_name') || '',
      database_type: searchParams.get('database_type') || 'postgresql',
    };

    const validatedQuery = tableColumnsQuerySchema.parse(queryParams);

    // Create service instance and get table columns
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const columns = await dataSourcesService.getTableColumns(validatedQuery);

    const responseData = {
      columns,
      metadata: {
        schema: validatedQuery.schema_name,
        table: validatedQuery.table_name,
        databaseType: validatedQuery.database_type,
        generatedAt: new Date().toISOString(),
      },
    };

    const duration = Date.now() - startTime;
    const dataTypeCounts = columns.reduce(
      (acc, col) => {
        const type = col.data_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    log.info(`table columns introspection completed - returned ${columns.length} columns`, {
      operation: 'introspect_table_columns',
      resourceType: 'table_columns',
      userId: userContext.user_id,
      table: {
        schema: validatedQuery.schema_name,
        name: validatedQuery.table_name,
        databaseType: validatedQuery.database_type,
      },
      results: {
        columnCount: columns.length,
        byDataType: dataTypeCounts,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
      component: 'admin',
    });

    return createSuccessResponse(responseData, 'Table columns retrieved successfully');
  } catch (error) {
    log.error('table columns introspection failed', error, {
      operation: 'introspect_table_columns',
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Combined GET handler for both data sources list and table columns
const combinedGetHandler = async (request: NextRequest, userContext: UserContext) => {
  const url = new URL(request.url);
  const hasColumnsParams =
    url.searchParams.has('schema_name') && url.searchParams.has('table_name');

  if (hasColumnsParams) {
    return getTableColumnsHandler(request, userContext);
  } else {
    return getDataSourcesHandler(request, userContext);
  }
};

export const GET = rbacRoute(combinedGetHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createDataSourceHandler, {
  permission: ['data-sources:create:organization', 'data-sources:create:all'],
  rateLimit: 'api',
});
