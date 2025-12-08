'use client';

/**
 * Dashboard Peek Component
 *
 * Shows next/prev dashboard names at screen edges.
 * Hints to users that they can swipe vertically to navigate between dashboards.
 *
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Does NOT use context for data - follows props-down pattern.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DashboardWithCharts } from '@/lib/types/dashboards';

interface DashboardPeekProps {
  /** Array of dashboards */
  dashboards: DashboardWithCharts[];
  /** Current dashboard index */
  currentDashboardIndex: number;
}

export default function DashboardPeek({ dashboards, currentDashboardIndex }: DashboardPeekProps) {
  const prevDashboard = dashboards[currentDashboardIndex - 1];
  const nextDashboard = dashboards[currentDashboardIndex + 1];

  return (
    <>
      {/* Previous dashboard hint (top) */}
      {prevDashboard && (
        <div className="absolute top-0 inset-x-0 flex items-center justify-center py-2 pointer-events-none pt-safe z-40">
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1">
            <ChevronUp className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{prevDashboard.dashboard_name}</span>
          </div>
        </div>
      )}

      {/* Next dashboard hint (bottom) */}
      {nextDashboard && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-center py-2 pointer-events-none pb-safe z-40">
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1">
            <ChevronDown className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{nextDashboard.dashboard_name}</span>
          </div>
        </div>
      )}
    </>
  );
}

