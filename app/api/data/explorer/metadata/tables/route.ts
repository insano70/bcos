import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { metadataTablesQuerySchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const getTablesHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams.entries());
    const query = metadataTablesQuerySchema.parse(rawParams);

    const metadataService = createRBACExplorerMetadataService(userContext);

    const tier = query.tier !== undefined && (query.tier === 1 || query.tier === 2 || query.tier === 3) ? query.tier : undefined;

    const tables = await metadataService.getTableMetadata({
      schema_name: query.schema_name,
      ...(tier !== undefined && { tier }),
      ...(query.is_active !== undefined && { is_active: query.is_active }),
      ...(query.search !== undefined && { search: query.search }),
      limit: query.limit,
      offset: query.offset,
    });

    const totalCount = await metadataService.getTableMetadataCount({
      schema_name: query.schema_name,
      ...(tier !== undefined && { tier }),
      ...(query.is_active !== undefined && { is_active: query.is_active }),
      ...(query.search !== undefined && { search: query.search }),
    });

    const tablesWithCompleteness = tables.map((table) => ({
      ...table,
      completeness: metadataService.calculateCompleteness(table),
    }));

    const duration = Date.now() - startTime;

    log.info('Table metadata list query completed', {
      operation: 'data_explorer_list_metadata',
      resourceType: 'data_explorer_metadata',
      userId: userContext.user_id,
      results: { returned: tables.length, total: totalCount },
      duration,
      component: 'business-logic',
    });

    return createPaginatedResponse(tablesWithCompleteness, {
      page: Math.floor((query.offset || 0) / (query.limit || 1000)) + 1,
      limit: query.limit || 1000,
      total: totalCount,
    });
  } catch (error) {
    log.error('Table metadata list query failed', error as Error, {
      operation: 'data_explorer_list_metadata',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => issue.message).join(', ');
      return createErrorResponse(`Validation failed: ${errorMessages}`, 400, request);
    }

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

const createTableHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  try {
    const body = await request.json();
    const schema_name = body.schema_name || 'ih';
    const table_name = body.table_name;
    const display_name = body.display_name;
    const description = body.description;
    const tier = body.tier;

    if (!table_name) {
      return createErrorResponse('table_name is required', 400, request);
    }

    const metadataService = createRBACExplorerMetadataService(userContext);
    const created = await metadataService.createTableMetadata({
      schema_name,
      table_name,
      display_name,
      description,
      tier,
    });

    log.info('Table metadata created', {
      operation: 'data_explorer_create_table_metadata',
      resourceType: 'data_explorer_metadata',
      resourceId: created.table_metadata_id,
      userId: userContext.user_id,
      tableName: `${schema_name}.${table_name}`,
      component: 'business-logic',
    });

    return createSuccessResponse(created, 'Table metadata created successfully');
  } catch (error) {
    log.error('Create table metadata failed', error as Error, {
      operation: 'data_explorer_create_table_metadata',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getTablesHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createTableHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

