import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { dataSourceCreateRefinedSchema, dataSourceQuerySchema } from '@/lib/validations/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { createAppLogger, logPerformanceMetric } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';

/**
 * Admin Data Sources CRUD API
 * Manages data source definitions stored in the database
 */

// GET - List all data sources
const getDataSourcesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);

  logger.info('Data sources list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
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
      }
    };

    logPerformanceMetric(logger, 'data_sources_list', Date.now() - startTime);

    return createSuccessResponse(responseData, 'Data sources retrieved successfully');
    
  } catch (error) {
    logger.error('Data sources list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new data source
const createDataSourceHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);

  logger.info('Data source creation request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Validate request body
    const createData = await validateRequest(request, dataSourceCreateRefinedSchema);

    // Create service instance and create data source
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const newDataSource = await dataSourcesService.createDataSource(createData);

    logPerformanceMetric(logger, 'data_source_create', Date.now() - startTime);

    return createSuccessResponse(newDataSource, 'Data source created successfully');
    
  } catch (error) {
    logger.error('Data source creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(getDataSourcesHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api'
});

export const POST = rbacRoute(createDataSourceHandler, {
  permission: ['data-sources:create:organization', 'data-sources:create:all'],
  rateLimit: 'api'
});
