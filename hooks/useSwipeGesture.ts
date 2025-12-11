/**
 * useSwipeGesture Hook
 *
 * Detects swipe gestures (up, down, left, right) on touch devices.
 * Used for mobile chart navigation in fullscreen mode.
 *
 * @module hooks/useSwipeGesture
 */

import { useCallback, useRef } from 'react';

/**
 * Minimum distance in pixels to trigger a swipe
 */
const SWIPE_THRESHOLD = 50;

/**
 * Maximum time in ms for a gesture to count as a swipe
 */
const SWIPE_TIMEOUT = 300;

/**
 * Swipe direction type
 */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Swipe gesture callbacks
 * Note: undefined is explicitly allowed for exactOptionalPropertyTypes compliance
 */
export interface SwipeGestureCallbacks {
  onSwipeUp?: (() => void) | undefined;
  onSwipeDown?: (() => void) | undefined;
  onSwipeLeft?: (() => void) | undefined;
  onSwipeRight?: (() => void) | undefined;
}

/**
 * Return type for useSwipeGesture hook
 */
export interface SwipeGestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Hook to detect swipe gestures on touch devices
 *
 * @param callbacks - Object with optional callbacks for each swipe direction
 * @returns Touch event handlers to attach to a component
 *
 * @example
 * ```tsx
 * const swipeHandlers = useSwipeGesture({
 *   onSwipeUp: () => goToNextChart(),
 *   onSwipeDown: () => goToPreviousChart(),
 *   onSwipeLeft: () => closeModal(),
 *   onSwipeRight: () => closeModal(),
 * });
 *
 * return <div {...swipeHandlers}>Content</div>;
 * ```
 */
export function useSwipeGesture(callbacks: SwipeGestureCallbacks): SwipeGestureHandlers {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touchStart = touchStartRef.current;
      const touch = e.changedTouches[0];

      if (!touchStart || !touch) {
        touchStartRef.current = null;
        return;
      }

      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const deltaTime = Date.now() - touchStart.time;

      // Reset ref
      touchStartRef.current = null;

      // Check if gesture was too slow
      if (deltaTime > SWIPE_TIMEOUT) {
        return;
      }

      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Check if swipe met minimum threshold
      if (absDeltaX < SWIPE_THRESHOLD && absDeltaY < SWIPE_THRESHOLD) {
        return;
      }

      // Determine primary direction (horizontal vs vertical)
      if (absDeltaX > absDeltaY) {
        // Horizontal swipe
        if (deltaX > 0) {
          callbacks.onSwipeRight?.();
        } else {
          callbacks.onSwipeLeft?.();
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          callbacks.onSwipeDown?.();
        } else {
          callbacks.onSwipeUp?.();
        }
      }
    },
    [callbacks]
  );

  return { onTouchStart, onTouchEnd };
}

export default useSwipeGesture;
