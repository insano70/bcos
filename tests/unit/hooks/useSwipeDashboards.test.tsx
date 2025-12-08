/**
 * useSwipeDashboards Hook Tests
 *
 * Tests for the hook that fetches dashboards with charts for swipe mode.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSwipeDashboards } from '@/lib/hooks/use-swipe-dashboards';
import { apiClient } from '@/lib/api/client';
import type { DashboardWithCharts } from '@/lib/types/dashboards';

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Create a fresh query client for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useSwipeDashboards', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Partial mock data - useSwipeDashboards only uses a subset of fields
  const mockDashboards = [
    {
      dashboard_id: 'dash-1',
      dashboard_name: 'Revenue Dashboard',
      dashboard_description: 'Revenue metrics',
      is_published: true,
      is_active: true,
      organization_id: 'org-1',
      layout_config: {},
      created_by: 'user-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      is_default: false,
      chart_count: 5,
      charts: [
        {
          chart_definition_id: 'chart-1',
          chart_name: 'Monthly Revenue',
          chart_type: 'bar',
          chart_description: 'Monthly revenue chart',
          position_config: { x: 0, y: 0, w: 6, h: 4 },
        },
        {
          chart_definition_id: 'chart-2',
          chart_name: 'Revenue by Provider',
          chart_type: 'pie',
          chart_description: 'Provider breakdown',
          position_config: { x: 6, y: 0, w: 6, h: 4 },
        },
      ],
    },
    {
      dashboard_id: 'dash-2',
      dashboard_name: 'Patient Dashboard',
      dashboard_description: 'Patient metrics',
      is_published: true,
      is_active: true,
      organization_id: 'org-1',
      layout_config: {},
      created_by: 'user-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      is_default: false,
      chart_count: 3,
      charts: [
        {
          chart_definition_id: 'chart-3',
          chart_name: 'Patient Count',
          chart_type: 'line',
          chart_description: 'Patient count over time',
          position_config: { x: 0, y: 0, w: 12, h: 4 },
        },
      ],
    },
  ] as DashboardWithCharts[];

  const mockEmptyDashboard = {
    dashboard_id: 'dash-empty',
    dashboard_name: 'Empty Dashboard',
    dashboard_description: 'No charts',
    is_published: true,
    is_active: true,
    organization_id: 'org-1',
    layout_config: {},
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_default: false,
    chart_count: 0,
    charts: [],
    dashboard_category_id: undefined,
    category: undefined,
    creator: { user_id: 'user-1', user_first_name: 'Test', user_last_name: 'User' },
  } as unknown as DashboardWithCharts;

  it('should fetch dashboards successfully', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: mockDashboards,
    });

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(2);
    const data = result.current.data;
    expect(data?.[0]?.dashboard_id).toBe('dash-1');
    expect(data?.[1]?.dashboard_id).toBe('dash-2');
  });

  it('should filter out dashboards with zero charts', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: [...mockDashboards, mockEmptyDashboard],
    });

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should not include the empty dashboard
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.find((d) => d.chart_count === 0)).toBeUndefined();
  });

  it('should call correct API endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: [],
    });

    renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/admin/analytics/dashboards?is_published=true&is_active=true'
    );
  });

  it('should not fetch when disabled', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: mockDashboards,
    });

    const { result } = renderHook(() => useSwipeDashboards({ enabled: false }), {
      wrapper: createWrapper(queryClient),
    });

    // Wait a bit to ensure no fetch happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.isPending).toBe(true);
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('should handle API errors', async () => {
    const error = new Error('API Error');
    vi.mocked(apiClient.get).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('API Error');
  });

  it('should handle empty response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: [],
    });

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(0);
  });

  it('should handle missing dashboards property in response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({});

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should return empty array when dashboards is undefined
    expect(result.current.data).toHaveLength(0);
  });

  it('should include charts in dashboard objects', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: mockDashboards,
    });

    const { result } = renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const firstDashboard = result.current.data?.[0];
    expect(firstDashboard?.charts).toHaveLength(2);
    expect(firstDashboard?.charts?.[0]?.chart_definition_id).toBe('chart-1');
    expect(firstDashboard?.charts?.[0]?.chart_type).toBe('bar');
  });

  it('should use correct query key', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      dashboards: mockDashboards,
    });

    renderHook(() => useSwipeDashboards(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalled();
    });

    // Check that the query is cached under the correct key
    const queryState = queryClient.getQueryState(['dashboards', 'swipe-mode', 'with-charts']);
    expect(queryState).toBeDefined();
  });
});

