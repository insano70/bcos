'use client';

/**
 * Navigation Overlay Component
 *
 * Auto-hiding navigation overlay with controls.
 *
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Uses context ONLY for setters (setIsOpen, setShowOverlay, setCurrentChartIndex).
 */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import PositionIndicators from './position-indicators';
import FilterDisplay from './filter-display';

interface NavigationOverlayProps {
  /** Array of dashboards */
  dashboards: DashboardWithCharts[];
  /** Current dashboard index */
  currentDashboardIndex: number;
  /** Current chart index */
  currentChartIndex: number;
  /** Whether overlay is visible */
  showOverlay: boolean;
}

const OVERLAY_AUTO_HIDE_DELAY = 3000; // 3 seconds

export default function NavigationOverlay({
  dashboards,
  currentDashboardIndex,
  currentChartIndex,
  showOverlay,
}: NavigationOverlayProps) {
  // Get setters from context
  const { setIsOpen, setShowOverlay, setCurrentChartIndex } = useFullscreenSwipe();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const currentDashboard = dashboards[currentDashboardIndex];
  const totalCharts = currentDashboard?.charts.length ?? 0;

  // Auto-hide overlay after delay
  useEffect(() => {
    if (showOverlay && OVERLAY_AUTO_HIDE_DELAY > 0) {
      timeoutRef.current = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => {
          setShowOverlay(false);
          setIsExiting(false);
        }, 200); // Match animation duration
      }, OVERLAY_AUTO_HIDE_DELAY);
    }
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, [showOverlay, setShowOverlay]);

  // Handle close
  const handleClose = () => {
    setIsOpen(false);
  };

  // Handle chart selection from indicators
  const handleChartSelect = (index: number) => {
    setCurrentChartIndex(index);
    // Reset auto-hide timer when user interacts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, OVERLAY_AUTO_HIDE_DELAY);
  };

  if (!showOverlay && !isExiting) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-50 ${
        showOverlay && !isExiting ? 'overlay-enter' : 'overlay-exit'
      }`}
    >
      {/* Header */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/60 to-transparent pt-safe">
        <div className="flex items-center justify-between px-4 py-3 pointer-events-auto">
          {/* Dashboard info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-semibold truncate">
              {currentDashboard?.dashboard_name || 'Dashboard'}
            </h1>
            <p className="text-white/70 text-sm">
              Dashboard {currentDashboardIndex + 1} of {dashboards.length}
            </p>
            {/* Active filters display */}
            <FilterDisplay />
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white"
            aria-label="Exit fullscreen"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent pb-safe">
        <div className="px-4 py-4 pointer-events-auto">
          <PositionIndicators
            total={totalCharts}
            current={currentChartIndex}
            onSelect={handleChartSelect}
            className="text-white"
          />
        </div>
      </div>
    </div>
  );
}

