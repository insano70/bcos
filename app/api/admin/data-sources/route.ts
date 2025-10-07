import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
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

  log.info('Data sources list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

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
        total: dataSources.length, // For now, could add separate count query later
      },
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };

    log.info('Data sources list completed', { duration: Date.now() - startTime });

    return createSuccessResponse(responseData, 'Data sources retrieved successfully');
  } catch (error) {
    log.error('Data sources list error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new data source
const createDataSourceHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Data source creation request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body
    const createData = await validateRequest(request, dataSourceCreateRefinedSchema);

    // Create service instance and create data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const newDataSource = await dataSourcesService.createDataSource(createData);

    log.info('Data source created', { duration: Date.now() - startTime });

    return createSuccessResponse(newDataSource, 'Data source created successfully');
  } catch (error) {
    log.error('Data source creation error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// GET - Get table columns for schema/table
const getTableColumnsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Table columns request initiated', {
    requestingUserId: userContext.user_id,
  });

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

    log.info('Table columns retrieved', { duration: Date.now() - startTime });

    return createSuccessResponse(responseData, 'Table columns retrieved successfully');
  } catch (error) {
    log.error('Table columns error', error, {
      requestingUserId: userContext.user_id,
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
