/**
 * Fullscreen Swipe Context Tests
 *
 * Tests for the fullscreen swipe mode context provider and hooks.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  FullscreenSwipeProvider,
  useFullscreenSwipe,
  useOpenSwipeMode,
} from '@/app/fullscreen-swipe-context';
import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';

// Wrapper component for testing hooks that require the provider
function TestWrapper({ children }: { children: ReactNode }) {
  return <FullscreenSwipeProvider>{children}</FullscreenSwipeProvider>;
}

describe('FullscreenSwipeContext', () => {
  describe('useFullscreenSwipe', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useFullscreenSwipe());
      }).toThrow('useFullscreenSwipe must be used within a FullscreenSwipeProvider');

      consoleSpy.mockRestore();
    });

    it('should return initial state values', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.currentDashboardId).toBeNull();
      expect(result.current.currentChartIndex).toBe(0);
      expect(result.current.universalFilters).toBeNull();
      expect(result.current.showOverlay).toBe(true);
    });

    it('should update isOpen state', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      act(() => {
        result.current.setIsOpen(true);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should update currentDashboardId state', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      act(() => {
        result.current.setCurrentDashboardId('dashboard-123');
      });

      expect(result.current.currentDashboardId).toBe('dashboard-123');
    });

    it('should update currentChartIndex state', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      act(() => {
        result.current.setCurrentChartIndex(3);
      });

      expect(result.current.currentChartIndex).toBe(3);
    });

    it('should update universalFilters state', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      const filters: DashboardUniversalFilters = {
        dateRangePreset: 'last_30_days',
        organizationId: 'org-123',
      };

      act(() => {
        result.current.setUniversalFilters(filters);
      });

      expect(result.current.universalFilters).toEqual(filters);
    });

    it('should update showOverlay state', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      // Initially true
      expect(result.current.showOverlay).toBe(true);

      act(() => {
        result.current.setShowOverlay(false);
      });

      expect(result.current.showOverlay).toBe(false);
    });

    it('should support functional state updates', () => {
      const { result } = renderHook(() => useFullscreenSwipe(), {
        wrapper: TestWrapper,
      });

      act(() => {
        result.current.setCurrentChartIndex(5);
      });

      act(() => {
        result.current.setCurrentChartIndex((prev) => prev + 1);
      });

      expect(result.current.currentChartIndex).toBe(6);
    });
  });

  describe('useOpenSwipeMode', () => {
    it('should open swipe mode with dashboard ID', () => {
      const { result } = renderHook(
        () => ({
          context: useFullscreenSwipe(),
          openSwipeMode: useOpenSwipeMode(),
        }),
        { wrapper: TestWrapper }
      );

      act(() => {
        result.current.openSwipeMode({
          dashboardId: 'dashboard-456',
        });
      });

      expect(result.current.context.isOpen).toBe(true);
      expect(result.current.context.currentDashboardId).toBe('dashboard-456');
      expect(result.current.context.currentChartIndex).toBe(0);
      expect(result.current.context.universalFilters).toBeNull();
    });

    it('should open swipe mode with chart index', () => {
      const { result } = renderHook(
        () => ({
          context: useFullscreenSwipe(),
          openSwipeMode: useOpenSwipeMode(),
        }),
        { wrapper: TestWrapper }
      );

      act(() => {
        result.current.openSwipeMode({
          dashboardId: 'dashboard-789',
          chartIndex: 3,
        });
      });

      expect(result.current.context.isOpen).toBe(true);
      expect(result.current.context.currentDashboardId).toBe('dashboard-789');
      expect(result.current.context.currentChartIndex).toBe(3);
    });

    it('should open swipe mode with universal filters', () => {
      const { result } = renderHook(
        () => ({
          context: useFullscreenSwipe(),
          openSwipeMode: useOpenSwipeMode(),
        }),
        { wrapper: TestWrapper }
      );

      const filters: DashboardUniversalFilters = {
        dateRangePreset: 'last_7_days',
        practiceUids: [1, 2, 3],
      };

      act(() => {
        result.current.openSwipeMode({
          dashboardId: 'dashboard-xyz',
          universalFilters: filters,
        });
      });

      expect(result.current.context.isOpen).toBe(true);
      expect(result.current.context.universalFilters).toEqual(filters);
    });

    it('should handle all parameters together', () => {
      const { result } = renderHook(
        () => ({
          context: useFullscreenSwipe(),
          openSwipeMode: useOpenSwipeMode(),
        }),
        { wrapper: TestWrapper }
      );

      const filters: DashboardUniversalFilters = {
        providerName: 'Dr. Smith',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      act(() => {
        result.current.openSwipeMode({
          dashboardId: 'complete-test',
          chartIndex: 7,
          universalFilters: filters,
        });
      });

      expect(result.current.context.isOpen).toBe(true);
      expect(result.current.context.currentDashboardId).toBe('complete-test');
      expect(result.current.context.currentChartIndex).toBe(7);
      expect(result.current.context.universalFilters).toEqual(filters);
    });
  });
});

