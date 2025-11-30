import { useQuery } from '@tanstack/react-query';
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

export interface UsePublishedDashboardsReturn {
  dashboards: PublishedDashboard[];
  defaultDashboard: PublishedDashboard | null;
  loading: boolean;
  error: string | null;
  refreshDashboards: () => void;
}

/**
 * Hook to fetch and manage published dashboards for navigation
 *
 * Uses React Query for:
 * - Query deduplication (multiple components share single API call)
 * - Automatic caching (5 minute stale time)
 * - Background refetching
 *
 * Note: Logging is handled server-side in the API route.
 */
export function usePublishedDashboards(): UsePublishedDashboardsReturn {
  const query = useQuery({
    queryKey: ['dashboards', 'published', 'active'],
    queryFn: async () => {
      // Fetch only published and active dashboards
      // API route handles all logging server-side
      const result = await apiClient.get<{
        dashboards: PublishedDashboard[];
      }>('/api/admin/analytics/dashboards?is_published=true&is_active=true');

      return result.dashboards || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - prevents excessive refetches
    gcTime: 10 * 60 * 1000, // 10 minutes - cache retention
  });

  // Find the default dashboard from query data
  const defaultDashboard = query.data?.find((d) => d.is_default === true) || null;

  return {
    dashboards: query.data || [],
    defaultDashboard,
    loading: query.isLoading,
    error: query.error?.message || null,
    refreshDashboards: () => query.refetch(),
  };
}
