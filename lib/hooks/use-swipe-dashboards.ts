/**
 * useSwipeDashboards Hook
 *
 * Fetch dashboards with full chart details for swipe mode.
 *
 * Why not reuse usePublishedDashboards:
 * - usePublishedDashboards returns PublishedDashboard (no charts array)
 * - Swipe mode needs DashboardWithCharts with full chart metadata
 *
 * IMPORTANT: The list API returns dashboards with EMPTY charts[] array
 * (for performance optimization). We must fetch individual dashboard
 * details to get the actual charts.
 *
 * Flow:
 * 1. Fetch dashboard list (with chart_count but empty charts[])
 * 2. For each dashboard with chart_count > 0, fetch full details
 * 3. Return dashboards with populated charts[]
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DashboardWithCharts } from '@/lib/types/dashboards';

interface UseSwipeDashboardsOptions {
  /** Enable/disable fetching (default: true) */
  enabled?: boolean;
}

/**
 * Fetch dashboards with charts for fullscreen swipe mode
 *
 * @param options - Hook configuration options
 * @returns Query result with dashboards array (with full chart details)
 *
 * @example
 * ```tsx
 * const { data: dashboards = [], isLoading } = useSwipeDashboards({
 *   enabled: isSwipeModeOpen,
 * });
 * ```
 */
export function useSwipeDashboards(options?: UseSwipeDashboardsOptions) {
  return useQuery({
    queryKey: ['dashboards', 'swipe-mode', 'with-charts'],
    queryFn: async (): Promise<DashboardWithCharts[]> => {
      // Step 1: Get dashboard list (charts[] will be empty - this is by design)
      const listResult = await apiClient.get<{ dashboards: DashboardWithCharts[] }>(
        '/api/admin/analytics/dashboards?is_published=true&is_active=true'
      );

      // Filter to dashboards that have at least one chart
      const dashboardsWithCharts = (listResult.dashboards || []).filter((d) => d.chart_count > 0);

      if (dashboardsWithCharts.length === 0) {
        return [];
      }

      // Step 2: Fetch full details for each dashboard (parallel requests)
      // The individual dashboard endpoint returns { dashboard, charts } as SEPARATE fields
      // We must merge them to create DashboardWithCharts
      const detailPromises = dashboardsWithCharts.map((dashboard) =>
        apiClient
          .get<{
            dashboard: Omit<DashboardWithCharts, 'charts'>;
            charts: DashboardWithCharts['charts'];
          }>(`/api/admin/analytics/dashboards/${dashboard.dashboard_id}`)
          .then((res) => ({
            ...res.dashboard,
            charts: res.charts, // Merge charts back into dashboard object
          }))
          .catch(() => null) // Gracefully handle individual failures
      );

      const dashboardDetails = await Promise.all(detailPromises);

      // Filter out any failed fetches and dashboards that ended up with no charts
      return dashboardDetails.filter(
        (d): d is DashboardWithCharts => d !== null && d.charts && d.charts.length > 0
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: options?.enabled ?? true,
  });
}

