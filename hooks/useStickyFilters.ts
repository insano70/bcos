/**
 * Sticky Filters Hook
 *
 * Manages persistent filter preferences using browser localStorage.
 * Provides user-scoped sticky filter behavior across all dashboards.
 *
 * Features:
 * - Save/load filter preferences from localStorage
 * - User-scoped storage (prevents cross-user filter contamination)
 * - Graceful error handling (quota exceeded, parse errors)
 * - Clear individual or all sticky filters
 * - Validate filters against accessible organizations
 * - TypeScript type safety
 *
 * Storage Key: 'bcos_dashboard_filters_{userId}'
 * Persists: organizationId, dateRangePreset, practiceUids, providerName
 * Priority: URL params > localStorage > Dashboard defaults
 */

import { useCallback, useMemo } from 'react';
import type { DashboardUniversalFilters } from '@/hooks/useDashboardData';
import { clientDebugLog } from '@/lib/utils/debug-client';

const STORAGE_KEY_PREFIX = 'bcos_dashboard_filters';

/**
 * Build storage key for a user
 * Falls back to legacy key for backwards compatibility if no userId
 */
function getStorageKey(userId?: string): string {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}

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
 * Options for sticky filters hook
 */
export interface UseStickyFiltersOptions {
  /** User ID to namespace localStorage (required for proper isolation) */
  userId?: string | undefined;
  /** List of organization IDs the user has access to (for validation) */
  accessibleOrganizationIds?: string[] | undefined;
}

/**
 * Hook for managing sticky dashboard filters via localStorage
 *
 * @param options - Configuration options including userId for storage isolation
 * @returns Object with methods to load, save, clear, and remove filters
 *
 * @example
 * ```tsx
 * const { loadPreferences, savePreferences, clearAll } = useStickyFilters({
 *   userId: user?.id,
 *   accessibleOrganizationIds: userContext?.accessible_organizations?.map(o => o.organization_id)
 * });
 *
 * // Load on mount - automatically validates org filter
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
export function useStickyFilters(options: UseStickyFiltersOptions = {}) {
  const { userId, accessibleOrganizationIds } = options;
  
  // Memoize storage key based on userId
  const storageKey = useMemo(() => getStorageKey(userId), [userId]);
  
  /**
   * Load saved filter preferences from localStorage
   * Automatically clears invalid organization filters
   *
   * @returns Saved preferences or empty object if none found
   */
  const loadPreferences = useCallback((): StickyFilterPreferences => {
    if (typeof window === 'undefined') {
      return {}; // SSR safety
    }

    // DIAGNOSTIC: Log load attempt
    clientDebugLog.filter('[STICKY] loadPreferences called', {
      timestamp: new Date().toISOString(),
      storageKey,
      userId,
      accessibleOrgCount: accessibleOrganizationIds?.length ?? 0,
      accessibleOrganizationIds,
    });

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        // DIAGNOSTIC: Log no saved data
        clientDebugLog.filter('[STICKY] No saved preferences found', {
          storageKey,
          checkedLegacyKey: !!userId,
        });

        // Try legacy key migration (one-time)
        if (userId) {
          const legacySaved = localStorage.getItem(STORAGE_KEY_PREFIX);
          if (legacySaved) {
            clientDebugLog.filter('[STICKY] Found legacy filters - clearing (not migrating)', {
              legacyKey: STORAGE_KEY_PREFIX,
            });
            // Don't auto-migrate - just clear legacy and start fresh
            // This prevents inheriting another user's filters
            try {
              localStorage.removeItem(STORAGE_KEY_PREFIX);
            } catch {
              // Ignore cleanup errors
            }
          }
        }
        return {};
      }

      const parsed = JSON.parse(saved) as StickyFilterPreferences;

      // DIAGNOSTIC: Log parsed data
      clientDebugLog.filter('[STICKY] Loaded raw preferences from localStorage', {
        parsed,
        storageKey,
      });

      // Validate structure
      if (typeof parsed !== 'object' || parsed === null) {
        clientDebugLog.filter('[STICKY] Invalid preferences structure - clearing', {
          parsed,
        });
        localStorage.removeItem(storageKey);
        return {};
      }

      // Validate organization filter against accessible organizations
      if (parsed.organizationId && accessibleOrganizationIds && accessibleOrganizationIds.length > 0) {
        const hasAccess = accessibleOrganizationIds.includes(parsed.organizationId);

        // DIAGNOSTIC: Log org validation
        clientDebugLog.filter('[STICKY] Validating organization filter', {
          savedOrgId: parsed.organizationId,
          accessibleOrgCount: accessibleOrganizationIds.length,
          accessibleOrganizationIds,
          hasAccess,
        });

        if (!hasAccess) {
          clientDebugLog.filter('[STICKY] CLEARING invalid org filter - user lost access', {
            invalidOrgId: parsed.organizationId,
            accessibleOrgs: accessibleOrganizationIds,
          });
          // Clear the invalid org filter and save back
          delete parsed.organizationId;
          parsed.lastUpdated = new Date().toISOString();
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        }
      } else if (parsed.organizationId && (!accessibleOrganizationIds || accessibleOrganizationIds.length === 0)) {
        // DIAGNOSTIC: Log validation skipped
        clientDebugLog.filter('[STICKY] Org validation SKIPPED - no accessible orgs list yet', {
          savedOrgId: parsed.organizationId,
          accessibleOrganizationIds,
          reason: 'accessibleOrganizationIds is empty - auth context may not be loaded',
        });
      }

      // DIAGNOSTIC: Log final result
      clientDebugLog.filter('[STICKY] Returning preferences', {
        result: parsed,
        hasOrgId: !!parsed.organizationId,
        hasDateRange: !!parsed.dateRangePreset,
      });

      return parsed;
    } catch (error) {
      clientDebugLog.filter('[STICKY] ERROR loading preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        storageKey,
      });
      // Clear corrupted data
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Ignore cleanup errors
      }
      return {};
    }
  }, [storageKey, accessibleOrganizationIds, userId]);

  /**
   * Save filter preferences to localStorage
   *
   * Extracts persistable fields from DashboardUniversalFilters and saves to localStorage.
   * Automatically adds lastUpdated timestamp.
   * Validates organization filter before saving.
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
      // Validate organization filter before saving
      if (filters.organizationId) {
        // Only save org filter if user has access (or if we don't have access list)
        const canSaveOrg = !accessibleOrganizationIds || 
                          accessibleOrganizationIds.length === 0 || 
                          accessibleOrganizationIds.includes(filters.organizationId);
        if (canSaveOrg) {
          preferences.organizationId = filters.organizationId;
        } else {
          console.warn('[useStickyFilters] Skipping invalid organization filter on save', {
            invalidOrgId: filters.organizationId,
          });
        }
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

      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch (error) {
      // Handle quota exceeded or other localStorage errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.error('[useStickyFilters] localStorage quota exceeded');
      } else {
        console.error('[useStickyFilters] Failed to save preferences:', error);
      }
      // Gracefully degrade - don't break the app
    }
  }, [storageKey, accessibleOrganizationIds]);

  /**
   * Clear all sticky filter preferences
   */
  const clearAll = useCallback((): void => {
    if (typeof window === 'undefined') {
      return; // SSR safety
    }

    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('[useStickyFilters] Failed to clear preferences:', error);
    }
  }, [storageKey]);

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
          localStorage.setItem(storageKey, JSON.stringify(current));
        }
      } catch (error) {
        console.error('[useStickyFilters] Failed to remove filter:', error);
      }
    },
    [loadPreferences, clearAll, storageKey]
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
