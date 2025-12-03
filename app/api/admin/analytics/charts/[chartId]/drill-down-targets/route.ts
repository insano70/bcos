/**
 * Drill-Down Target Charts API
 *
 * GET /api/admin/analytics/charts/:chartId/drill-down-targets
 *
 * Returns charts compatible as drill-down targets for the source chart.
 * Compatible targets share the same data source to ensure filter fields match.
 * Excludes the source chart itself.
 */

import type { NextRequest } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { db } from '@/lib/db';
import { chart_definitions } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { DrillDownTargetChart } from '@/lib/types/drill-down';

interface RouteParams {
  params: Promise<{ chartId: string }>;
}

/**
 * GET handler - List charts compatible as drill-down targets
 */
const getDrillDownTargetsHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as RouteParams;
  const params = await paramsPromise;
  const startTime = Date.now();

  try {
    const chartId = params.chartId;

    // First get the source chart to find its data source
    // Note: chart_definitions don't have organization_id directly - 
    // access control is handled via RBAC permissions and the data source
    // filters data at query time via practice_uids
    const sourceChart = await db
      .select({
        chart_definition_id: chart_definitions.chart_definition_id,
        data_source_id: chart_definitions.data_source_id,
      })
      .from(chart_definitions)
      .where(eq(chart_definitions.chart_definition_id, chartId))
      .limit(1);

    const firstChart = sourceChart[0];
    if (!firstChart) {
      return createErrorResponse('Source chart not found', 404);
    }

    const dataSourceId = firstChart.data_source_id;

    if (!dataSourceId) {
      // If source chart has no data source, return empty list
      log.info('Source chart has no data source, no targets available', {
        chartId,
        operation: 'get_drill_down_targets',
        component: 'analytics',
      });

      return createSuccessResponse<{ targets: DrillDownTargetChart[] }>({
        targets: [],
      });
    }

    // Find all active charts with the same data source, excluding the source chart
    // Data isolation is handled at:
    // 1. RBAC level - permission 'charts:read:organization' controls access
    // 2. Data source level - queries filter by practice_uids at runtime
    const targetCharts = await db
      .select({
        chart_definition_id: chart_definitions.chart_definition_id,
        chart_name: chart_definitions.chart_name,
        chart_type: chart_definitions.chart_type,
        data_source_id: chart_definitions.data_source_id,
      })
      .from(chart_definitions)
      .where(
        and(
          eq(chart_definitions.data_source_id, dataSourceId),
          ne(chart_definitions.chart_definition_id, chartId),
          eq(chart_definitions.is_active, true)
        )
      )
      .orderBy(sql`chart_name ASC`);

    const targets: DrillDownTargetChart[] = targetCharts.map((chart) => ({
      chartDefinitionId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      dataSourceId: chart.data_source_id as number,
    }));

    const duration = Date.now() - startTime;

    log.info('Drill-down targets retrieved', {
      chartId,
      dataSourceId,
      targetCount: targets.length,
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      operation: 'get_drill_down_targets',
      component: 'analytics',
    });

    return createSuccessResponse({ targets });
  } catch (error) {
    log.error('Failed to get drill-down targets', error as Error, {
      chartId: params.chartId,
      userId: userContext.user_id,
      operation: 'get_drill_down_targets',
      component: 'analytics',
    });
    return createErrorResponse('Failed to get drill-down targets', 500);
  }
};

export const GET = rbacRoute(getDrillDownTargetsHandler, {
  permission: 'charts:read:organization',
  rateLimit: 'api',
});

