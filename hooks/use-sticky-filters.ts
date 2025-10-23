/**
 * Sticky Filters Hook
 *
 * Manages persistent filter preferences using browser localStorage.
 * Provides global sticky filter behavior across all dashboards.
 *
 * Features:
 * - Save/load filter preferences from localStorage
 * - Global scope (applies to all dashboards)
 * - Graceful error handling (quota exceeded, parse errors)
 * - Clear individual or all sticky filters
 * - TypeScript type safety
 *
 * Storage Key: 'bcos_dashboard_filters'
 * Persists: organizationId, dateRangePreset, practiceUids, providerName
 * Priority: URL params > localStorage > Dashboard defaults
 */

import { useCallback } from 'react';
import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';

const STORAGE_KEY = 'bcos_dashboard_filters';

/**
 * Sticky filter preferences stored in localStorage
 * Subset of DashboardUniversalFilters (excludes startDate/endDate which are derived from preset)
 */
export interface StickyFilterPreferences {
  organizationId?: string;
  dateRangePreset?: string;
  practiceUids?: number[];
  providerName?: string;
  lastUpdated?: string; // ISO timestamp for debugging
}

/**
 * Hook for managing sticky dashboard filters via localStorage
 *
 * @returns Object with methods to load, save, clear, and remove filters
 *
 * @example
 * ```tsx
 * const { loadPreferences, savePreferences, clearAll } = useStickyFilters();
 *
 * // Load on mount
 * const saved = loadPreferences();
 *
 * // Save on filter change
 * const handleFilterChange = (filters) => {
 *   savePreferences(filters);
 *   // ... update state
 * };
 *
 * // Clear all
 * const handleClear = () => {
 *   clearAll();
 *   // ... reset state
 * };
 * ```
 */
export function useStickyFilters() {
  /**
   * Load saved filter preferences from localStorage
   *
   * @returns Saved preferences or empty object if none found
   */
  const loadPreferences = useCallback((): StickyFilterPreferences => {
    if (typeof window === 'undefined') {
      return {}; // SSR safety
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return {};
      }

      const parsed = JSON.parse(saved) as StickyFilterPreferences;

      // Validate structure
      if (typeof parsed !== 'object' || parsed === null) {
        console.warn('[useStickyFilters] Invalid preferences structure, clearing');
        localStorage.removeItem(STORAGE_KEY);
        return {};
      }

      return parsed;
    } catch (error) {
      console.error('[useStickyFilters] Failed to load preferences:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore cleanup errors
      }
      return {};
    }
  }, []);

  /**
   * Save filter preferences to localStorage
   *
   * Extracts persistable fields from DashboardUniversalFilters and saves to localStorage.
   * Automatically adds lastUpdated timestamp.
   *
   * @param filters - Dashboard universal filters to save
   */
  const savePreferences = useCallback((filters: DashboardUniversalFilters): void => {
    if (typeof window === 'undefined') {
      return; // SSR safety
    }

    try {
      const preferences: Partial<StickyFilterPreferences> = {};

      // Only add fields that have values
      if (filters.organizationId) {
        preferences.organizationId = filters.organizationId;
      }
      if (filters.dateRangePreset) {
        preferences.dateRangePreset = filters.dateRangePreset;
      }
      if (filters.practiceUids && filters.practiceUids.length > 0) {
        preferences.practiceUids = filters.practiceUids;
      }
      if (filters.providerName) {
        preferences.providerName = filters.providerName;
      }

      preferences.lastUpdated = new Date().toISOString();

      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      // Handle quota exceeded or other localStorage errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error('[useStickyFilters] localStorage quota exceeded');
      } else {
        console.error('[useStickyFilters] Failed to save preferences:', error);
      }
      // Gracefully degrade - don't break the app
    }
  }, []);

  /**
   * Clear all sticky filter preferences
   */
  const clearAll = useCallback((): void => {
    if (typeof window === 'undefined') {
      return; // SSR safety
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[useStickyFilters] Failed to clear preferences:', error);
    }
  }, []);

  /**
   * Remove a specific filter from sticky preferences
   *
   * @param filterKey - Key of the filter to remove
   */
  const removeFilter = useCallback(
    (filterKey: keyof StickyFilterPreferences): void => {
      if (typeof window === 'undefined') {
        return; // SSR safety
      }

      try {
        const current = loadPreferences();
        delete current[filterKey];

        // If no filters left, clear everything
        const hasFilters = Object.keys(current).some(
          (key) => key !== 'lastUpdated' && current[key as keyof StickyFilterPreferences] !== undefined
        );

        if (!hasFilters) {
          clearAll();
        } else {
          current.lastUpdated = new Date().toISOString();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        }
      } catch (error) {
        console.error('[useStickyFilters] Failed to remove filter:', error);
      }
    },
    [loadPreferences, clearAll]
  );

  /**
   * Check if a specific filter is currently saved
   *
   * @param filterKey - Key of the filter to check
   * @returns True if filter exists in localStorage
   */
  const hasFilter = useCallback(
    (filterKey: keyof StickyFilterPreferences): boolean => {
      const preferences = loadPreferences();
      return preferences[filterKey] !== undefined;
    },
    [loadPreferences]
  );

  /**
   * Get count of active sticky filters
   *
   * @returns Number of active filters (excludes lastUpdated)
   */
  const getActiveFilterCount = useCallback((): number => {
    const preferences = loadPreferences();
    return Object.keys(preferences).filter(
      (key) => key !== 'lastUpdated' && preferences[key as keyof StickyFilterPreferences] !== undefined
    ).length;
  }, [loadPreferences]);

  return {
    loadPreferences,
    savePreferences,
    clearAll,
    removeFilter,
    hasFilter,
    getActiveFilterCount,
  };
}
