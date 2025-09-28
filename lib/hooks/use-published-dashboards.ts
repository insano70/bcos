import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api/client';
import { createAppLogger } from '@/lib/logger/factory';

export interface PublishedDashboard {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description?: string;
  created_at: string;
  updated_at: string;
}

const logger = createAppLogger('use-published-dashboards', {
  component: 'hooks',
  feature: 'dashboard-navigation'
});

/**
 * Hook to fetch and manage published dashboards for navigation
 */
export function usePublishedDashboards() {
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPublishedDashboards();
  }, []);

  const loadPublishedDashboards = async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.info('Loading published dashboards for navigation', {
        timestamp: new Date().toISOString()
      });

      // Fetch only published and active dashboards
      const result = await apiClient.get<{
        dashboards: PublishedDashboard[];
      }>('/api/admin/analytics/dashboards?is_published=true&is_active=true');

      const publishedDashboards = result.dashboards || [];
      
      logger.info('Published dashboards loaded successfully', {
        count: publishedDashboards.length,
        dashboardIds: publishedDashboards.map(d => d.dashboard_id)
      });

      setDashboards(publishedDashboards);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load published dashboards';
      
      logger.error('Failed to load published dashboards', err, {
        operation: 'load-published-dashboards'
      });

      setError(errorMessage);
      setDashboards([]); // Ensure we have an empty array on error
    } finally {
      setLoading(false);
    }
  };

  const refreshDashboards = () => {
    loadPublishedDashboards();
  };

  return {
    dashboards,
    loading,
    error,
    refreshDashboards
  };
}
