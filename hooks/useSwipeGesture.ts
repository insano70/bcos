/**
 * useSwipeGesture Hook
 *
 * Touch event handling with gesture detection for swipe navigation.
 * Used by fullscreen swipe mode for chart and dashboard navigation.
 *
 * Features:
 * - Swipe direction detection (horizontal/vertical)
 * - Velocity-based threshold calculation
 * - Direction locking (prevents diagonal swipes)
 * - Event handlers for touch start/move/end
 */

import { useRef, useCallback } from 'react';

interface SwipeConfig {
  /** Minimum distance (px) to trigger swipe, default: 50 */
  threshold?: number;
  /** Minimum velocity (px/ms), default: 0.3 */
  velocityThreshold?: number;
  /** Callback when user swipes left */
  onSwipeLeft?: () => void;
  /** Callback when user swipes right */
  onSwipeRight?: () => void;
  /** Callback when user swipes up */
  onSwipeUp?: () => void;
  /** Callback when user swipes down */
  onSwipeDown?: () => void;
  /** Callback when swipe starts with detected direction */
  onSwipeStart?: (direction: 'horizontal' | 'vertical') => void;
  /** Callback when swipe ends */
  onSwipeEnd?: () => void;
  /** Whether gesture detection is enabled (default: true) */
  enabled?: boolean;
}

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  direction: 'horizontal' | 'vertical' | null;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

interface UseSwipeGestureReturn {
  handlers: SwipeHandlers;
}

/**
 * Hook for detecting swipe gestures
 *
 * @param config - Swipe configuration and callbacks
 * @returns Object containing touch event handlers
 *
 * @example
 * ```tsx
 * const { handlers } = useSwipeGesture({
 *   onSwipeLeft: () => goToNextChart(),
 *   onSwipeRight: () => goToPrevChart(),
 *   onSwipeUp: () => goToNextDashboard(),
 *   onSwipeDown: () => goToPrevDashboard(),
 * });
 *
 * return <div {...handlers}>Content</div>;
 * ```
 */
export function useSwipeGesture(config: SwipeConfig): UseSwipeGestureReturn {
  const {
    threshold = 50,
    velocityThreshold = 0.3,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipeStart,
    onSwipeEnd,
    enabled = true,
  } = config;

  const stateRef = useRef<SwipeState | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (!touch) return;
      stateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        currentX: touch.clientX,
        currentY: touch.clientY,
        direction: null,
      };
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !stateRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const state = stateRef.current;

      state.currentX = touch.clientX;
      state.currentY = touch.clientY;

      // Determine direction on first significant movement (10px threshold)
      if (!state.direction) {
        const deltaX = Math.abs(state.currentX - state.startX);
        const deltaY = Math.abs(state.currentY - state.startY);

        if (deltaX > 10 || deltaY > 10) {
          state.direction = deltaX > deltaY ? 'horizontal' : 'vertical';
          onSwipeStart?.(state.direction);
        }
      }
    },
    [enabled, onSwipeStart]
  );

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !stateRef.current) return;
    const state = stateRef.current;

    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const deltaTime = Date.now() - state.startTime;

    // Calculate velocities
    const velocityX = deltaTime > 0 ? Math.abs(deltaX) / deltaTime : 0;
    const velocityY = deltaTime > 0 ? Math.abs(deltaY) / deltaTime : 0;

    // Check if swipe meets threshold (either distance or velocity)
    if (state.direction === 'horizontal') {
      if (Math.abs(deltaX) > threshold || velocityX > velocityThreshold) {
        if (deltaX < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      }
    } else if (state.direction === 'vertical') {
      if (Math.abs(deltaY) > threshold || velocityY > velocityThreshold) {
        if (deltaY < 0) {
          onSwipeUp?.();
        } else {
          onSwipeDown?.();
        }
      }
    }

    onSwipeEnd?.();
    stateRef.current = null;
  }, [enabled, threshold, velocityThreshold, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onSwipeEnd]);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}

