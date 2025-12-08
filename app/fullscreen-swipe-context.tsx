'use client';

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';

/**
 * Fullscreen Swipe Context
 *
 * Slim context following flyout-context.tsx pattern (~45 lines).
 *
 * Contains ONLY navigation state + setters.
 * Data fetching (useDashboardData, useSwipeDashboards) happens in container.
 * This keeps the context simple and aligns with existing patterns.
 */
interface FullscreenSwipeContextProps {
  // Mode
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;

  // Navigation
  currentDashboardId: string | null;
  setCurrentDashboardId: Dispatch<SetStateAction<string | null>>;
  currentChartIndex: number;
  setCurrentChartIndex: Dispatch<SetStateAction<number>>;

  // Filters (passed from entry point)
  universalFilters: DashboardUniversalFilters | null;
  setUniversalFilters: Dispatch<SetStateAction<DashboardUniversalFilters | null>>;

  // UI state
  showOverlay: boolean;
  setShowOverlay: Dispatch<SetStateAction<boolean>>;
}

const FullscreenSwipeContext = createContext<FullscreenSwipeContextProps | undefined>(undefined);

export function FullscreenSwipeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDashboardId, setCurrentDashboardId] = useState<string | null>(null);
  const [currentChartIndex, setCurrentChartIndex] = useState(0);
  const [universalFilters, setUniversalFilters] = useState<DashboardUniversalFilters | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);

  return (
    <FullscreenSwipeContext.Provider
      value={{
        isOpen,
        setIsOpen,
        currentDashboardId,
        setCurrentDashboardId,
        currentChartIndex,
        setCurrentChartIndex,
        universalFilters,
        setUniversalFilters,
        showOverlay,
        setShowOverlay,
      }}
    >
      {children}
    </FullscreenSwipeContext.Provider>
  );
}

export function useFullscreenSwipe() {
  const context = useContext(FullscreenSwipeContext);
  if (!context) {
    throw new Error('useFullscreenSwipe must be used within a FullscreenSwipeProvider');
  }
  return context;
}

/**
 * Convenience hook for opening swipe mode
 * Encapsulates the open logic without bloating the context
 */
export function useOpenSwipeMode() {
  const { setIsOpen, setCurrentDashboardId, setCurrentChartIndex, setUniversalFilters } =
    useFullscreenSwipe();

  return (params: {
    dashboardId: string;
    chartIndex?: number;
    universalFilters?: DashboardUniversalFilters;
  }) => {
    setCurrentDashboardId(params.dashboardId);
    setCurrentChartIndex(params.chartIndex ?? 0);
    setUniversalFilters(params.universalFilters ?? null);
    setIsOpen(true);
  };
}

