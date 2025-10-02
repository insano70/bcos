import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import { log } from '@/lib/logger';

export interface PublishedDashboard {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch and manage published dashboards for navigation
 */
export function usePublishedDashboards() {
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPublishedDashboards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      log.info('Loading published dashboards for navigation', {
        timestamp: new Date().toISOString(),
        component: 'hooks',
        feature: 'dashboard-navigation',
      });

      // Fetch only published and active dashboards
      const result = await apiClient.get<{
        dashboards: PublishedDashboard[];
      }>('/api/admin/analytics/dashboards?is_published=true&is_active=true');

      const publishedDashboards = result.dashboards || [];

      log.info('Published dashboards loaded successfully', {
        count: publishedDashboards.length,
        dashboardIds: publishedDashboards.map((d) => d.dashboard_id),
        component: 'hooks',
        feature: 'dashboard-navigation',
      });

      setDashboards(publishedDashboards);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load published dashboards';

      log.error('Failed to load published dashboards', err instanceof Error ? err : new Error(String(err)), {
        operation: 'load-published-dashboards',
        component: 'hooks',
        feature: 'dashboard-navigation',
      });

      setError(errorMessage);
      setDashboards([]); // Ensure we have an empty array on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublishedDashboards();
  }, [loadPublishedDashboards]);

  const refreshDashboards = () => {
    loadPublishedDashboards();
  };

  return {
    dashboards,
    loading,
    error,
    refreshDashboards,
  };
}
