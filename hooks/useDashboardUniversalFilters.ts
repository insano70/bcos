/**
 * useDashboardUniversalFilters Hook
 *
 * Manages dashboard universal filter state with URL param sync and localStorage persistence.
 * Handles filter initialization priority: URL params > localStorage > dashboard defaults.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module hooks/useDashboardUniversalFilters
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DashboardUniversalFilters } from '@/hooks/useDashboardData';
import { useStickyFilters } from '@/hooks/useStickyFilters';
import { clearDimensionCaches } from '@/hooks/useDimensionExpansion';
import { clientDebugLog } from '@/lib/utils/debug-client';

/**
 * Filter configuration from dashboard layout
 */
export interface FilterConfig {
  enabled?: boolean;
  defaultFilters?: Partial<DashboardUniversalFilters>;
}

/**
 * Options for useDashboardUniversalFilters hook
 */
export interface UseDashboardUniversalFiltersOptions {
  /** User ID for scoped localStorage */
  userId?: string | undefined;
  /** List of organization IDs the user has access to */
  accessibleOrganizationIds?: string[];
  /** Filter config from dashboard layout */
  filterConfig?: FilterConfig | undefined;
}

/**
 * Return type for useDashboardUniversalFilters hook
 */
export interface UseDashboardUniversalFiltersResult {
  /** Current filter state */
  universalFilters: DashboardUniversalFilters;
  /** Handle filter changes (updates state, URL, and localStorage) */
  handleFilterChange: (newFilters: DashboardUniversalFilters) => void;
  /** Remove a specific filter */
  handleRemoveFilter: (filterKey: keyof DashboardUniversalFilters) => void;
  /** Whether filter bar should be shown */
  showFilterBar: boolean;
  /** Clear invalid org filter (for external error handling) */
  clearInvalidOrgFilter: () => void;
}

/**
 * Hook to manage dashboard universal filters
 *
 * Features:
 * - URL param synchronization
 * - localStorage persistence via useStickyFilters
 * - Priority chain: URL params > localStorage > dashboard defaults > undefined
 * - Auto-clearing of dimension expansion caches on filter change
 * - External hook for clearing invalid org filters (for RBAC errors)
 *
 * @param options - Configuration including userId, accessible orgs, and filter config
 * @returns Filter state and handlers
 */
export function useDashboardUniversalFilters(
  options: UseDashboardUniversalFiltersOptions
): UseDashboardUniversalFiltersResult {
  const { userId, accessibleOrganizationIds = [], filterConfig } = options;

  const searchParams = useSearchParams();
  const router = useRouter();

  // Use user-scoped sticky filters with organization validation
  const { loadPreferences, savePreferences, removeFilter } = useStickyFilters({
    userId,
    accessibleOrganizationIds,
  });

  // Whether filter bar should be shown (default to true if not specified)
  const showFilterBar = filterConfig?.enabled !== false;

  // Initialize filters with priority chain: URL params > localStorage > dashboard defaults
  const [universalFilters, setUniversalFilters] =
    useState<DashboardUniversalFilters>(() => {
      const practice = searchParams.get('practice');
      const defaultFilters = filterConfig?.defaultFilters || {};
      const savedPreferences = loadPreferences();

      // DIAGNOSTIC: Log initialization state
      clientDebugLog.filter('[INIT] useState initializer running', {
        timestamp: new Date().toISOString(),
        hasFilterConfig: !!filterConfig,
        filterConfigEnabled: filterConfig?.enabled,
        defaultFilters,
        savedPreferences,
        urlParams: {
          datePreset: searchParams.get('datePreset'),
          org: searchParams.get('org'),
          practice: searchParams.get('practice'),
          provider: searchParams.get('provider'),
        },
        userId,
        accessibleOrgCount: accessibleOrganizationIds.length,
        accessibleOrganizationIds,
      });

      // Parse practice UID safely with NaN validation
      let practiceUids: number[] | undefined;
      if (practice) {
        const parsed = parseInt(practice, 10);
        if (!Number.isNaN(parsed)) {
          practiceUids = [parsed];
        }
      } else if (
        savedPreferences.practiceUids &&
        savedPreferences.practiceUids.length > 0
      ) {
        // Use saved practice UIDs if no URL param
        practiceUids = savedPreferences.practiceUids;
      }

      const resolvedFilters = {
        // Priority chain: URL params > localStorage > Dashboard defaults > undefined
        dateRangePreset:
          searchParams.get('datePreset') ||
          savedPreferences.dateRangePreset ||
          defaultFilters.dateRangePreset ||
          undefined,
        startDate: searchParams.get('startDate') || undefined,
        endDate: searchParams.get('endDate') || undefined,
        organizationId:
          searchParams.get('org') ||
          savedPreferences.organizationId ||
          defaultFilters.organizationId ||
          undefined,
        practiceUids,
        providerName:
          searchParams.get('provider') ||
          savedPreferences.providerName ||
          undefined,
      } as DashboardUniversalFilters;

      // DIAGNOSTIC: Log resolved filters with sources
      clientDebugLog.filter('[INIT] Resolved initial filters', {
        resolvedFilters,
        sources: {
          dateRangePreset: searchParams.get('datePreset') ? 'URL' : savedPreferences.dateRangePreset ? 'localStorage' : defaultFilters.dateRangePreset ? 'dashboardDefault' : 'none',
          organizationId: searchParams.get('org') ? 'URL' : savedPreferences.organizationId ? 'localStorage' : defaultFilters.organizationId ? 'dashboardDefault' : 'none',
        },
      });

      return resolvedFilters;
    });

  // Track whether we've applied dashboard defaults (to avoid re-applying on every render)
  const hasAppliedDefaultsRef = useRef(false);

  // Track whether we've re-initialized after userId became available
  const hasReInitializedWithUserIdRef = useRef(false);

  // Re-initialize filters when userId becomes available
  // This fixes the race condition where initial render has userId=undefined,
  // causing localStorage to read from wrong key (bcos_dashboard_filters instead of bcos_dashboard_filters_{userId})
  useEffect(() => {
    // Skip if we don't have userId yet or already re-initialized
    if (!userId || hasReInitializedWithUserIdRef.current) {
      return;
    }

    clientDebugLog.filter('[USERID_INIT] userId became available - re-initializing filters', {
      timestamp: new Date().toISOString(),
      userId,
      accessibleOrgCount: accessibleOrganizationIds.length,
    });

    // Mark as done before loading to prevent any edge cases
    hasReInitializedWithUserIdRef.current = true;

    // Load preferences with correct user-scoped key
    const savedPreferences = loadPreferences();

    // Check if we have saved preferences that weren't loaded initially
    if (savedPreferences.organizationId || savedPreferences.dateRangePreset ||
        savedPreferences.providerName || (savedPreferences.practiceUids && savedPreferences.practiceUids.length > 0)) {

      clientDebugLog.filter('[USERID_INIT] Found saved preferences - applying', {
        savedPreferences,
      });

      // Merge saved preferences into current filters (saved prefs take priority over empty values)
      // Use functional update to access current state without adding to dependency array
      setUniversalFilters((currentFilters) => {
        const mergedFilters: DashboardUniversalFilters = {
          ...currentFilters,
          // Only override if current value is empty and saved value exists
          ...(savedPreferences.organizationId && !currentFilters.organizationId && { organizationId: savedPreferences.organizationId }),
          ...(savedPreferences.dateRangePreset && !currentFilters.dateRangePreset && { dateRangePreset: savedPreferences.dateRangePreset }),
          ...(savedPreferences.providerName && !currentFilters.providerName && { providerName: savedPreferences.providerName }),
          ...(savedPreferences.practiceUids && savedPreferences.practiceUids.length > 0 && (!currentFilters.practiceUids || currentFilters.practiceUids.length === 0) && { practiceUids: savedPreferences.practiceUids }),
        };

        clientDebugLog.filter('[USERID_INIT] Merged filters result', {
          mergedFilters,
          previousFilters: currentFilters,
        });

        return mergedFilters;
      });
      // Don't update URL params here - let existing URL params remain if they exist
    } else {
      clientDebugLog.filter('[USERID_INIT] No saved preferences found for user', {
        userId,
      });
    }
  }, [userId, loadPreferences, accessibleOrganizationIds.length]);

  // Apply dashboard defaults when filterConfig becomes available
  // This handles the timing issue where filterConfig is undefined on initial render
  // but becomes available after the dashboard data loads
  useEffect(() => {
    const defaultFilters = filterConfig?.defaultFilters;

    // DIAGNOSTIC: Log useEffect entry
    clientDebugLog.filter('[LATE_INIT] useEffect triggered', {
      timestamp: new Date().toISOString(),
      hasFilterConfig: !!filterConfig,
      defaultFilters,
      hasAppliedDefaultsRef: hasAppliedDefaultsRef.current,
      currentFilters: universalFilters,
    });

    // Skip if no default filters configured or already applied
    if (!defaultFilters || hasAppliedDefaultsRef.current) {
      clientDebugLog.filter('[LATE_INIT] Skipping - no defaults or already applied', {
        hasDefaultFilters: !!defaultFilters,
        alreadyApplied: hasAppliedDefaultsRef.current,
      });
      return;
    }

    // Check if user already has filters set (URL params or localStorage)
    const savedPreferences = loadPreferences();
    const hasUrlParams = searchParams.get('datePreset') || searchParams.get('org') ||
                         searchParams.get('provider') || searchParams.get('practice');
    const hasSavedPrefs = savedPreferences.dateRangePreset || savedPreferences.organizationId ||
                          savedPreferences.providerName ||
                          (savedPreferences.practiceUids && savedPreferences.practiceUids.length > 0);

    // DIAGNOSTIC: Log filter check state
    clientDebugLog.filter('[LATE_INIT] Checking existing filters', {
      hasUrlParams: !!hasUrlParams,
      hasSavedPrefs: !!hasSavedPrefs,
      savedPreferences,
      urlParams: {
        datePreset: searchParams.get('datePreset'),
        org: searchParams.get('org'),
        provider: searchParams.get('provider'),
        practice: searchParams.get('practice'),
      },
    });

    // Only apply defaults if user hasn't set any filters
    if (hasUrlParams || hasSavedPrefs) {
      clientDebugLog.filter('[LATE_INIT] Skipping defaults - user has existing filters', {
        reason: hasUrlParams ? 'URL params present' : 'localStorage prefs present',
        hasUrlParams,
        hasSavedPrefs,
      });
      hasAppliedDefaultsRef.current = true;
      return;
    }

    // Check if current filters are empty (need defaults)
    const currentFiltersEmpty = !universalFilters.dateRangePreset &&
                                !universalFilters.organizationId &&
                                !universalFilters.providerName &&
                                (!universalFilters.practiceUids || universalFilters.practiceUids.length === 0);

    if (currentFiltersEmpty && (defaultFilters.dateRangePreset || defaultFilters.organizationId)) {
      clientDebugLog.filter('[LATE_INIT] APPLYING dashboard default filters', {
        defaults: defaultFilters,
        previousFilters: universalFilters,
      });

      // Apply defaults without saving to localStorage (they're just defaults)
      // Only update fields that have actual default values
      setUniversalFilters({
        ...universalFilters,
        ...(defaultFilters.dateRangePreset && { dateRangePreset: defaultFilters.dateRangePreset }),
        ...(defaultFilters.organizationId && { organizationId: defaultFilters.organizationId }),
      });
    } else {
      clientDebugLog.filter('[LATE_INIT] Not applying defaults - conditions not met', {
        currentFiltersEmpty,
        hasDateRangeDefault: !!defaultFilters.dateRangePreset,
        hasOrgDefault: !!defaultFilters.organizationId,
      });
    }

    hasAppliedDefaultsRef.current = true;
  }, [filterConfig, searchParams, loadPreferences, universalFilters]);

  // URL param management
  const updateUrlParams = useCallback(
    (filters: DashboardUniversalFilters) => {
      const params = new URLSearchParams();

      if (filters.dateRangePreset) params.set('datePreset', filters.dateRangePreset);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.organizationId) params.set('org', filters.organizationId);
      if (
        filters.practiceUids &&
        filters.practiceUids.length > 0 &&
        filters.practiceUids[0] !== undefined
      ) {
        params.set('practice', filters.practiceUids[0].toString());
      }
      if (filters.providerName) params.set('provider', filters.providerName);

      // Update URL without scroll, preserving history
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilters: DashboardUniversalFilters) => {
      // Clear dimension expansion caches when filters change
      // This ensures fresh dimension value counts are fetched
      clearDimensionCaches();

      setUniversalFilters(newFilters);
      updateUrlParams(newFilters);
      savePreferences(newFilters); // Save to localStorage
    },
    [updateUrlParams, savePreferences]
  );

  // Handle removing individual filter pill
  const handleRemoveFilter = useCallback(
    (filterKey: keyof DashboardUniversalFilters) => {
      // Clear dimension expansion caches when filters change
      clearDimensionCaches();

      const newFilters = { ...universalFilters };

      // Remove the specific filter
      if (filterKey === 'dateRangePreset') {
        delete newFilters.dateRangePreset;
        delete newFilters.startDate;
        delete newFilters.endDate;
        removeFilter('dateRangePreset');
      } else if (filterKey === 'organizationId') {
        delete newFilters.organizationId;
        removeFilter('organizationId');
      } else if (filterKey === 'practiceUids') {
        delete newFilters.practiceUids;
        removeFilter('practiceUids');
      } else if (filterKey === 'providerName') {
        delete newFilters.providerName;
        removeFilter('providerName');
      } else {
        // For startDate, endDate (not stored in sticky filters)
        delete newFilters[filterKey];
      }

      setUniversalFilters(newFilters);
      updateUrlParams(newFilters);
    },
    [universalFilters, updateUrlParams, removeFilter]
  );

  // Clear invalid org filter (for external error handling like RBAC access denied)
  const clearInvalidOrgFilter = useCallback(() => {
    if (universalFilters.organizationId) {
      clientDebugLog.component('Clearing invalid organization filter from sticky filters', {
        invalidOrgId: universalFilters.organizationId,
      });

      // Clear the invalid organization from sticky filters
      removeFilter('organizationId');

      // Update state to remove org filter and trigger refetch
      const cleanedFilters = { ...universalFilters };
      delete cleanedFilters.organizationId;
      setUniversalFilters(cleanedFilters);
      updateUrlParams(cleanedFilters);
    }
  }, [universalFilters, removeFilter, updateUrlParams]);

  return {
    universalFilters,
    handleFilterChange,
    handleRemoveFilter,
    showFilterBar,
    clearInvalidOrgFilter,
  };
}

export default useDashboardUniversalFilters;
