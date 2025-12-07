# Fullscreen Swipe Navigation Mode - Design Document

> **Branch**: `feat/fullscreen-swipe-mode`  
> **Created**: 2025-01-07  
> **Updated**: 2025-12-07  
> **Status**: Ready for Implementation  
> **Author**: Engineering Team

---

## Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [User Experience Design](#user-experience-design)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Phases](#implementation-phases)
6. [File Change Summary](#file-change-summary)
7. [Testing Strategy](#testing-strategy)
8. [Accessibility](#accessibility)
9. [Performance Considerations](#performance-considerations)
10. [Migration & Rollout](#migration--rollout)
11. [Success Metrics](#success-metrics)
12. [Appendix: Type Definitions](#appendix-type-definitions)

---

## Overview

Create an immersive fullscreen mode for the analytics dashboard that allows users to navigate through charts using natural swipe gestures:

- **Horizontal swipe (← →)** - Navigate between charts within a dashboard
- **Vertical swipe (↑ ↓)** - Switch between different dashboards
- **Tap** - Show/hide navigation overlay
- **Pinch** - Exit fullscreen mode

This feature transforms the dashboard experience into a presentation-ready, mobile-optimized interface similar to Instagram Stories or TikTok's vertical scroll.

---

## Problem Statement

### Current State

1. **Chart fullscreen is isolated** - Users can only view one chart at a time in fullscreen; navigating to another chart requires:
   - Closing fullscreen modal
   - Finding and clicking another chart
   - Opening fullscreen again

2. **No dashboard-level presentation mode** - Users presenting analytics must manually navigate, breaking flow and professionalism

3. **Mobile experience is suboptimal** - Small touch targets and no gesture-based navigation make mobile dashboard exploration tedious

4. **Context switching is jarring** - Each fullscreen open/close is a separate mental context switch

### Target State

- **Seamless navigation** - Swipe between charts without closing fullscreen
- **Cross-dashboard browsing** - Swipe vertically to explore all accessible dashboards
- **Touch-first design** - Optimized for mobile with gesture controls
- **Keyboard support** - Arrow keys for desktop accessibility
- **Presentation mode** - Clean, immersive view suitable for meetings and reviews

---

## User Experience Design

### Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [X]                          Dashboard 1 of 4                   │ ← Header (auto-hides)
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                    ┌─────────────────────────┐                  │
│                    │                         │                  │
│                    │    [Monthly Revenue]    │                  │
│    ← Prev Chart    │                         │    Next Chart →  │
│                    │    [Bar Chart Area]     │                  │
│                    │                         │                  │
│                    │                         │                  │
│                    └─────────────────────────┘                  │
│                                                                 │
│                        ○ ● ○ ○ ○ ○                              │ ← Position indicators
│                                                                 │
│                    ↓ Swipe for: Operations                      │ ← Next dashboard hint
└─────────────────────────────────────────────────────────────────┘
```

### Gesture Mappings

| Gesture | Action | Visual Feedback | Haptic |
|---------|--------|-----------------|--------|
| **Swipe Left** | Next chart in dashboard | Slide animation (300ms) | Light tap (10ms) |
| **Swipe Right** | Previous chart in dashboard | Slide animation (300ms) | Light tap (10ms) |
| **Swipe Up** | Next dashboard | Vertical slide (300ms) | Medium tap (20ms) |
| **Swipe Down** | Previous dashboard OR exit (if first) | Vertical slide or dismiss | Medium tap (20ms) |
| **Tap** | Toggle navigation overlay | Fade in/out (200ms) | None |
| **Pinch In** | Exit fullscreen mode | Scale down + fade | None |
| **Double-tap** | Reset chart zoom (if zoomed) | Bounce animation | Light tap |
| **Long Press** | Show quick actions menu | Slide up | Medium tap |

### Keyboard Navigation (Desktop)

| Key | Action |
|-----|--------|
| `→` or `L` | Next chart |
| `←` or `H` | Previous chart |
| `↓` or `J` | Next dashboard |
| `↑` or `K` | Previous dashboard |
| `Escape` | Exit fullscreen |
| `Space` | Toggle overlay |
| `F` | Enter fullscreen (from dashboard view) |

### Entry Points

| Entry Point | Behavior |
|-------------|----------|
| Chart fullscreen button (existing) | Opens at that chart, can swipe to others |
| Dashboard "Present" button (new) | Opens first chart, can swipe to others |
| Keyboard `F` on focused chart | Opens at that chart |
| Long-press on chart (mobile) | Opens at that chart |

### Exit Methods

| Method | Condition |
|--------|-----------|
| Close button (X) | Always visible in header |
| Swipe down on first dashboard | Dismisses with animation |
| Escape key | Always works |
| Pinch gesture | Scale-down dismiss |
| Browser back button | Returns to previous view |

---

## Technical Architecture

### Component Hierarchy

```
app/
├── fullscreen-swipe-context.tsx          # Global state provider (add to layout.tsx)
│
components/charts/
├── fullscreen-swipe/
│   ├── index.ts                          # Public exports
│   ├── fullscreen-swipe-container.tsx    # Main container (portal to body)
│   ├── dashboard-swipe-container.tsx     # Vertical scroll-snap for dashboards
│   ├── chart-swipe-container.tsx         # Horizontal scroll-snap for charts
│   ├── chart-slide.tsx                   # Individual chart slide wrapper
│   ├── chart-type-dispatcher.tsx         # Routes to correct chart renderer
│   ├── navigation-overlay.tsx            # Header, indicators, controls
│   ├── position-indicators.tsx           # Dot indicators component
│   ├── dashboard-peek.tsx                # Shows next/prev dashboard name
│   ├── filter-display.tsx                # Shows active universal filters
│   ├── quick-actions-sheet.tsx           # Long-press action menu
│   └── swipe-tutorial.tsx                # First-time user tutorial
│
hooks/
├── useSwipeGesture.ts                    # NEW: Touch event gesture detection
└── useHapticFeedback.ts                  # Phase 6 (optional): Vibration feedback utility

lib/hooks/
└── use-swipe-dashboards.ts              # NEW: Fetch dashboards with charts for swipe mode
```

> **Note:** Native CSS scroll-snap + `onScroll` handler is sufficient for scroll tracking. No `useScrollSnap` hook needed.

> **Note:** The provider is added to `app/layout.tsx` following the composition pattern used for `RBACAuthProvider`, `QueryProvider`, etc. - NOT inside `app-provider.tsx` which only handles sidebar state.

### Reused Existing Code (DRY Compliance)

The following existing hooks and components are REUSED rather than recreated:

| Existing Code | Location | Purpose in Swipe Mode |
|---------------|----------|----------------------|
| `useDashboardData` | `hooks/use-dashboard-data.ts` | Batch fetch chart data for dashboard |
| `useChartFullscreen` | `hooks/useChartFullscreen.ts` | Mounted state, body scroll lock, escape key |
| `useStickyFilters` | `hooks/use-sticky-filters.ts` | Pattern for localStorage preferences |
| `ChartErrorBoundary` | `components/charts/chart-error-boundary.tsx` | Error boundary for chart rendering |
| `ChartSkeleton` | `components/ui/loading-skeleton.tsx` | Loading state skeleton |
| `ChartError` | `components/charts/chart-error.tsx` | Error display component |
| Portal pattern | `components/charts/chart-fullscreen-modal.tsx` | `createPortal` to document.body |
| `DashboardWithCharts` type | `lib/types/dashboards.ts` | Dashboard with charts array |

**Important Note on Dashboard Fetching:**

The existing `usePublishedDashboards` hook returns `PublishedDashboard` which is a **simplified type** for navigation (no chart details). For swipe mode, we need the full `DashboardWithCharts` type which includes the `charts[]` array.

**Solution:** Create a new `useSwipeDashboards` hook that:
1. Uses the existing dashboard service API (`/api/admin/dashboards`)
2. Returns `DashboardWithCharts[]` (full type with charts)
3. Filters to `is_published=true&is_active=true`

This is NOT duplication because:
- Different return type (`DashboardWithCharts` vs `PublishedDashboard`)
- Different purpose (full chart metadata vs navigation-only)
- Different query key (cache separately)

**Why reuse matters:**
- Consistent behavior across the application
- Tested and proven patterns
- Reduced bundle size
- Single source of truth for fixes

### State Management

Following existing patterns from `flyout-context.tsx` and `selected-items-context.tsx`:

```typescript
// app/fullscreen-swipe-context.tsx
interface FullscreenSwipeState {
  // Mode
  isOpen: boolean;
  mounted: boolean; // For hydration safety (portal rendering)
  
  // Dashboard navigation
  dashboards: DashboardWithCharts[];
  currentDashboardIndex: number;
  
  // Chart navigation (within current dashboard)
  currentChartIndex: number;
  
  // Chart data (batch-fetched per dashboard)
  chartDataMap: Map<string, BatchChartData>; // chart_definition_id -> data
  isLoadingChartData: boolean;
  chartDataError: string | null;
  
  // Filters (preserved from dashboard view)
  universalFilters: DashboardUniversalFilters | null;
  
  // UI state
  showOverlay: boolean;
  overlayAutoHideDelay: number; // ms, 0 = never hide
  showTutorial: boolean;
  
  // Gesture state
  isAnimating: boolean;
  swipeDirection: 'horizontal' | 'vertical' | null;
}

interface FullscreenSwipeActions {
  // Lifecycle
  open: (params: OpenFullscreenParams) => void;
  close: () => void;
  
  // Chart navigation
  nextChart: () => void;
  prevChart: () => void;
  goToChart: (index: number) => void;
  
  // Dashboard navigation
  nextDashboard: () => void;
  prevDashboard: () => void;
  goToDashboard: (index: number) => void;
  
  // Data loading
  loadChartData: (dashboardId: string) => Promise<void>;
  
  // UI controls
  toggleOverlay: () => void;
  setOverlayAutoHide: (delay: number) => void;
  dismissTutorial: () => void;
}

interface OpenFullscreenParams {
  dashboardId: string;
  chartIndex?: number; // Default: 0
  dashboards?: DashboardWithCharts[]; // If not provided, fetch via useDashboardsList
  universalFilters?: DashboardUniversalFilters; // Pass from dashboard view
}
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     FullscreenSwipeProvider                       │
│  (Context: state + actions, wraps entire app via app-provider)   │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                   FullscreenSwipeContainer                        │
│  (Portal to document.body, only renders when isOpen)             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  DashboardSwipeContainer                    │  │
│  │  (Vertical scroll-snap, contains all dashboards)           │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │              Dashboard 1 (Revenue)                    │  │  │
│  │  │  ┌────────────────────────────────────────────────┐  │  │  │
│  │  │  │           ChartSwipeContainer                  │  │  │  │
│  │  │  │  (Horizontal scroll-snap for this dashboard)   │  │  │  │
│  │  │  │                                                │  │  │  │
│  │  │  │  [Chart 1] [Chart 2] [Chart 3] ...            │  │  │  │
│  │  │  └────────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │              Dashboard 2 (Operations)                 │  │  │
│  │  │  ...                                                  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   NavigationOverlay                         │  │
│  │  (Positioned absolute, auto-hides, shows on tap)           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Data Fetching Strategy

This section details how dashboards and chart data are loaded.

#### Dashboard List Fetching - NEW HOOK REQUIRED

**Why we need a new hook:**
- `usePublishedDashboards` returns `PublishedDashboard` (simplified: id, name, description only)
- Swipe mode needs `DashboardWithCharts` (full: includes `charts[]` array with positions)
- Different cache keys prevent conflicts

```typescript
// lib/hooks/use-swipe-dashboards.ts - NEW FILE
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DashboardWithCharts } from '@/lib/types/dashboards';

/**
 * Fetch dashboards with full chart details for swipe mode
 * 
 * Why not reuse usePublishedDashboards:
 * - usePublishedDashboards returns PublishedDashboard (no charts array)
 * - Swipe mode needs DashboardWithCharts with full chart metadata
 * 
 * Note: The API already returns DashboardWithCharts by default.
 * No include_charts parameter needed.
 */
export function useSwipeDashboards(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['dashboards', 'swipe-mode', 'with-charts'],
    queryFn: async (): Promise<DashboardWithCharts[]> => {
      // API already returns DashboardWithCharts with charts[] array
      const result = await apiClient.get<{ dashboards: DashboardWithCharts[] }>(
        '/api/admin/analytics/dashboards?is_published=true&is_active=true'
      );
      // Filter to dashboards that have at least one chart
      return (result.dashboards || []).filter(d => d.chart_count > 0);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: options?.enabled ?? true,
  });
}
```

**Add to Phase 1 tasks:** `1.1.4 | lib/hooks/use-swipe-dashboards.ts | Fetch dashboards with charts for swipe mode`

#### Chart Data Batch Fetching - REUSE EXISTING

**Use existing hook:** `hooks/use-dashboard-data.ts`

```typescript
// EXISTING - DO NOT RECREATE
// hooks/use-dashboard-data.ts

import { useDashboardData } from '@/hooks/use-dashboard-data';

// Usage in swipe mode:
const { data, isLoading, error, refetch } = useDashboardData({
  dashboardId: currentDashboard.dashboard_id,
  universalFilters: filters,
  enabled: isOpen && !!currentDashboard,
});

// The hook already:
// - Fetches all charts in a single batch API call
// - Supports universal filters
// - Returns data.charts (Record<chartId, ChartRenderResult>)
// - Handles loading/error states
// - Supports cache bypass via refetch(true)
```

**Integration note:** The `useDashboardData` hook returns `DashboardRenderResponse` which has:
- `charts: Record<string, ChartRenderResult>` - Chart data keyed by chart ID
- `metadata` - Performance metrics

Convert to Map in the context if needed:
```typescript
const chartDataMap = new Map(Object.entries(data.charts));
```

#### Loading Strategy

| When | Action | Why |
|------|--------|-----|
| Swipe mode opens | Fetch dashboard list (if not provided) | Need dashboard metadata |
| Dashboard selected | Batch fetch ALL chart data for that dashboard | Smooth swiping without loading per chart |
| Dashboard changes | Prefetch next dashboard's chart data | Anticipate vertical swipe |
| Chart unmounts | Keep data in React Query cache | May swipe back |

#### Data Flow Sequence

```
User clicks "Present" on Dashboard A
    │
    ▼
┌─────────────────────────────────────────┐
│ 1. Open fullscreen with dashboardId    │
│    - Pass universalFilters from view   │
│    - Pass dashboards[] if available    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 2. If dashboards[] not provided:       │
│    - useDashboardsList() fetches list  │
│    - Find index of dashboardId         │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 3. useDashboardChartData() fires       │
│    - Batch fetch all charts for        │
│      current dashboard                 │
│    - Store in chartDataMap             │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 4. ChartSlide renders with data        │
│    - Gets data from chartDataMap       │
│    - Dispatches to correct renderer    │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│ 5. On dashboard change (vertical swipe)│
│    - Trigger new batch fetch           │
│    - Prefetch adjacent dashboard       │
│    - Reset chart index to 0            │
└─────────────────────────────────────────┘
```

### CSS Strategy

Using existing patterns from `app/css/style.css` and the safe-area utilities we added:

```css
/* Fullscreen swipe mode utilities - add to app/css/style.css */
@layer utilities {
  /* Vertical dashboard container */
  .dashboard-swipe-container {
    height: 100dvh;
    overflow-y: scroll;
    overflow-x: hidden;
    scroll-snap-type: y mandatory;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .dashboard-slide {
    height: 100dvh;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  /* Horizontal chart container */
  .chart-swipe-container {
    width: 100%;
    height: 100%;
    overflow-x: scroll;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    display: flex;
  }

  .chart-slide {
    width: 100%;
    height: 100%;
    flex-shrink: 0;
    scroll-snap-align: center;
    scroll-snap-stop: always;
  }

  /* Overlay animations */
  .overlay-enter {
    animation: overlayFadeIn 0.2s ease-out forwards;
  }
  
  .overlay-exit {
    animation: overlayFadeOut 0.2s ease-in forwards;
  }
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes overlayFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
**Effort**: 2-3 days | **Priority**: HIGH

Create the foundational context, hooks, and container components.

#### 1.1 Create Fullscreen Swipe Context

| Task | File | Description |
|------|------|-------------|
| 1.1.1 | `app/fullscreen-swipe-context.tsx` | Create context following `flyout-context.tsx` pattern |
| 1.1.2 | `lib/types/fullscreen-swipe.ts` | Define TypeScript interfaces (import existing types) |
| 1.1.3 | `app/layout.tsx` | Add `FullscreenSwipeProvider` to provider composition |
| 1.1.4 | `lib/hooks/use-swipe-dashboards.ts` | Fetch dashboards with charts for swipe mode |

> **Note:** Add provider to `layout.tsx` inside the existing provider chain, NOT in `app-provider.tsx`. Follow the pattern of `RBACAuthProvider`, `QueryProvider`, etc.

**Reuse existing code (DRY):**
- Chart data fetching: Use `useDashboardData` from `hooks/use-dashboard-data.ts`
- Chart rendering: Use `BatchChartRenderer` (handles all chart types + fullscreen modals)
- Chart type dispatch: Use `ChartRenderer` (already handles all chart types)
- Modal lifecycle: Use `useChartFullscreen` from `hooks/useChartFullscreen.ts`
- LocalStorage: Follow pattern from `hooks/use-sticky-filters.ts`
- Types: Import `DashboardChartEntry` from `lib/types/dashboard-config.ts`

**New hook required:**
- Dashboard fetching: Create `use-swipe-dashboards.ts` in `lib/hooks/` (returns `DashboardWithCharts[]`)

**Implementation Details:**

> **PATTERN:** Following `flyout-context.tsx` and `selected-items-context.tsx` patterns - keep context slim (state + setters only, ~45 lines). Data fetching happens in container components, not context.

```typescript
// app/fullscreen-swipe-context.tsx (~45 lines - matches existing context patterns)
'use client';

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';
import type { DashboardUniversalFilters } from '@/lib/types/dashboard-rendering';

/**
 * Slim context following flyout-context.tsx pattern
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

export function FullscreenSwipeProvider({ children }: { children: React.ReactNode }) {
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
  const { setIsOpen, setCurrentDashboardId, setCurrentChartIndex, setUniversalFilters } = useFullscreenSwipe();
  
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
```

**Key differences from original design:**
1. **~45 lines** (was ~130 lines) - matches `flyout-context.tsx` pattern
2. **State + setters only** - no business logic in context
3. **No data fetching** - `useSwipeDashboards` and `useDashboardData` called in container
4. **Convenience hook** - `useOpenSwipeMode()` encapsulates open logic without bloating context

#### 1.2 Create Swipe Gesture Hook

| Task | File | Description |
|------|------|-------------|
| 1.2.1 | `hooks/useSwipeGesture.ts` | Touch event handling with gesture detection |
| 1.2.2 | Unit tests | Test gesture detection thresholds |

**Implementation Details:**

```typescript
// hooks/useSwipeGesture.ts
import { useRef, useCallback, useEffect } from 'react';

interface SwipeConfig {
  threshold?: number;        // Minimum distance (px) to trigger swipe, default: 50
  velocityThreshold?: number; // Minimum velocity (px/ms), default: 0.3
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: (direction: 'horizontal' | 'vertical') => void;
  onSwipeEnd?: () => void;
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

export function useSwipeGesture(config: SwipeConfig) {
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

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    stateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
      direction: null,
    };
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || !stateRef.current) return;
    const touch = e.touches[0];
    const state = stateRef.current;
    
    state.currentX = touch.clientX;
    state.currentY = touch.clientY;
    
    // Determine direction on first significant movement
    if (!state.direction) {
      const deltaX = Math.abs(state.currentX - state.startX);
      const deltaY = Math.abs(state.currentY - state.startY);
      
      if (deltaX > 10 || deltaY > 10) {
        state.direction = deltaX > deltaY ? 'horizontal' : 'vertical';
        onSwipeStart?.(state.direction);
      }
    }
  }, [enabled, onSwipeStart]);

  const handleTouchEnd = useCallback(() => {
    if (!enabled || !stateRef.current) return;
    const state = stateRef.current;
    
    const deltaX = state.currentX - state.startX;
    const deltaY = state.currentY - state.startY;
    const deltaTime = Date.now() - state.startTime;
    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;
    
    // Check if swipe meets threshold
    if (state.direction === 'horizontal') {
      if (Math.abs(deltaX) > threshold || velocityX > velocityThreshold) {
        if (deltaX < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }
    } else if (state.direction === 'vertical') {
      if (Math.abs(deltaY) > threshold || velocityY > velocityThreshold) {
        if (deltaY < 0) onSwipeUp?.();
        else onSwipeDown?.();
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
```

#### 1.3 Create Haptic Feedback Hook

| Task | File | Description |
|------|------|-------------|
| 1.3.1 | `hooks/useHapticFeedback.ts` | Vibration API wrapper with patterns |

**Implementation Details:**

```typescript
// hooks/useHapticFeedback.ts
import { useCallback } from 'react';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

const patterns: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  success: [10, 50, 10],
  error: [30, 50, 30, 50, 30],
};

export function useHapticFeedback() {
  const vibrate = useCallback((pattern: HapticPattern = 'light') => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(patterns[pattern]);
    }
  }, []);

  const isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return { vibrate, isSupported };
}
```

#### 1.4 Acceptance Criteria - Phase 1

- [ ] `FullscreenSwipeProvider` wraps app in `layout.tsx` and provides context
- [ ] `useFullscreenSwipe()` hook returns state and actions
- [ ] `useSwipeGesture()` detects horizontal and vertical swipes (NEW hook in `hooks/`)
- [ ] `useHapticFeedback()` triggers vibration (optional, nice-to-have)
- [ ] `useSwipeDashboards()` fetches dashboards with charts (NEW hook in `lib/hooks/`)
- [ ] Context reuses `useChartFullscreen` for mounted state, scroll lock, escape key
- [ ] TypeScript types defined in `lib/types/fullscreen-swipe.ts`
- [ ] Types import `DashboardChartEntry` from `lib/types/dashboard-config.ts` (DO NOT recreate)
- [ ] API URL: `/api/admin/analytics/dashboards?is_published=true&is_active=true` (NO include_charts)
- [ ] localStorage pattern follows `use-sticky-filters.ts` (SSR safety, error handling)
- [ ] Unit tests pass for gesture detection

**DRY Compliance Checklist:**
- [ ] NO new chart data fetching hook (use `useDashboardData`)
- [ ] NO duplicated mounted/scroll/escape logic (use `useChartFullscreen`)
- [ ] NO recreated types (import `DashboardChartEntry` from existing file)
- [ ] NO custom chart type dispatcher (use `BatchChartRenderer`)
- [ ] Reuse existing `ChartErrorBoundary`, `ChartSkeleton`, `ChartError` components

---

### Phase 2: Horizontal Chart Navigation
**Effort**: 2 days | **Priority**: HIGH

Implement horizontal swiping between charts within a single dashboard.

#### 2.1 Create Chart Swipe Container

| Task | File | Description |
|------|------|-------------|
| 2.1.1 | `components/charts/fullscreen-swipe/chart-swipe-container.tsx` | Horizontal scroll-snap container |
| 2.1.2 | `components/charts/fullscreen-swipe/chart-slide.tsx` | Individual chart wrapper (uses BatchChartRenderer) |
| 2.1.3 | Add CSS utilities | Scroll-snap styles to `style.css` |

> **REMOVED:** `chart-type-dispatcher.tsx` - Use `BatchChartRenderer` which already handles all chart types via `ChartRenderer`.
> **NOTE:** Native CSS scroll-snap + `onScroll` handler is sufficient. No `useScrollSnap` hook needed.

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/chart-swipe-container.tsx
'use client';

/**
 * Horizontal scroll-snap container for chart navigation
 * 
 * NOTE: Receives data via props from DashboardSwipeContainer.
 * Uses context ONLY for setters (setCurrentChartIndex).
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import ChartSlide from './chart-slide';

interface ChartSwipeContainerProps {
  dashboard: DashboardWithCharts;
  currentChartIndex: number;
  chartDataMap: Map<string, BatchChartData>;
  isLoading: boolean;
  error: string | null;
}

export default function ChartSwipeContainer({ 
  dashboard,
  currentChartIndex,
  chartDataMap,
  isLoading,
  error,
}: ChartSwipeContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Get setter from context
  const { setCurrentChartIndex } = useFullscreenSwipe();

  // Scroll to current chart when index changes
  useEffect(() => {
    if (!containerRef.current || isAnimating) return;
    const chartWidth = containerRef.current.offsetWidth;
    containerRef.current.scrollTo({
      left: currentChartIndex * chartWidth,
      behavior: 'smooth',
    });
  }, [currentChartIndex, isAnimating]);

  // Track scroll position to update current index
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;
    const chartWidth = containerRef.current.offsetWidth;
    const newIndex = Math.round(scrollLeft / chartWidth);
    
    if (newIndex !== currentChartIndex && newIndex >= 0 && newIndex < dashboard.charts.length) {
      setCurrentChartIndex(newIndex);
    }
  }, [currentChartIndex, dashboard.charts.length, setCurrentChartIndex]);

  return (
    <div
      ref={containerRef}
      className="chart-swipe-container"
      onScroll={handleScroll}
    >
      {dashboard.charts.map((chart, index) => {
        // Get chart data from the map
        const chartData = chartDataMap.get(chart.chart_definition_id) ?? null;
        
        return (
          <ChartSlide
            key={chart.chart_definition_id}
            chart={chart}
            chartData={chartData}
            isActive={index === currentChartIndex}
            isAdjacent={Math.abs(index - currentChartIndex) <= 1}
            isLoading={isLoading}
            error={error}
          />
        );
      })}
    </div>
  );
}
```

```typescript
// components/charts/fullscreen-swipe/chart-slide.tsx
'use client';

/**
 * Individual chart slide in swipe mode
 * 
 * KEY DECISION: Uses BatchChartRenderer instead of custom ChartTypeDispatcher
 * 
 * Why BatchChartRenderer:
 * - Already handles ALL chart types (bar, line, dual-axis, progress-bar, etc.)
 * - Already handles specialized fullscreen modals
 * - Already handles drill-down functionality
 * - Already handles dimension expansion
 * - Eliminates need for custom chart-type-dispatcher.tsx
 * 
 * See batch-chart-renderer.tsx lines 516-577 for modal handling.
 */

import { useState, useEffect } from 'react';
import BatchChartRenderer from '@/components/charts/batch-chart-renderer';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import ChartError from '../chart-error';
// Import existing types - DO NOT recreate
import type { DashboardChartEntry } from '@/lib/types/dashboard-config';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';

interface ChartSlideProps {
  chart: DashboardChartEntry;
  chartData: BatchChartData | null;
  isActive: boolean;
  isAdjacent: boolean;
  isLoading: boolean;
  error: string | null;
}

export default function ChartSlide({ 
  chart, 
  chartData, 
  isActive, 
  isAdjacent,
  isLoading,
  error,
}: ChartSlideProps) {
  const [shouldRender, setShouldRender] = useState(false);

  // Lazy load: only render if active or adjacent
  useEffect(() => {
    if (isActive || isAdjacent) {
      setShouldRender(true);
    }
  }, [isActive, isAdjacent]);

  return (
    <div className="chart-slide flex flex-col p-safe">
      {/* Chart content - BatchChartRenderer provides its own header */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        {!shouldRender ? (
          <ChartSkeleton />
        ) : isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ChartError message={error} />
        ) : !chartData ? (
          <ChartError message="Chart data not available" />
        ) : (
          <div className="w-full h-full max-w-5xl">
            {/* 
              BatchChartRenderer handles:
              - All chart types via ChartRenderer
              - ChartFullscreenModal (bar, stacked-bar, horizontal-bar)
              - DualAxisFullscreenModal
              - ProgressBarFullscreenModal
              - Drill-down support
              - Dimension expansion
              - Error boundaries internally
            */}
            <BatchChartRenderer
              chartData={chartData}
              chartDefinition={{
                chart_definition_id: chart.chart_definition_id,
                chart_name: chart.chart_name,
                chart_type: chart.chart_type,
              }}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
              hideHeader={false} // Show header with fullscreen button
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

> **REMOVED: `chart-type-dispatcher.tsx`** - This file was removed from the design because `BatchChartRenderer` already handles all chart type dispatching via `ChartRenderer`. Creating a separate dispatcher would be pure code duplication.

#### 2.2 Create Position Indicators

| Task | File | Description |
|------|------|-------------|
| 2.2.1 | `components/charts/fullscreen-swipe/position-indicators.tsx` | Dot indicators showing current position |

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/position-indicators.tsx
'use client';

interface PositionIndicatorsProps {
  total: number;
  current: number;
  onSelect?: (index: number) => void;
  className?: string;
}

export default function PositionIndicators({
  total,
  current,
  onSelect,
  className = '',
}: PositionIndicatorsProps) {
  // Collapse indicators if more than 10
  const showCollapsed = total > 10;
  const visibleRange = 5;

  if (showCollapsed) {
    // Show: first, ..., current-1, current, current+1, ..., last
    return (
      <div className={`flex items-center justify-center gap-1 ${className}`}>
        <span className="text-xs text-gray-400">
          {current + 1} / {total}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelect?.(index)}
          className={`rounded-full transition-all duration-200 ${
            index === current
              ? 'w-6 h-2 bg-violet-500'
              : 'w-2 h-2 bg-gray-400 hover:bg-gray-300'
          }`}
          aria-label={`Go to chart ${index + 1}`}
          aria-current={index === current ? 'true' : undefined}
        />
      ))}
    </div>
  );
}
```

#### 2.3 Create Fullscreen Container with Portal

| Task | File | Description |
|------|------|-------------|
| 2.3.1 | `components/charts/fullscreen-swipe/fullscreen-swipe-container.tsx` | Main container with portal rendering |

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/fullscreen-swipe-container.tsx
'use client';

/**
 * Main fullscreen container component
 * 
 * Key features:
 * - Renders via portal to document.body (like existing fullscreen modals)
 * - Only mounts when isOpen is true
 * - Uses mounted state for hydration safety (via useChartFullscreen)
 * - Contains both dashboard and overlay layers
 * - Fetches data using existing hooks (not from context)
 * 
 * Pattern from: components/charts/chart-fullscreen-modal.tsx
 * 
 * REUSES:
 * - useChartFullscreen from hooks/useChartFullscreen.ts for mounted/scroll/escape
 * - useDashboardData from hooks/use-dashboard-data.ts for chart data fetching
 * - useSwipeDashboards from lib/hooks/use-swipe-dashboards.ts for dashboard list
 * - Portal pattern from chart-fullscreen-modal.tsx (createPortal to document.body)
 * 
 * NOTE: The simplified context only contains state + setters.
 * Data fetching happens HERE in the container, not in the context.
 * This follows the pattern established by flyout-context.tsx.
 */

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
// REUSE existing hooks - DO NOT create new ones
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useSwipeDashboards } from '@/lib/hooks/use-swipe-dashboards';
import DashboardSwipeContainer from './dashboard-swipe-container';
import NavigationOverlay from './navigation-overlay';
import DashboardPeek from './dashboard-peek';

export default function FullscreenSwipeContainer() {
  // Get state from simplified context (state + setters only)
  const { 
    isOpen, 
    setIsOpen,
    currentDashboardId,
    currentChartIndex,
    universalFilters,
    showOverlay,
  } = useFullscreenSwipe();

  // REUSE useChartFullscreen for mounted state, body scroll lock, and escape key
  // This hook handles all the modal lifecycle concerns
  const { mounted } = useChartFullscreen(isOpen, () => setIsOpen(false));

  // REUSE useSwipeDashboards for dashboard list with charts
  // Only fetch when swipe mode is open
  const { data: dashboards = [], isLoading: dashboardsLoading } = useSwipeDashboards({ 
    enabled: isOpen 
  });

  // Derive dashboard index from ID (context stores ID, not index)
  const currentDashboardIndex = useMemo(() => {
    if (!currentDashboardId) return 0;
    const index = dashboards.findIndex(d => d.dashboard_id === currentDashboardId);
    return index >= 0 ? index : 0;
  }, [currentDashboardId, dashboards]);

  const currentDashboard = dashboards[currentDashboardIndex];

  // REUSE existing useDashboardData hook for chart data fetching
  // This is the same hook used by dashboard-view.tsx
  const { data, isLoading: chartsLoading, error } = useDashboardData({
    dashboardId: currentDashboard?.dashboard_id ?? '',
    universalFilters: universalFilters ?? undefined,
    enabled: isOpen && !!currentDashboard,
  });

  // Convert data.charts to Map for component consumption
  // data.charts is Record<string, ChartRenderResult>
  const chartDataMap = useMemo(() => {
    return data?.charts 
      ? new Map(Object.entries(data.charts)) 
      : new Map();
  }, [data?.charts]);

  // Combined loading state
  const isLoading = dashboardsLoading || chartsLoading;

  // Don't render until mounted (hydration safety)
  if (!mounted) return null;
  
  // Don't render if not open
  if (!isOpen) return null;

  const content = (
    <div 
      className="fixed inset-0 z-[100] bg-gray-900 dark:bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen chart viewer"
    >
      {/* Main swipe container - pass data and derived state */}
      <DashboardSwipeContainer 
        dashboards={dashboards}
        currentDashboardIndex={currentDashboardIndex}
        currentChartIndex={currentChartIndex}
        chartDataMap={chartDataMap} 
        isLoading={isLoading} 
        error={error ?? null} 
      />
      
      {/* Dashboard peek hints (top/bottom edges) */}
      <DashboardPeek 
        dashboards={dashboards}
        currentDashboardIndex={currentDashboardIndex}
      />
      
      {/* Navigation overlay (auto-hides) */}
      <NavigationOverlay 
        dashboards={dashboards}
        currentDashboardIndex={currentDashboardIndex}
        currentChartIndex={currentChartIndex}
        showOverlay={showOverlay}
      />
    </div>
  );

  // Render via portal to document.body (same pattern as chart-fullscreen-modal.tsx)
  return createPortal(content, document.body);
}
```

#### 2.4 Add Keyboard Navigation

| Task | File | Description |
|------|------|-------------|
| 2.4.1 | Update `useChartFullscreen.ts` | Add arrow key handlers for navigation |

#### 2.5 Acceptance Criteria - Phase 2

- [ ] Horizontal swipe navigates between charts
- [ ] Scroll-snap stops precisely on each chart
- [ ] Position indicators update in real-time
- [ ] Clicking indicators navigates to that chart
- [ ] Keyboard arrows work on desktop
- [ ] Haptic feedback on navigation (mobile) - optional
- [ ] Only active + adjacent charts are rendered (lazy loading)
- [ ] Smooth 300ms animations
- [ ] `BatchChartRenderer` used for chart rendering (NOT custom dispatcher)
- [ ] ALL chart types work (bar, line, dual-axis, progress-bar, table, etc.)
- [ ] Specialized fullscreen modals work (dual-axis, progress-bar)
- [ ] Drill-down functionality works (inherited from BatchChartRenderer)

---

### Phase 3: Vertical Dashboard Navigation
**Effort**: 2 days | **Priority**: MEDIUM

Implement vertical swiping between dashboards.

#### 3.1 Create Dashboard Swipe Container

| Task | File | Description |
|------|------|-------------|
| 3.1.1 | `components/charts/fullscreen-swipe/dashboard-swipe-container.tsx` | Vertical scroll-snap container |
| 3.1.2 | `components/charts/fullscreen-swipe/dashboard-slide.tsx` | Dashboard wrapper containing chart container |

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/dashboard-swipe-container.tsx
'use client';

/**
 * Vertical scroll-snap container for dashboard navigation
 * 
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Does NOT use context for data - only for setters.
 * This follows the pattern where data flows down via props.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import DashboardSlide from './dashboard-slide';
import ChartSwipeContainer from './chart-swipe-container';

interface DashboardSwipeContainerProps {
  dashboards: DashboardWithCharts[];
  currentDashboardIndex: number;
  currentChartIndex: number;
  chartDataMap: Map<string, BatchChartData>;
  isLoading: boolean;
  error: string | null;
}

export default function DashboardSwipeContainer({
  dashboards,
  currentDashboardIndex,
  currentChartIndex,
  chartDataMap,
  isLoading,
  error,
}: DashboardSwipeContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Get setters from context (state flows down via props, setters from context)
  const { setCurrentDashboardId, setIsOpen, setCurrentChartIndex } = useFullscreenSwipe();

  // Scroll to current dashboard when index changes
  useEffect(() => {
    if (!containerRef.current || isAnimating) return;
    const dashboardHeight = containerRef.current.offsetHeight;
    containerRef.current.scrollTo({
      top: currentDashboardIndex * dashboardHeight,
      behavior: 'smooth',
    });
  }, [currentDashboardIndex, isAnimating]);

  // Track scroll position to update current index
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const dashboardHeight = containerRef.current.offsetHeight;
    const newIndex = Math.round(scrollTop / dashboardHeight);
    
    if (newIndex !== currentDashboardIndex && dashboards[newIndex]) {
      // Update dashboard ID in context
      setCurrentDashboardId(dashboards[newIndex].dashboard_id);
      // Reset chart index when switching dashboards
      setCurrentChartIndex(0);
    }
    
    // Exit if scrolled above first dashboard
    if (scrollTop < -100 && currentDashboardIndex === 0) {
      setIsOpen(false);
    }
  }, [currentDashboardIndex, dashboards, setCurrentDashboardId, setCurrentChartIndex, setIsOpen]);

  const currentDashboard = dashboards[currentDashboardIndex];

  return (
    <div
      ref={containerRef}
      className="dashboard-swipe-container"
      onScroll={handleScroll}
    >
      {dashboards.map((dashboard, index) => (
        <div
          key={dashboard.dashboard_id}
          className="dashboard-slide"
        >
          {/* Only render chart container for current dashboard to save resources */}
          {index === currentDashboardIndex && currentDashboard && (
            <ChartSwipeContainer
              dashboard={currentDashboard}
              currentChartIndex={currentChartIndex}
              chartDataMap={chartDataMap}
              isLoading={isLoading}
              error={error}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

#### 3.2 Create Dashboard Peek Component

| Task | File | Description |
|------|------|-------------|
| 3.2.1 | `components/charts/fullscreen-swipe/dashboard-peek.tsx` | Shows next/prev dashboard name at edges |

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/dashboard-peek.tsx
'use client';

/**
 * Shows next/prev dashboard names at screen edges
 * 
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Does NOT use context for data - follows props-down pattern.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DashboardWithCharts } from '@/lib/types/dashboards';

interface DashboardPeekProps {
  dashboards: DashboardWithCharts[];
  currentDashboardIndex: number;
}

export default function DashboardPeek({ 
  dashboards, 
  currentDashboardIndex 
}: DashboardPeekProps) {
  const prevDashboard = dashboards[currentDashboardIndex - 1];
  const nextDashboard = dashboards[currentDashboardIndex + 1];

  return (
    <>
      {/* Previous dashboard hint (top) */}
      {prevDashboard && (
        <div className="absolute top-0 inset-x-0 flex items-center justify-center py-2 pointer-events-none pt-safe">
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1">
            <ChevronUp className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{prevDashboard.dashboard_name}</span>
          </div>
        </div>
      )}
      
      {/* Next dashboard hint (bottom) */}
      {nextDashboard && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-center py-2 pointer-events-none pb-safe">
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1">
            <ChevronDown className="w-3 h-3" />
            <span className="truncate max-w-[200px]">{nextDashboard.dashboard_name}</span>
          </div>
        </div>
      )}
    </>
  );
}
```

#### 3.3 Implement Exit on Over-scroll

| Task | File | Description |
|------|------|-------------|
| 3.3.1 | Update `dashboard-swipe-container.tsx` | Detect over-scroll on first dashboard and close |

#### 3.4 Acceptance Criteria - Phase 3

- [ ] Vertical swipe navigates between dashboards
- [ ] Dashboard name peeks at top/bottom edges
- [ ] Scroll-snap stops precisely on each dashboard
- [ ] Chart position resets to 0 when switching dashboards
- [ ] Swipe down on first dashboard exits fullscreen
- [ ] Exit animation (scale down + fade)
- [ ] Keyboard up/down arrows work

---

### Phase 4: Navigation Overlay
**Effort**: 1-2 days | **Priority**: MEDIUM

Create the auto-hiding overlay with controls and information.

#### 4.1 Create Navigation Overlay

| Task | File | Description |
|------|------|-------------|
| 4.1.1 | `components/charts/fullscreen-swipe/navigation-overlay.tsx` | Header, close button, position info |
| 4.1.2 | Implement auto-hide | Hide after 3 seconds of inactivity |
| 4.1.3 | Tap to toggle | Show overlay on any tap |

**Implementation Details:**

```typescript
// components/charts/fullscreen-swipe/navigation-overlay.tsx
'use client';

/**
 * Auto-hiding navigation overlay with controls
 * 
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Uses context ONLY for setters (setIsOpen, setShowOverlay, setCurrentChartIndex).
 */

import { useEffect, useRef, useState } from 'react';
import { X, MoreVertical } from 'lucide-react';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import PositionIndicators from './position-indicators';
import FilterDisplay from './filter-display';

interface NavigationOverlayProps {
  dashboards: DashboardWithCharts[];
  currentDashboardIndex: number;
  currentChartIndex: number;
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
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [isExiting, setIsExiting] = useState(false);

  const currentDashboard = dashboards[currentDashboardIndex];
  const totalCharts = currentDashboard?.charts.length || 0;

  // Auto-hide overlay after delay
  useEffect(() => {
    if (showOverlay && OVERLAY_AUTO_HIDE_DELAY > 0) {
      timeoutRef.current = setTimeout(() => {
        setShowOverlay(false);
      }, OVERLAY_AUTO_HIDE_DELAY);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [showOverlay, setShowOverlay]);

  // Handle close
  const handleClose = () => {
    setIsOpen(false);
  };

  // Handle chart selection from indicators
  const handleChartSelect = (index: number) => {
    setCurrentChartIndex(index);
  };

  if (!showOverlay && !isExiting) return null;

  return (
    <div 
      className={`absolute inset-0 pointer-events-none z-50 ${
        showOverlay ? 'overlay-enter' : 'overlay-exit'
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
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {/* Open quick actions - future enhancement */}}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white"
              aria-label="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
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
```

#### 4.2 Integrate Existing Controls

| Task | File | Description |
|------|------|-------------|
| 4.2.1 | `components/charts/fullscreen-swipe/filter-display.tsx` | Show active universal filters |
| 4.2.2 | Add dimension expansion to overlay | Reuse `DimensionCheckboxes` component |
| 4.2.3 | Add chart-specific actions | Refresh, export buttons |

**Filter Display Implementation:**

```typescript
// components/charts/fullscreen-swipe/filter-display.tsx
'use client';

import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import { Calendar, Building2, Stethoscope, User } from 'lucide-react';

/**
 * Displays active universal filters in a compact format
 * Shows date range, organization, practice, and provider filters
 * 
 * Note: Uses DashboardUniversalFilters type properties:
 * - dateRangePreset (string) - not dateRange
 * - organizationId (string)
 * - practiceUids (number[]) - not practiceId
 * - providerName (string) - not providerId
 */
export default function FilterDisplay() {
  const { universalFilters } = useFullscreenSwipe();
  
  if (!universalFilters) return null;
  
  const hasActiveFilters = 
    universalFilters.dateRangePreset || 
    universalFilters.organizationId || 
    (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) ||
    universalFilters.providerName;
  
  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs text-white/80">
      {universalFilters.dateRangePreset && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Calendar className="w-3 h-3" />
          <span>{universalFilters.dateRangePreset}</span>
        </div>
      )}
      
      {universalFilters.organizationId && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Building2 className="w-3 h-3" />
          <span className="truncate max-w-[100px]">Organization</span>
        </div>
      )}
      
      {universalFilters.practiceUids && universalFilters.practiceUids.length > 0 && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <Stethoscope className="w-3 h-3" />
          <span className="truncate max-w-[100px]">
            {universalFilters.practiceUids.length === 1 
              ? 'Practice' 
              : `${universalFilters.practiceUids.length} Practices`}
          </span>
        </div>
      )}
      
      {universalFilters.providerName && (
        <div className="flex items-center gap-1 bg-white/10 rounded-full px-2 py-1">
          <User className="w-3 h-3" />
          <span className="truncate max-w-[100px]">
            {universalFilters.providerName}
          </span>
        </div>
      )}
    </div>
  );
}
```

Then integrate in `navigation-overlay.tsx`:

```typescript
// In the header section, after dashboard info
<div className="flex-1 min-w-0">
  <h1 className="text-white font-semibold truncate">
    {currentDashboard?.dashboard_name || 'Dashboard'}
  </h1>
  <p className="text-white/70 text-sm">
    Dashboard {currentDashboardIndex + 1} of {dashboards.length}
  </p>
  {/* Add filter display */}
  <FilterDisplay />
</div>
```

#### 4.3 Acceptance Criteria - Phase 4

- [ ] Overlay shows on tap, hides after 3 seconds
- [ ] Close button exits fullscreen
- [ ] Dashboard name and position visible
- [ ] Active universal filters displayed in header
- [ ] Chart position indicators at bottom
- [ ] Gradient backgrounds for readability
- [ ] Safe area padding on notched devices
- [ ] Dimension expansion controls available
- [ ] More options menu for export/refresh

---

### Phase 5: Polish & Accessibility
**Effort**: 1-2 days | **Priority**: LOW

Add finishing touches, accessibility, and optimizations.

#### 5.1 Accessibility Improvements

| Task | File | Description |
|------|------|-------------|
| 5.1.1 | Add ARIA labels | Announce chart/dashboard changes |
| 5.1.2 | Support reduced motion | Check `prefers-reduced-motion` |
| 5.1.3 | Focus management | Trap focus in fullscreen mode |

**Implementation Details:**

```typescript
// Check reduced motion preference
const prefersReducedMotion = 
  typeof window !== 'undefined' && 
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Use instant scroll instead of smooth if reduced motion
containerRef.current.scrollTo({
  left: currentChartIndex * chartWidth,
  behavior: prefersReducedMotion ? 'instant' : 'smooth',
});
```

#### 5.2 Performance Optimization

| Task | File | Description |
|------|------|-------------|
| 5.2.1 | Virtualize chart rendering | Only render visible + 1 on each side |
| 5.2.2 | Preload adjacent dashboard data | Fetch next dashboard's chart data |
| 5.2.3 | Memory cleanup | Destroy Chart.js instances when not visible |

#### 5.3 Add Entry Points

| Task | File | Description |
|------|------|-------------|
| 5.3.1 | Update `BatchChartRenderer` | Add "Enter Swipe Mode" option |
| 5.3.2 | Update `DashboardView` | Add "Present" button in header |
| 5.3.3 | Add keyboard shortcut | `F` key to enter from focused chart |

#### 5.4 Acceptance Criteria - Phase 5

- [ ] Screen reader announces navigation
- [ ] Reduced motion preference respected
- [ ] Focus trapped in fullscreen
- [ ] Only 3 charts rendered at a time (current + adjacent)
- [ ] Chart instances destroyed when not visible
- [ ] "Present" button in dashboard header
- [ ] `F` key enters fullscreen from chart

---

### Phase 6: Optional Enhancements (Future)
**Effort**: 1 day | **Priority**: OPTIONAL

These enhancements can be added later based on user feedback. They are not required for core functionality.

#### 6.1 First-Time Tutorial

| Task | File | Description |
|------|------|-------------|
| 6.1.1 | `components/charts/fullscreen-swipe/swipe-tutorial.tsx` | Animated gesture hints for first-time users |
| 6.1.2 | Add localStorage check | Only show once per user (follow `use-sticky-filters.ts` pattern) |

> **Note:** Consider using a simpler toast notification on first use instead of a full tutorial overlay.

#### 6.2 Haptic Feedback

| Task | File | Description |
|------|------|-------------|
| 6.2.1 | `hooks/useHapticFeedback.ts` | Vibration API wrapper for mobile devices |
| 6.2.2 | Integrate with swipe gestures | Trigger subtle vibration on navigation |

**Implementation Details:**

```typescript
// hooks/useHapticFeedback.ts
export function useHapticFeedback() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Silently fail - not all devices support vibration
      }
    }
  }, []);

  return { vibrate, isSupported: typeof navigator !== 'undefined' && 'vibrate' in navigator };
}
```

> **Note:** Vibration API has limited browser support. This is a nice-to-have enhancement.

#### 6.3 Acceptance Criteria - Phase 6

- [ ] Tutorial shows for first-time users (if implemented)
- [ ] Tutorial dismisses with localStorage persistence
- [ ] Haptic feedback on chart/dashboard transitions (if implemented)
- [ ] Haptic failures handled gracefully

---

## File Change Summary

### New Files (Core: 13, Optional: 2)

**Core Files (Phases 1-5):**

| File | Phase | Purpose |
|------|-------|---------|
| `app/fullscreen-swipe-context.tsx` | 1 | Slim context (~45 lines, state + setters only) |
| `lib/types/fullscreen-swipe.ts` | 1 | Minimal types (imports shared types) |
| `lib/types/dashboard-rendering.ts` | 1 | Centralized shared types (moved from hooks) |
| `lib/hooks/use-swipe-dashboards.ts` | 1 | Fetch dashboards with charts for swipe mode |
| `hooks/useSwipeGesture.ts` | 1 | Touch gesture detection with velocity |
| `components/charts/fullscreen-swipe/index.ts` | 2 | Public exports |
| `components/charts/fullscreen-swipe/fullscreen-swipe-container.tsx` | 2 | Main container (portal to body) |
| `components/charts/fullscreen-swipe/chart-swipe-container.tsx` | 2 | Horizontal scroll-snap container |
| `components/charts/fullscreen-swipe/chart-slide.tsx` | 2 | Individual chart wrapper (uses BatchChartRenderer) |
| `components/charts/fullscreen-swipe/position-indicators.tsx` | 2 | Dot indicators with collapsed mode |
| `components/charts/fullscreen-swipe/dashboard-swipe-container.tsx` | 3 | Vertical scroll-snap container |
| `components/charts/fullscreen-swipe/dashboard-peek.tsx` | 3 | Next/prev dashboard hint at edges |
| `components/charts/fullscreen-swipe/navigation-overlay.tsx` | 4 | Auto-hiding controls overlay |
| `components/charts/fullscreen-swipe/filter-display.tsx` | 4 | Active filters display in overlay header |

**Optional Files (Phase 6 - Future):**

| File | Phase | Purpose |
|------|-------|---------|
| `hooks/useHapticFeedback.ts` | 6 | Vibration API wrapper (optional enhancement) |
| `components/charts/fullscreen-swipe/swipe-tutorial.tsx` | 6 | Animated gesture hints (optional) |

### Removed Files (vs. original design)

| Removed File | Reason |
|--------------|--------|
| `chart-type-dispatcher.tsx` | Duplicates `ChartRenderer` - use `BatchChartRenderer` instead |
| `useScrollSnap.ts` | Native CSS scroll-snap + `onScroll` handler is sufficient |
| `quick-actions-sheet.tsx` | Deferred to future phase - no clear user need yet |

### Reused Existing Files (NO CHANGES NEEDED - DRY)

| File | Purpose |
|------|---------|
| `hooks/use-dashboard-data.ts` | Chart data batch fetching |
| `hooks/useChartFullscreen.ts` | Modal lifecycle (mounted, scroll lock, escape) |
| `hooks/use-sticky-filters.ts` | localStorage pattern reference |
| `components/charts/batch-chart-renderer.tsx` | **KEY** - Renders all chart types + handles fullscreen modals |
| `components/charts/chart-renderer.tsx` | Chart type dispatch (used by BatchChartRenderer) |
| `components/charts/chart-error-boundary.tsx` | Error boundary |
| `components/ui/loading-skeleton.tsx` | ChartSkeleton |
| `components/charts/chart-error.tsx` | Error display |
| `lib/types/dashboards.ts` | DashboardWithCharts type |
| `lib/types/dashboard-config.ts` | DashboardChartEntry type (DO NOT recreate) |

**Key insight:** `BatchChartRenderer` already handles:
- All chart types via `ChartRenderer` (lines 136-148)
- `ChartFullscreenModal` (bar, stacked-bar, horizontal-bar)
- `DualAxisFullscreenModal`
- `ProgressBarFullscreenModal`
- Drill-down support
- Dimension expansion

This eliminates the need for custom chart type dispatching.

### Modified Files (5 total)

| File | Phase | Changes |
|------|-------|---------|
| `app/layout.tsx` | 1 | Add `FullscreenSwipeProvider` to provider composition |
| `hooks/use-dashboard-data.ts` | 1 | Add re-exports for type centralization (backward compatibility) |
| `app/css/style.css` | 2 | Add scroll-snap CSS utilities, overlay animations |
| `components/charts/batch-chart-renderer.tsx` | 5 | Add "Enter Swipe Mode" option to menu |
| `components/charts/dashboard-view.tsx` | 5 | Add "Present" button in header |

---

## Testing Strategy

### Unit Tests

| Component/Hook | Test Cases | File Location |
|----------------|------------|---------------|
| `useSwipeGesture` | Threshold detection, velocity calculation, direction lock | `tests/unit/hooks/useSwipeGesture.test.ts` |
| `useSwipeDashboards` | Fetches dashboards, filters by chart_count > 0 | `tests/unit/hooks/useSwipeDashboards.test.ts` |
| `PositionIndicators` | Correct count, active state, collapsed mode (>10) | `tests/unit/components/position-indicators.test.tsx` |
| `NavigationOverlay` | Auto-hide timing, visibility toggle | `tests/unit/components/navigation-overlay.test.tsx` |
| `ChartSlide` | Lazy loading triggers, uses BatchChartRenderer | `tests/unit/components/chart-slide.test.tsx` |
| `FilterDisplay` | Shows/hides based on active filters, correct property names | `tests/unit/components/filter-display.test.tsx` |
| `FullscreenSwipeContext` | Open/close, state management | `tests/unit/context/fullscreen-swipe-context.test.tsx` |
| `FullscreenSwipeContainer` | Data fetching orchestration, portal rendering | `tests/unit/components/fullscreen-swipe-container.test.tsx` |

**Note:** Existing hooks (`useDashboardData`, `useChartFullscreen`) are already tested in their respective test files. Do NOT duplicate those tests.

**Optional (Phase 6):**

| Component/Hook | Test Cases | File Location |
|----------------|------------|---------------|
| `useHapticFeedback` | Vibration called, fallback for unsupported | `tests/unit/hooks/useHapticFeedback.test.ts` |
| `SwipeTutorial` | localStorage persistence, dismiss behavior | `tests/unit/components/swipe-tutorial.test.tsx` |

### Integration Tests

| Flow | Test Cases | File Location |
|------|------------|---------------|
| Enter fullscreen | Opens at correct chart, loads dashboard list, fetches chart data | `tests/integration/fullscreen-swipe-entry.test.ts` |
| Horizontal navigation | Swipe changes chart, indicators update, data cached | `tests/integration/chart-navigation.test.ts` |
| Vertical navigation | Swipe changes dashboard, chart resets, new data loads | `tests/integration/dashboard-navigation.test.ts` |
| Exit | X button, escape key, pinch, over-scroll all close | `tests/integration/fullscreen-exit.test.ts` |
| Keyboard | Arrow keys navigate, F opens, Escape closes | `tests/integration/keyboard-navigation.test.ts` |
| Error handling | Network failure, invalid chart data, retry | `tests/integration/error-handling.test.ts` |

### Manual Testing Checklist

| Scenario | Devices |
|----------|---------|
| Swipe left/right | iPhone, Android, iPad |
| Swipe up/down | iPhone, Android, iPad |
| Pinch to exit | iPhone, Android |
| Orientation change | iPhone, iPad |
| Notched device safe areas | iPhone X+, Pixel |
| Desktop keyboard | Chrome, Firefox, Safari |
| Screen reader | VoiceOver, NVDA |

---

## Accessibility

### WCAG 2.1 Compliance

| Requirement | Implementation |
|-------------|----------------|
| **2.1.1 Keyboard** | Full keyboard navigation with arrows |
| **2.1.2 No Keyboard Trap** | Escape key always exits |
| **2.4.3 Focus Order** | Logical tab order in overlay |
| **2.4.7 Focus Visible** | Visible focus indicators |
| **4.1.2 Name, Role, Value** | ARIA labels on all controls |

### Screen Reader Announcements

```typescript
// Announce chart changes
useEffect(() => {
  if (typeof window !== 'undefined') {
    const announcement = `Now viewing chart ${currentChartIndex + 1} of ${totalCharts}: ${chartTitle}`;
    // Use aria-live region
  }
}, [currentChartIndex]);
```

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  .chart-swipe-container,
  .dashboard-swipe-container {
    scroll-behavior: auto;
  }
  
  .overlay-enter,
  .overlay-exit {
    animation: none;
  }
}
```

---

## Performance Considerations

### Lazy Loading Strategy

| Distance from Current | Render State |
|-----------------------|--------------|
| Current chart | Fully rendered with data |
| ±1 chart | Rendered, data loaded |
| ±2 charts | Component mounted, data loading |
| >2 charts | Not mounted |

### Memory Management

```typescript
// Destroy chart instances when slide is unmounted
useEffect(() => {
  return () => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }
  };
}, []);
```

### Bundle Size

- Use dynamic imports for fullscreen components
- Tree-shake unused gesture handlers on desktop

```typescript
const FullscreenSwipeContainer = dynamic(
  () => import('./fullscreen-swipe/fullscreen-swipe-container'),
  { loading: () => <ChartSkeleton /> }
);
```

---

## Migration & Rollout

### Rollout Plan

| Week | Action |
|------|--------|
| Week 1 | Deploy Phase 1-2, internal testing |
| Week 2 | Enable for beta users, deploy Phase 3 |
| Week 3 | Deploy Phase 4-5, full rollout |
| Week 4 | Monitor metrics, iterate on feedback |

### Backward Compatibility

- Existing fullscreen modal remains unchanged
- Swipe mode is a separate entry point
- No breaking changes to chart components

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Fullscreen usage per session | 1.2 | 3+ |
| Average charts viewed per fullscreen session | 1 | 4+ |
| Dashboard presentation mode usage | N/A | 20% of power users |
| Mobile dashboard engagement | Baseline | +30% |
| Time spent in analytics views | Baseline | +25% |

---

## Appendix: Type Definitions

### Type Centralization Strategy

To prevent type drift and ensure strict typing, shared types are centralized:

| Type | Location | Used By |
|------|----------|---------|
| `DashboardWithCharts` | `lib/types/dashboards.ts` | Hooks, services, components |
| `DashboardChartEntry` | `lib/types/dashboard-config.ts` | Chart slide, renderers |
| `DashboardUniversalFilters` | `lib/types/dashboard-rendering.ts` | Context, hooks, API |
| `DashboardRenderResponse` | `lib/types/dashboard-rendering.ts` | Hooks, services |
| `ChartRenderResult` | `lib/types/dashboard-rendering.ts` | Hooks, services |

**New centralized types file:**

```typescript
// lib/types/dashboard-rendering.ts - CENTRALIZE SHARED TYPES

import type { ChartDataStructure } from './dimensions';

/**
 * Raw analytics data row
 */
interface AnalyticsRow {
  [key: string]: string | number | boolean | null | undefined;
}

// Move from hooks/use-dashboard-data.ts to prevent drift
export interface DashboardUniversalFilters {
  startDate?: string | null;
  endDate?: string | null;
  dateRangePreset?: string;
  organizationId?: string | null;
  practiceUids?: number[];
  providerName?: string | null;
}

// Move from hooks/use-dashboard-data.ts
export interface ChartRenderResult {
  chartData: ChartDataStructure;
  rawData: AnalyticsRow[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
  };
}

// Move from hooks/use-dashboard-data.ts
export interface DashboardRenderResponse {
  charts: Record<string, ChartRenderResult>;
  metadata: {
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
    queriesExecuted: number;
    chartsRendered: number;
    dashboardFiltersApplied: string[];
    parallelExecution: boolean;
  };
}
```

**Backward Compatibility - Re-exports:**

To avoid breaking existing imports, add re-exports to `hooks/use-dashboard-data.ts`:

```typescript
// hooks/use-dashboard-data.ts - ADD RE-EXPORTS for backward compatibility

// Re-export types from centralized location
export type { 
  DashboardUniversalFilters,
  DashboardRenderResponse,
  ChartRenderResult,
} from '@/lib/types/dashboard-rendering';

// ... rest of hook implementation
```

This allows existing code using `import { DashboardUniversalFilters } from '@/hooks/use-dashboard-data'` to continue working while new code can import from the centralized location.

### Swipe Mode Types (Minimal)

```typescript
// lib/types/fullscreen-swipe.ts - MINIMAL, import shared types

import type { DashboardUniversalFilters } from './dashboard-rendering';

/**
 * Swipe gesture configuration
 */
export interface SwipeGestureConfig {
  threshold?: number;         // Minimum distance (px), default: 50
  velocityThreshold?: number; // Minimum velocity (px/ms), default: 0.3
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeStart?: (direction: 'horizontal' | 'vertical') => void;
  onSwipeEnd?: () => void;
  enabled?: boolean;
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
 * Haptic feedback patterns
 * Maps to vibration durations/sequences
 */
export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/**
 * Chart type dispatcher props
 * Used to route to correct chart renderer
 */
export interface ChartTypeDispatcherProps {
  /** Chart definition from dashboard */
  chart: DashboardChartEntry;
  /** Pre-fetched chart data */
  chartData: BatchChartData;
  /** Whether rendering in fullscreen mode */
  isFullscreen?: boolean;
}
```

---

## Open Questions

1. **Dashboard ordering** - Should swipe order follow menu order, most recent, or user preference?

2. **Deep linking** - Should fullscreen URLs be shareable? (e.g., `/dashboard/abc/fullscreen?chart=2`)

3. **Offline support** - Should viewed charts be cached for offline re-viewing?

4. **Analytics** - What events should we track? (enter, exit, swipes, time per chart)

5. **Collaboration** - Should there be a "sync" mode for presentations where multiple viewers follow the presenter?

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-07 | Engineering | **Round 2 Review Fixes:** Fixed FilterDisplay property names (dateRangePreset, practiceUids, providerName). Updated all container components to accept props instead of using context for data (props-down pattern). Fixed fullscreen-swipe-container to use useChartFullscreen and useSwipeDashboards. Added backward compatibility re-exports for type centralization. Updated testing strategy to remove deleted file references. Added missing BatchChartData import. |
| 2025-12-07 | Engineering | Pattern alignment: Simplified context to ~45 lines (state + setters only like flyout-context), centralized shared types in `lib/types/dashboard-rendering.ts`, moved haptics/tutorial to optional Phase 6 |
| 2025-12-07 | Engineering | Code review feedback: Removed `chart-type-dispatcher.tsx` (use `BatchChartRenderer`), removed `useScrollSnap` (native CSS sufficient), fixed API URL (no `include_charts` param), moved `use-swipe-dashboards` to `lib/hooks/`, import `DashboardChartEntry` from existing file. Reduced to 13 new files. |
| 2025-12-07 | Engineering | Final review: Added `useSwipeDashboards` hook. |
| 2025-12-07 | Engineering | DRY compliance review: Reuse `useDashboardData`, `useChartFullscreen`. Added reused files section. |
| 2025-12-07 | Engineering | Initial comprehensive design with data fetching strategy, type definitions |
| 2025-01-07 | Engineering | Initial design document |

