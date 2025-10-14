/**
 * useDashboardData Hook Unit Tests
 *
 * Phase 7: Unit tests for the useDashboardData hook
 * Tests loading states, error states, cache bypass, and refetch functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardData, type DashboardUniversalFilters } from '@/hooks/use-dashboard-data';
import { apiClient } from '@/lib/api/client';

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

// Mock React's useState and useEffect for controlled testing
const mockApiClient = vi.mocked(apiClient);

describe('useDashboardData Hook', () => {
  let mockPost: vi.MockedFunction<typeof apiClient.post>;

  beforeEach(() => {
    mockPost = mockApiClient.post as vi.MockedFunction<typeof apiClient.post>;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial loading state', () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          enabled: false, // Disable to prevent API call
        })
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.metrics).toBeNull();
    });
  });

  describe('Successful Data Fetch', () => {
    const mockResponse = {
      charts: {
        'chart-1': {
          chartData: {
            labels: ['Jan', 'Feb', 'Mar'],
            datasets: [{ label: 'Revenue', data: [100, 200, 300] }],
          },
          rawData: [{ month: 'Jan', revenue: 100 }],
          metadata: {
            chartType: 'line',
            dataSourceId: 1,
            transformedAt: new Date().toISOString(),
            queryTimeMs: 50,
            cacheHit: false,
            recordCount: 3,
            transformDuration: 10,
          },
        },
      },
      metadata: {
        totalQueryTime: 100,
        cacheHits: 0,
        cacheMisses: 1,
        queriesExecuted: 1,
        chartsRendered: 1,
        dashboardFiltersApplied: ['startDate', 'endDate'],
        parallelExecution: true,
      },
    };

    beforeEach(() => {
      mockPost.mockResolvedValue(mockResponse);
    });

    it('should fetch data successfully and update state', async () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for data to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(result.current.error).toBeNull();
      expect(result.current.metrics).toEqual({
        totalTime: expect.any(Number),
        cacheHitRate: 0,
        chartsRendered: 1,
      });
    });

    it('should handle universal filters correctly', async () => {
      const filters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: 'org-123',
      };

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          universalFilters: filters,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/admin/analytics/dashboard/test-dashboard/render',
        {
          universalFilters: filters,
          chartOverrides: {},
          nocache: false,
        }
      );
    });

    it('should support cache bypass via nocache parameter', async () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          nocache: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/admin/analytics/dashboard/test-dashboard/render?nocache=true',
        expect.objectContaining({
          nocache: true,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const errorMessage = 'Failed to load dashboard data';
      mockPost.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.data).toBeNull();
      expect(result.current.metrics).toBeNull();
    });

    it('should handle network errors', async () => {
      mockPost.mockRejectedValue(new Error('Network Error'));

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network Error');
    });

    it('should handle AbortError silently', async () => {
      mockPost.mockRejectedValue(new Error('Request aborted'));

      // Mock AbortError (name property)
      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';
      mockPost.mockRejectedValue(abortError);

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      // Should remain loading when aborted
      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Refetch Functionality', () => {
    const mockResponse = {
      charts: {},
      metadata: {
        totalQueryTime: 50,
        cacheHits: 1,
        cacheMisses: 0,
        queriesExecuted: 1,
        chartsRendered: 0,
        dashboardFiltersApplied: [],
        parallelExecution: true,
      },
    };

    beforeEach(() => {
      mockPost.mockResolvedValue(mockResponse);
    });

    it('should support manual refetch', async () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Reset mock to track refetch calls
      mockPost.mockClear();
      mockPost.mockResolvedValue({ ...mockResponse, metadata: { ...mockResponse.metadata, totalQueryTime: 75 } });

      // Trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(result.current.metrics?.totalTime).toBeGreaterThan(0);
    });

    it('should support cache bypass in refetch', async () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPost.mockClear();

      // Trigger refetch with cache bypass
      await act(async () => {
        await result.current.refetch(true);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/admin/analytics/dashboard/test-dashboard/render?nocache=true',
        expect.objectContaining({
          nocache: true,
        })
      );
    });
  });

  describe('Filter Changes', () => {
    it('should refetch when universal filters change', async () => {
      const initialFilters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
      };

      let currentFilters = initialFilters;

      const { result, rerender } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          universalFilters: currentFilters,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      mockPost.mockClear();

      // Change filters
      currentFilters = {
        ...currentFilters,
        endDate: '2024-12-31',
      };

      rerender();

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledTimes(1);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/admin/analytics/dashboard/test-dashboard/render',
        expect.objectContaining({
          universalFilters: currentFilters,
        })
      );
    });

    it('should handle chart overrides', async () => {
      const chartOverrides = {
        'chart-1': { measure: 'revenue', frequency: 'monthly' },
      };

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          chartOverrides,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/api/admin/analytics/dashboard/test-dashboard/render',
        expect.objectContaining({
          chartOverrides,
        })
      );
    });
  });

  describe('Disabled State', () => {
    it('should not fetch data when disabled', async () => {
      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
          enabled: false,
        })
      );

      // Should remain in loading state without making API call
      expect(result.current.isLoading).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate cache hit rate correctly', async () => {
      mockPost.mockResolvedValue({
        charts: {},
        metadata: {
          totalQueryTime: 200,
          cacheHits: 2,
          cacheMisses: 1,
          queriesExecuted: 3,
          chartsRendered: 0,
          dashboardFiltersApplied: [],
          parallelExecution: true,
        },
      });

      const { result } = renderHook(() =>
        useDashboardData({
          dashboardId: 'test-dashboard',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.metrics).toEqual({
        totalTime: expect.any(Number),
        cacheHitRate: 67, // (2/3) * 100 rounded
        chartsRendered: 0,
      });
    });
  });
});
