/**
 * useSwipeGesture Hook Tests
 *
 * Tests for touch gesture detection, threshold calculation, velocity-based
 * swipe detection, and direction locking.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

// Helper to create mock touch events
function createTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientX: number,
  clientY: number
): React.TouchEvent {
  return {
    touches: type !== 'touchend' ? [{ clientX, clientY }] : [],
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.TouchEvent;
}

describe('useSwipeGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('horizontal swipes', () => {
    it('should detect left swipe when threshold exceeded', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          threshold: 50,
        })
      );

      // Start touch
      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 200, 100));
      });

      // Move left beyond threshold
      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 100, 105)); // 100px left
      });

      // End touch
      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('should detect right swipe when threshold exceeded', () => {
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeRight,
          threshold: 50,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 200, 105)); // 100px right
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger swipe when below threshold', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          onSwipeRight,
          threshold: 50,
          velocityThreshold: 10, // Very high to prevent velocity-based trigger
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      // Move only 30px (below 50px threshold)
      act(() => {
        vi.advanceTimersByTime(500); // Slow movement to prevent velocity trigger
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 130, 105));
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('vertical swipes', () => {
    it('should detect up swipe when threshold exceeded', () => {
      const onSwipeUp = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeUp,
          threshold: 50,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 200));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 105, 100)); // 100px up
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeUp).toHaveBeenCalledTimes(1);
    });

    it('should detect down swipe when threshold exceeded', () => {
      const onSwipeDown = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeDown,
          threshold: 50,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 105, 200)); // 100px down
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('direction locking', () => {
    it('should lock to horizontal direction when horizontal movement is greater', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeUp = vi.fn();
      const onSwipeStart = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          onSwipeUp,
          onSwipeStart,
          threshold: 50,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 200, 100));
      });

      // Move more horizontally (100px) than vertically (30px)
      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 100, 130));
      });

      expect(onSwipeStart).toHaveBeenCalledWith('horizontal');

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      // Should trigger horizontal, not vertical
      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeUp).not.toHaveBeenCalled();
    });

    it('should lock to vertical direction when vertical movement is greater', () => {
      const onSwipeRight = vi.fn();
      const onSwipeDown = vi.fn();
      const onSwipeStart = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeRight,
          onSwipeDown,
          onSwipeStart,
          threshold: 50,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      // Move more vertically (100px) than horizontally (30px)
      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 130, 200));
      });

      expect(onSwipeStart).toHaveBeenCalledWith('vertical');

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      // Should trigger vertical, not horizontal
      expect(onSwipeDown).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('velocity-based detection', () => {
    it('should trigger swipe on high velocity even below distance threshold', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          threshold: 100, // High distance threshold
          velocityThreshold: 0.1, // Low velocity threshold
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      // Move only 30px but very fast (simulated by short time)
      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 70, 105));
      });

      // Fast swipe (30px in ~50ms = 0.6 velocity, well above 0.1 threshold)
      act(() => {
        vi.advanceTimersByTime(50);
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });
  });

  describe('enabled flag', () => {
    it('should not respond to touches when disabled', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          enabled: false,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 200, 100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 50, 100));
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('should call onSwipeEnd after swipe completes', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeEnd = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          onSwipeEnd,
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 200, 100));
      });

      act(() => {
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 50, 100));
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    });

    it('should call onSwipeEnd even when no swipe threshold met', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeEnd = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
          onSwipeEnd,
          threshold: 200, // Very high threshold
          velocityThreshold: 10, // Very high velocity threshold
        })
      );

      act(() => {
        result.current.handlers.onTouchStart(createTouchEvent('touchstart', 100, 100));
      });

      act(() => {
        vi.advanceTimersByTime(1000); // Slow
        result.current.handlers.onTouchMove(createTouchEvent('touchmove', 90, 100));
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle missing touch data gracefully', () => {
      const onSwipeLeft = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeLeft,
        })
      );

      // Create touch event with empty touches array
      const emptyTouchEvent = {
        touches: [],
      } as unknown as React.TouchEvent;

      act(() => {
        result.current.handlers.onTouchStart(emptyTouchEvent);
      });

      act(() => {
        result.current.handlers.onTouchMove(emptyTouchEvent);
      });

      act(() => {
        result.current.handlers.onTouchEnd();
      });

      // Should not crash and should not trigger callback
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('should handle touch end without touch start', () => {
      const onSwipeEnd = vi.fn();
      const { result } = renderHook(() =>
        useSwipeGesture({
          onSwipeEnd,
        })
      );

      // End without start
      act(() => {
        result.current.handlers.onTouchEnd();
      });

      // Should not crash - onSwipeEnd only called when state exists
      expect(onSwipeEnd).not.toHaveBeenCalled();
    });
  });
});

