/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChartSwapping } from '@/hooks/useChartSwapping';

// Mock the debug client
vi.mock('@/lib/utils/debug-client', () => ({
  clientDebugLog: {
    component: vi.fn(),
  },
}));

describe('useChartSwapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with an empty swappedCharts Map', () => {
      const { result } = renderHook(() => useChartSwapping());

      expect(result.current.swappedCharts).toBeInstanceOf(Map);
      expect(result.current.swappedCharts.size).toBe(0);
    });

    it('should provide stable handler references', () => {
      const { result, rerender } = renderHook(() => useChartSwapping());

      const initialHandleChartSwap = result.current.handleChartSwap;
      const initialHandleRevertSwap = result.current.handleRevertSwap;
      const initialClearAllSwaps = result.current.clearAllSwaps;

      rerender();

      expect(result.current.handleChartSwap).toBe(initialHandleChartSwap);
      expect(result.current.handleRevertSwap).toBe(initialHandleRevertSwap);
      expect(result.current.clearAllSwaps).toBe(initialClearAllSwaps);
    });
  });

  describe('handleChartSwap', () => {
    it('should add a chart swap mapping', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
      });

      expect(result.current.swappedCharts.size).toBe(1);
      expect(result.current.swappedCharts.get('source-chart-1')).toBe('target-chart-1');
    });

    it('should support multiple chart swaps', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
        result.current.handleChartSwap('source-chart-2', 'target-chart-2');
        result.current.handleChartSwap('source-chart-3', 'target-chart-3');
      });

      expect(result.current.swappedCharts.size).toBe(3);
      expect(result.current.swappedCharts.get('source-chart-1')).toBe('target-chart-1');
      expect(result.current.swappedCharts.get('source-chart-2')).toBe('target-chart-2');
      expect(result.current.swappedCharts.get('source-chart-3')).toBe('target-chart-3');
    });

    it('should override previous swap for same source chart', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
      });

      expect(result.current.swappedCharts.get('source-chart-1')).toBe('target-chart-1');

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-2');
      });

      expect(result.current.swappedCharts.size).toBe(1);
      expect(result.current.swappedCharts.get('source-chart-1')).toBe('target-chart-2');
    });
  });

  describe('handleRevertSwap', () => {
    it('should remove a specific chart swap', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
        result.current.handleChartSwap('source-chart-2', 'target-chart-2');
      });

      expect(result.current.swappedCharts.size).toBe(2);

      act(() => {
        result.current.handleRevertSwap('source-chart-1');
      });

      expect(result.current.swappedCharts.size).toBe(1);
      expect(result.current.swappedCharts.has('source-chart-1')).toBe(false);
      expect(result.current.swappedCharts.get('source-chart-2')).toBe('target-chart-2');
    });

    it('should handle reverting non-existent swap gracefully', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
      });

      expect(result.current.swappedCharts.size).toBe(1);

      act(() => {
        result.current.handleRevertSwap('non-existent-chart');
      });

      // Should not throw and should keep existing swaps
      expect(result.current.swappedCharts.size).toBe(1);
      expect(result.current.swappedCharts.get('source-chart-1')).toBe('target-chart-1');
    });
  });

  describe('clearAllSwaps', () => {
    it('should clear all chart swaps', () => {
      const { result } = renderHook(() => useChartSwapping());

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
        result.current.handleChartSwap('source-chart-2', 'target-chart-2');
        result.current.handleChartSwap('source-chart-3', 'target-chart-3');
      });

      expect(result.current.swappedCharts.size).toBe(3);

      act(() => {
        result.current.clearAllSwaps();
      });

      expect(result.current.swappedCharts.size).toBe(0);
    });

    it('should handle clearing empty map gracefully', () => {
      const { result } = renderHook(() => useChartSwapping());

      expect(result.current.swappedCharts.size).toBe(0);

      act(() => {
        result.current.clearAllSwaps();
      });

      expect(result.current.swappedCharts.size).toBe(0);
    });
  });

  describe('immutability', () => {
    it('should create a new Map on each update', () => {
      const { result } = renderHook(() => useChartSwapping());

      const initialMap = result.current.swappedCharts;

      act(() => {
        result.current.handleChartSwap('source-chart-1', 'target-chart-1');
      });

      const afterSwapMap = result.current.swappedCharts;

      expect(afterSwapMap).not.toBe(initialMap);
    });
  });
});
