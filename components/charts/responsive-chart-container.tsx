'use client';

import type React from 'react';
import { cloneElement, type ReactElement, useEffect, useRef, useState } from 'react';

interface ResponsiveChartContainerProps {
  children: ReactElement;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
}

interface ChartDimensions {
  width: number;
  height: number;
}

/**
 * ResponsiveChartContainer
 *
 * A container component that observes its size and passes responsive dimensions
 * to child chart components. Uses ResizeObserver for optimal performance.
 *
 * Features:
 * - Automatic resize detection
 * - Configurable min/max height constraints
 * - Optional aspect ratio enforcement
 * - Debounced resize handling for performance
 * - Fallback dimensions for SSR compatibility
 */
export default function ResponsiveChartContainer({
  children,
  className = '',
  minHeight = 200,
  maxHeight = 800,
  aspectRatio,
}: ResponsiveChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800, // Fallback width for SSR
    height: 400, // Fallback height for SSR
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial measurement
    const updateDimensions = () => {
      const containerRect = container.getBoundingClientRect();
      let width = Math.floor(containerRect.width);
      let height = Math.floor(containerRect.height);

      // Apply minimum width (prevent zero/negative values)
      width = Math.max(width, 300);

      // Calculate height based on constraints - respect maxHeight from dashboard config
      if (aspectRatio) {
        // Use aspect ratio if specified
        height = Math.floor(width / aspectRatio);
      } else {
        // Use container height if available, but respect maxHeight constraints
        const containerHeight = Math.floor(containerRect.height);
        if (containerHeight > 0) {
          // Use the smaller of container height or maxHeight to respect configuration
          height = Math.min(containerHeight, maxHeight);
        } else {
          // Fallback to minHeight if container height is not available
          height = Math.min(minHeight, maxHeight);
        }
      }

      // Final constraint: never exceed maxHeight (dashboard configuration)
      height = Math.min(height, maxHeight);

      // Only update if dimensions actually changed (prevent unnecessary re-renders)
      setDimensions((prev) => {
        if (prev.width !== width || prev.height !== height) {
          return { width, height };
        }
        return prev;
      });
    };

    // Set up ResizeObserver for container size changes (deferred with RAF)
    if (typeof ResizeObserver !== 'undefined') {
      let rafId: number;
      const resizeObserver = new ResizeObserver((_entries) => {
        // Defer dimension updates to prevent race conditions
        rafId = requestAnimationFrame(() => {
          updateDimensions();
        });
      });
      resizeObserver.observe(container);

      // Initial measurement (also deferred)
      rafId = requestAnimationFrame(() => {
        updateDimensions();
      });

      // Cleanup
      return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(rafId);
      };
    }

    // Initial measurement after mount (fallback for browsers without ResizeObserver)
    updateDimensions();
  }, [minHeight, maxHeight, aspectRatio]);

  // CRITICAL FIX: Pass dimensions to child chart component
  // Use type assertion since we know chart components accept width/height props
  const chartElement = cloneElement(children, {
    width: dimensions.width,
    height: dimensions.height,
  } as Partial<unknown>);

  return (
    <div
      ref={containerRef}
      className={`chart-container-responsive ${className}`}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        width: '100%',
      }}
    >
      {chartElement}
    </div>
  );
}

/**
 * Hook for getting responsive chart dimensions
 * Can be used directly in chart components if needed
 */
export function useResponsiveChartDimensions(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    minHeight?: number;
    maxHeight?: number;
    aspectRatio?: number;
    debounceMs?: number;
  } = {}
): ChartDimensions {
  const { minHeight = 200, maxHeight = 800, aspectRatio, debounceMs = 150 } = options;
  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 800,
    height: 400,
  });
  const resizeTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const containerRect = container.getBoundingClientRect();
      let width = Math.floor(containerRect.width);
      let height = Math.floor(containerRect.height);

      width = Math.max(width, 300);

      if (aspectRatio) {
        height = Math.floor(width / aspectRatio);
      } else {
        const containerHeight = Math.floor(containerRect.height);
        if (containerHeight > 0) {
          height = Math.min(containerHeight, maxHeight);
        } else {
          height = Math.min(minHeight, maxHeight);
        }
      }

      height = Math.min(height, maxHeight);

      setDimensions((prev) => {
        if (prev.width !== width || prev.height !== height) {
          return { width, height };
        }
        return prev;
      });
    };

    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(updateDimensions, debounceMs);
    };

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver((_entries) => {
        handleResize();
      });
      resizeObserver.observe(container);

      updateDimensions();

      return () => {
        resizeObserver.disconnect();
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
      };
    }
  }, [minHeight, maxHeight, aspectRatio, debounceMs]);

  return dimensions;
}
