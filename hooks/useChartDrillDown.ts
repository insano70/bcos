/**
 * useChartDrillDown Hook
 *
 * Manages drill-down functionality for chart element clicks:
 * - Captures click context from chart elements
 * - Shows/hides drill-down icon after click
 * - Executes drill-down action on icon click
 * - Auto-dismiss icon after timeout
 *
 * Single Responsibility: Drill-down state and action execution
 *
 * @module hooks/useChartDrillDown
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import type {
  ChartClickContext,
  DrillDownConfig,
  DrillDownResult,
  UseChartDrillDownReturn,
} from '@/lib/types/drill-down';
import { executeDrillDown } from '@/lib/services/drill-down';

/**
 * Default auto-dismiss timeout in milliseconds
 * Icon disappears after this duration if not clicked
 */
const ICON_AUTO_DISMISS_MS = 4000;

/**
 * Offset from click position for icon placement
 */
const ICON_OFFSET = { x: 16, y: 16 };

/**
 * Parameters for useChartDrillDown hook
 */
interface UseChartDrillDownParams {
  /** Drill-down configuration from chart definition */
  drillDownConfig: DrillDownConfig | null;
  /** Callback when drill-down action is executed */
  onDrillDownExecute?: ((result: DrillDownResult) => void) | undefined;
  /** Custom auto-dismiss timeout (ms), set to 0 to disable */
  autoDismissMs?: number | undefined;
  /** Skip icon display and execute drill-down immediately on click (desktop mode) */
  immediateExecute?: boolean | undefined;
  /** Current active filters - prevents drill-down to same value */
  currentFilters?: Array<{ field: string; value: string | number }> | undefined;
}

/**
 * Calculate icon position from click position
 * Positions icon in top-right area of chart
 */
function calculateIconPosition(
  clickPosition: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: clickPosition.x + ICON_OFFSET.x,
    y: Math.max(clickPosition.y - 60, ICON_OFFSET.y), // Position above click, min 16px from top
  };
}

/**
 * Check if click context matches any current filter
 * Used to prevent drill-down to the same value already filtered
 */
function isAlreadyFiltered(
  context: ChartClickContext,
  currentFilters?: Array<{ field: string; value: string | number }>
): boolean {
  if (!currentFilters || currentFilters.length === 0) {
    return false;
  }

  // Check if series field matches any current filter
  if (context.seriesFieldName && context.seriesFieldValue !== undefined) {
    const matchingFilter = currentFilters.find(
      (f) =>
        f.field === context.seriesFieldName &&
        String(f.value).toLowerCase() === String(context.seriesFieldValue).toLowerCase()
    );
    if (matchingFilter) {
      return true;
    }
  }

  // Check if primary field matches any current filter
  const primaryMatch = currentFilters.find(
    (f) =>
      f.field === context.fieldName &&
      String(f.value).toLowerCase() === String(context.fieldValue).toLowerCase()
  );

  return !!primaryMatch;
}

/**
 * Manages drill-down state and interactions
 *
 * @param params - Hook parameters
 * @returns Drill-down state and action handlers
 */
export function useChartDrillDown(
  params: UseChartDrillDownParams
): UseChartDrillDownReturn {
  const {
    drillDownConfig,
    onDrillDownExecute,
    autoDismissMs = ICON_AUTO_DISMISS_MS,
    immediateExecute = false,
    currentFilters,
  } = params;

  // State
  const [clickContext, setClickContext] = useState<ChartClickContext | null>(null);
  const [showDrillDownIcon, setShowDrillDownIcon] = useState(false);
  const [iconPosition, setIconPosition] = useState<{ x: number; y: number } | null>(null);

  // Ref to track dismiss timer
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Clear any active dismiss timer
   */
  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  /**
   * Dismiss the drill-down icon
   */
  const dismissIcon = useCallback(() => {
    clearDismissTimer();
    setShowDrillDownIcon(false);
    setIconPosition(null);
    setClickContext(null);
  }, [clearDismissTimer]);

  /**
   * Handle chart element click
   * Desktop: Execute immediately (immediateExecute=true) - deferred to avoid Chart.js conflict
   * Mobile: Show icon for confirmation (immediateExecute=false)
   */
  const handleElementClick = useCallback(
    (context: ChartClickContext) => {
      // Only handle if drill-down is enabled
      if (!drillDownConfig?.enabled) {
        return;
      }

      // Don't drill-down if clicking the same value already filtered
      if (isAlreadyFiltered(context, currentFilters)) {
        return;
      }

      // Clear any existing timer
      clearDismissTimer();

      // Store context
      setClickContext(context);

      // Desktop mode: Execute immediately without showing icon
      // Use requestAnimationFrame to defer execution until after Chart.js finishes
      // processing the click event - prevents "Cannot read properties of null (reading 'save')"
      if (immediateExecute) {
        requestAnimationFrame(() => {
          const result = executeDrillDown(drillDownConfig, context);
          if (result && onDrillDownExecute) {
            onDrillDownExecute(result);
          }
        });
        return;
      }

      // Mobile mode: Show icon for user to confirm
      setIconPosition(calculateIconPosition(context.clickPosition));
      setShowDrillDownIcon(true);

      // Start auto-dismiss timer if enabled
      if (autoDismissMs > 0) {
        dismissTimerRef.current = setTimeout(() => {
          dismissIcon();
        }, autoDismissMs);
      }
    },
    [drillDownConfig, currentFilters, immediateExecute, autoDismissMs, clearDismissTimer, dismissIcon, onDrillDownExecute]
  );

  /**
   * Execute the drill-down action
   * Returns result to parent component for handling
   */
  const executeDrillDownAction = useCallback((): DrillDownResult | null => {
    if (!clickContext || !drillDownConfig) {
      return null;
    }

    const result = executeDrillDown(drillDownConfig, clickContext);

    if (result && onDrillDownExecute) {
      onDrillDownExecute(result);
    }

    // Dismiss icon after execution
    dismissIcon();

    return result;
  }, [clickContext, drillDownConfig, onDrillDownExecute, dismissIcon]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      clearDismissTimer();
    };
  }, [clearDismissTimer]);

  // Dismiss icon if config changes to disabled
  useEffect(() => {
    if (!drillDownConfig?.enabled && showDrillDownIcon) {
      dismissIcon();
    }
  }, [drillDownConfig?.enabled, showDrillDownIcon, dismissIcon]);

  return {
    handleElementClick,
    showDrillDownIcon,
    iconPosition,
    clickContext,
    executeDrillDown: executeDrillDownAction,
    dismissIcon,
  };
}

export default useChartDrillDown;

