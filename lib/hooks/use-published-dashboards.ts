import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';

export interface PublishedDashboard {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description?: string;
  organization_id?: string; // undefined = universal, UUID = org-specific
  created_at: string;
  updated_at: string;
  is_default?: boolean;
}

/**
 * Hook to fetch and manage published dashboards for navigation
 *
 * Note: Logging is handled server-side in the API route.
 * Client-side logging removed per best practices:
 * - Reduces browser bundle size
 * - Prevents PII exposure in browser console
 * - Server logs already capture all API calls
 */
export function usePublishedDashboards() {
  const [dashboards, setDashboards] = useState<PublishedDashboard[]>([]);
  const [defaultDashboard, setDefaultDashboard] = useState<PublishedDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPublishedDashboards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch only published and active dashboards
      // API route handles all logging server-side
      const result = await apiClient.get<{
        dashboards: PublishedDashboard[];
      }>('/api/admin/analytics/dashboards?is_published=true&is_active=true');

      const publishedDashboards = result.dashboards || [];

      // Find the default dashboard
      const defaultDash = publishedDashboards.find((d) => d.is_default === true);

      setDashboards(publishedDashboards);
      setDefaultDashboard(defaultDash || null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load published dashboards';

      // Use React error state instead of logging
      // Server already logs the API error
      setError(errorMessage);
      setDashboards([]); // Ensure we have an empty array on error
      setDefaultDashboard(null);
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
    defaultDashboard,
    loading,
    error,
    refreshDashboards,
  };
}
