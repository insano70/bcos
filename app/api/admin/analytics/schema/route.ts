import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Schema Information
 * Provides information about available fields and data types in analytics tables
 */
const schemaHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Analytics schema request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const { searchParams } = new URL(request.url);
    const dataSourceIdParam = searchParams.get('data_source_id');
    let tableName = searchParams.get('table') || 'agg_app_measures';
    let schemaName = searchParams.get('schema') || 'ih';

    log.debug('loading schema from database configuration', { tableName, schemaName });

    // If data_source_id is provided, load the data source configuration
    if (dataSourceIdParam) {
      const dataSourceId = parseInt(dataSourceIdParam, 10);
      const { db, chart_data_sources } = await import('@/lib/db');
      const { eq } = await import('drizzle-orm');

      const [dataSource] = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, dataSourceId))
        .limit(1);

      if (dataSource) {
        tableName = dataSource.table_name;
        schemaName = dataSource.schema_name;
      }
    }

    // Load data source configuration from database
    const dataSourceConfig = await chartConfigService.getDataSourceConfig(tableName, schemaName);

    if (!dataSourceConfig) {
      return createErrorResponse(
        `Data source configuration not found: ${schemaName}.${tableName}`,
        404
      );
    }

    // Get available measures, frequencies, and groupable fields from database config
    const availableMeasures = await chartConfigService.getAvailableMeasures(tableName, schemaName);
    const availableFrequencies = await chartConfigService.getAvailableFrequencies(
      tableName,
      schemaName
    );
    const groupableFields = await chartConfigService.getGroupableFields(tableName, schemaName);

    // Convert database column configurations to API format
    const fieldDefinitions: Record<
      string,
      {
        name: string;
        type: string;
        description: string;
        example?: string | null | undefined;
        groupable: boolean;
        filterable: boolean;
        aggregatable: boolean;
        allowedValues?: unknown | null;
      }
    > = {};

    for (const column of dataSourceConfig.columns) {
      fieldDefinitions[column.columnName] = {
        name: column.displayName,
        type: column.dataType,
        description: column.description || `${column.displayName} field from analytics data`,
        example: column.exampleValue,
        groupable: column.isGroupable,
        filterable: column.isFilterable,
        aggregatable: column.isMeasure,
        allowedValues: column.allowedValues,
      };
    }

    const schemaInfo = {
      tableName: `${dataSourceConfig.schemaName}.${dataSourceConfig.tableName}`,
      description: dataSourceConfig.description || 'Analytics data source',
      totalColumns: dataSourceConfig.columns.length,
      fields: fieldDefinitions,
      availableMeasures: availableMeasures.map((measure) => ({ measure })),
      availableFrequencies: availableFrequencies.map((frequency) => ({ frequency })),
      availableGroupByFields: groupableFields.map((field) => ({
        columnName: field.columnName,
        displayName: field.displayName,
      })),
      dataSource: dataSourceConfig,
    };

    log.debug('schema information compiled', {
      fieldCount: Object.keys(fieldDefinitions).length,
      measureCount: availableMeasures.length,
      frequencyCount: availableFrequencies.length,
      groupByFieldCount: groupableFields.length,
    });

    log.info('Analytics schema query completed', { duration: Date.now() - startTime });

    return createSuccessResponse(schemaInfo, 'Analytics schema information retrieved successfully');
  } catch (error) {
    log.error('Analytics schema error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(schemaHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
