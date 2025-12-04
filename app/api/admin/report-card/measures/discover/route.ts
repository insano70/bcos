import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Discover available measure combinations from analytics database
 *
 * Returns distinct combinations of measure + entity_name (and other filterable columns)
 * that can be used to configure report card measures.
 */

interface MeasureCombination {
  measure: string;
  entity_name: string | null;
  entity_type: string | null;
  row_count: number;
}

// GET - Discover available measures from analytics DB
const discoverMeasuresHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Query analytics database for distinct measure combinations
    const query = `
      SELECT 
        measure,
        entity_name,
        entity_type,
        COUNT(*) as row_count
      FROM ih.agg_chart_data
      WHERE time_period = 'Monthly'
        AND practice_uid IS NOT NULL
        AND numeric_value IS NOT NULL
      GROUP BY measure, entity_name, entity_type
      ORDER BY measure, entity_name NULLS FIRST, entity_type NULLS FIRST
    `;

    const rows = await executeAnalyticsQuery<{
      measure: string;
      entity_name: string | null;
      entity_type: string | null;
      row_count: string;
    }>(query, []);

    // Transform to typed response
    const combinations: MeasureCombination[] = rows.map((row) => ({
      measure: row.measure,
      entity_name: row.entity_name,
      entity_type: row.entity_type,
      row_count: parseInt(row.row_count, 10),
    }));

    // Also get distinct column names that could be used for filtering
    const columnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'ih'
        AND table_name = 'agg_chart_data'
        AND data_type IN ('text', 'character varying', 'integer', 'numeric')
      ORDER BY ordinal_position
    `;

    const columnRows = await executeAnalyticsQuery<{ column_name: string }>(columnQuery, []);
    const filterableColumns = columnRows.map((r) => r.column_name);

    const duration = Date.now() - startTime;

    log.info('Discovered measure combinations from analytics DB', {
      operation: 'discover_measures',
      combinationCount: combinations.length,
      filterableColumnCount: filterableColumns.length,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      {
        combinations,
        filterable_columns: filterableColumns,
        source_table: 'ih.agg_chart_data',
      },
      'Measure combinations discovered successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to discover measures', error as Error, {
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

export const GET = rbacRoute(discoverMeasuresHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});


