/**
 * useSyncedScrollSnap Hook
 *
 * Manages scroll-snap container synchronization between state and scroll position.
 * Extracted from chart-swipe-container.tsx and dashboard-swipe-container.tsx to follow DRY.
 *
 * Features:
 * - Syncs scroll position with state index
 * - Detects user scroll vs programmatic scroll
 * - Supports reduced motion preference
 * - Works for both horizontal and vertical scroll containers
 */

import { useRef, useEffect, useCallback, type RefObject } from 'react';

interface UseSyncedScrollSnapOptions {
  /** Current index to scroll to */
  currentIndex: number;
  /** Total number of items in the container */
  itemCount: number;
  /** Callback when user scrolls to a new index */
  onIndexChange: (newIndex: number) => void;
  /** Scroll axis - 'horizontal' for charts, 'vertical' for dashboards */
  axis: 'horizontal' | 'vertical';
  /** Whether the hook is enabled (e.g., only when modal is open) */
  enabled?: boolean;
}

interface UseSyncedScrollSnapReturn {
  /** Ref to attach to the scroll container */
  containerRef: RefObject<HTMLDivElement | null>;
  /** onScroll handler to attach to the container */
  handleScroll: () => void;
}

/**
 * Hook for managing scroll-snap container state synchronization
 *
 * @param options - Configuration options
 * @returns Container ref and scroll handler
 *
 * @example
 * ```tsx
 * const { containerRef, handleScroll } = useSyncedScrollSnap({
 *   currentIndex: currentChartIndex,
 *   itemCount: charts.length,
 *   onIndexChange: setCurrentChartIndex,
 *   axis: 'horizontal',
 * });
 *
 * return (
 *   <div ref={containerRef} onScroll={handleScroll} className="chart-swipe-container">
 *     {charts.map(chart => <div className="chart-slide" />)}
 *   </div>
 * );
 * ```
 */
export function useSyncedScrollSnap({
  currentIndex,
  itemCount,
  onIndexChange,
  axis,
  enabled = true,
}: UseSyncedScrollSnapOptions): UseSyncedScrollSnapReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  // Track if current scroll is programmatic (vs user-initiated)
  const isProgrammaticScrollRef = useRef(false);
  // Track the last known index to detect actual changes
  const lastIndexRef = useRef(currentIndex);
  // Track if this is the initial mount (need to scroll even if index matches)
  const isInitialMountRef = useRef(true);

  // Scroll to current index when it changes (from keyboard nav or indicator click)
  // Also scrolls on initial mount to handle case where currentIndex > 0
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    // ALWAYS scroll on initial mount, then only on changes
    // This fixes the black screen issue when opening fullscreen on a non-first dashboard
    if (!isInitialMountRef.current && lastIndexRef.current === currentIndex) return;
    isInitialMountRef.current = false;
    lastIndexRef.current = currentIndex;

    const dimension =
      axis === 'horizontal'
        ? containerRef.current.offsetWidth
        : containerRef.current.offsetHeight;

    const currentScroll =
      axis === 'horizontal' ? containerRef.current.scrollLeft : containerRef.current.scrollTop;

    const targetScroll = currentIndex * dimension;

    // Don't scroll if we're already at the right position (within tolerance)
    if (Math.abs(currentScroll - targetScroll) < 10) return;

    // Check reduced motion preference
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mark as programmatic scroll to prevent onScroll from updating state
    isProgrammaticScrollRef.current = true;

    if (axis === 'horizontal') {
      containerRef.current.scrollTo({
        left: targetScroll,
        behavior: prefersReducedMotion ? 'instant' : 'smooth',
      });
    } else {
      containerRef.current.scrollTo({
        top: targetScroll,
        behavior: prefersReducedMotion ? 'instant' : 'smooth',
      });
    }

    // Reset programmatic flag after animation completes
    const resetTimeout = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 350); // Slightly longer than 300ms animation

    return () => clearTimeout(resetTimeout);
  }, [currentIndex, axis, enabled]);

  // Track scroll position to update current index (user-initiated scrolls only)
  const handleScroll = useCallback(() => {
    if (!enabled || !containerRef.current) return;

    // Skip if this is a programmatic scroll
    if (isProgrammaticScrollRef.current) return;

    const scroll =
      axis === 'horizontal' ? containerRef.current.scrollLeft : containerRef.current.scrollTop;

    const dimension =
      axis === 'horizontal'
        ? containerRef.current.offsetWidth
        : containerRef.current.offsetHeight;

    const newIndex = Math.round(scroll / dimension);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < itemCount) {
      onIndexChange(newIndex);
      // Update our tracking ref
      lastIndexRef.current = newIndex;
    }
  }, [currentIndex, itemCount, onIndexChange, axis, enabled]);

  return {
    containerRef,
    handleScroll,
  };
}

