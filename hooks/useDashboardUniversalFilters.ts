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

import { useCallback, useState } from 'react';
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

      return {
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
    });

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
