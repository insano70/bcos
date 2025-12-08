/**
 * Fullscreen Swipe Mode Types
 *
 * Centralized type definitions for the fullscreen swipe navigation feature.
 * Imports shared types from existing locations to prevent drift.
 */

import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';

// Re-export for convenience
export type { DashboardUniversalFilters };

/**
 * Swipe gesture configuration
 */
export interface SwipeGestureConfig {
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

/**
 * Swipe gesture internal state
 * Used by useSwipeGesture hook
 */
export interface SwipeGestureState {
  /** Starting X coordinate */
  startX: number;
  /** Starting Y coordinate */
  startY: number;
  /** Timestamp of touch start */
  startTime: number;
  /** Current X coordinate */
  currentX: number;
  /** Current Y coordinate */
  currentY: number;
  /** Locked direction after threshold */
  direction: 'horizontal' | 'vertical' | null;
}

/**
 * Parameters for opening swipe mode
 * Used by useOpenSwipeMode() convenience hook
 */
export interface OpenSwipeModeParams {
  /** Dashboard to start on */
  dashboardId: string;

  /** Chart index to start on (default: 0) */
  chartIndex?: number;

  /**
   * Universal filters from dashboard view
   * Passed to chart data fetching for consistent results
   */
  universalFilters?: DashboardUniversalFilters;
}

/**
 * Swipe handlers returned by useSwipeGesture
 */
export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

/**
 * Haptic feedback patterns
 * Maps to vibration durations/sequences
 */
export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/**
 * Haptic pattern configurations (milliseconds)
 */
export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10],
  error: [30, 50, 30, 50, 30],
};

