import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Data Source Configuration API
 * Provides dynamic data source and column configurations from database
 */
const dataSourceConfigHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Data source configuration request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get('table') || 'agg_app_measures';
    const schemaName = searchParams.get('schema') || 'ih';

    // Get data source configuration from database
    const dataSourceConfig = await chartConfigService.getDataSourceConfig(tableName, schemaName);

    if (!dataSourceConfig) {
      return createErrorResponse(`Data source not found: ${schemaName}.${tableName}`, 404);
    }

    // Get filterable, groupable, and measure fields
    const filterableFields = dataSourceConfig.columns.filter((col) => col.isFilterable);
    const groupableFields = dataSourceConfig.columns.filter((col) => col.isGroupable);
    const measureFields = dataSourceConfig.columns.filter((col) => col.isMeasure);
    const dimensionFields = dataSourceConfig.columns.filter((col) => col.isDimension);

    // Get available measures and frequencies dynamically
    const availableMeasures = await chartConfigService.getAvailableMeasures(tableName, schemaName);
    const availableFrequencies = await chartConfigService.getAvailableFrequencies(
      tableName,
      schemaName
    );

    const configData = {
      dataSource: dataSourceConfig,
      fieldCategories: {
        filterable: filterableFields,
        groupable: groupableFields,
        measures: measureFields,
        dimensions: dimensionFields,
      },
      availableOptions: {
        measures: availableMeasures,
        frequencies: availableFrequencies,
      },
      metadata: {
        totalColumns: dataSourceConfig.columns.length,
        filterableCount: filterableFields.length,
        measureCount: measureFields.length,
        generatedAt: new Date().toISOString(),
      },
    };

    log.info('Data source config loaded', { duration: Date.now() - startTime });

    return createSuccessResponse(configData, 'Data source configuration retrieved successfully');
  } catch (error) {
    log.error('Data source configuration error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(dataSourceConfigHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
