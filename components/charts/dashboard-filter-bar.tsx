'use client';

import { useState, useEffect, useCallback } from 'react';
import DateRangePresets from './date-range-presets';
import { apiClient } from '@/lib/api/client';

/**
 * Dashboard Universal Filters
 * Filters that apply to ALL charts in a dashboard
 * 
 * Security Note:
 * - practiceUids is auto-populated from organizationId on backend (includes hierarchy)
 * - Not directly user-editable (security critical)
 */
export interface DashboardUniversalFilters {
  dateRangePreset?: string;
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  providerName?: string;
  
  // Auto-populated from organizationId on backend (not directly user-editable)
  // Includes hierarchy: if org has children, their practice_uids are included
  practiceUids?: number[];
}

/**
 * Dashboard filter configuration (Phase 7)
 * Controls which filters are visible in the filter bar
 */
export interface DashboardFilterConfig {
  enabled?: boolean;          // Show filter bar (default: true)
  showDateRange?: boolean;    // Show date range filter (default: true)
  showOrganization?: boolean; // Show organization filter (default: true)
  showPractice?: boolean;     // Show practice filter (default: false)
  showProvider?: boolean;     // Show provider filter (default: false)
  defaultFilters?: {          // Default filter values
    dateRangePreset?: string;
    organizationId?: string;
  };
}

interface DashboardFilterBarProps {
  initialFilters?: DashboardUniversalFilters;
  onFiltersChange: (filters: DashboardUniversalFilters) => void;
  loading?: boolean;
  className?: string;
  filterConfig?: DashboardFilterConfig; // Phase 7: Configure which filters to show
}

interface Organization {
  organization_id: string;
  name: string;
  slug: string;
}

/**
 * DashboardFilterBar Component
 *
 * Phase 7: Dashboard-level universal filters
 *
 * Provides dashboard-wide filtering controls that apply to ALL charts.
 * Supports date ranges and organization filtering.
 *
 * Features:
 * - Reuses DateRangePresets component
 * - Fetches available organizations from API
 * - Filter changes trigger dashboard-wide regeneration
 * - Filters persist in URL query params (Phase 7.3.2)
 */
export default function DashboardFilterBar({
  initialFilters = {},
  onFiltersChange,
  loading = false,
  className = '',
  filterConfig = {},
}: DashboardFilterBarProps) {
  const [filters, setFilters] = useState<DashboardUniversalFilters>(initialFilters);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);

  // Phase 7: Determine which filters to show (defaults to true if not specified)
  const showDateRange = filterConfig.showDateRange !== false;
  const showOrganization = filterConfig.showOrganization !== false;
  const showPractice = filterConfig.showPractice === true; // Default off
  const showProvider = filterConfig.showProvider === true; // Default off

  // Load available organizations for dropdown (only if needed)
  useEffect(() => {
    loadOrganizations();
  }, [showOrganization]); // Reload if filter visibility changes

  const loadOrganizations = async () => {
    // Only load if organization filter is visible
    if (!showOrganization) return;

    try {
      setLoadingOrganizations(true);
      const result = await apiClient.get<{ organizations: Organization[] }>(
        '/api/organizations?is_active=true'
      );
      setOrganizations(result.organizations || []);
    } catch (error) {
      // Silently fail - organizations dropdown just won't be populated
      console.error('Failed to load organizations:', error);
    } finally {
      setLoadingOrganizations(false);
    }
  };

  const handleDateRangeChange = useCallback((presetId: string, startDate: string, endDate: string) => {
    const newFilters = {
      ...filters,
      dateRangePreset: presetId,
      startDate: presetId === 'custom' ? startDate : undefined,
      endDate: presetId === 'custom' ? endDate : undefined,
    } as DashboardUniversalFilters;
    setFilters(newFilters);
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const handleOrganizationChange = useCallback((organizationId: string) => {
    const newFilters = {
      ...filters,
      organizationId: organizationId || undefined,
    } as DashboardUniversalFilters;
    setFilters(newFilters);
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const handleReset = useCallback(() => {
    const resetFilters: DashboardUniversalFilters = {
      dateRangePreset: 'last_30_days',
    };
    setFilters(resetFilters);
    onFiltersChange(resetFilters);
  }, [onFiltersChange]);

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Dashboard Filters
        </h3>
        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50"
        >
          Reset Filters
        </button>
      </div>

      {/* Dynamic grid based on visible filters */}
      <div className={`grid grid-cols-1 ${(showDateRange && showOrganization) ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* Date Range Filter */}
        {showDateRange && (
          <div>
            <DateRangePresets
              onDateRangeChange={handleDateRangeChange}
              {...(filters.startDate && { currentStartDate: filters.startDate })}
              {...(filters.endDate && { currentEndDate: filters.endDate })}
              selectedPreset={filters.dateRangePreset || 'last_30_days'}
            />
          </div>
        )}

        {/* Organization Filter */}
        {showOrganization && (
          <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Organization Filter
            </label>
            <select
              value={filters.organizationId || ''}
              onChange={(e) => handleOrganizationChange(e.target.value)}
              disabled={loading || loadingOrganizations}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            >
              <option value="">All Organizations</option>
              {organizations.map((org) => (
                <option key={org.organization_id} value={org.organization_id}>
                  {org.name} ({org.slug})
                </option>
              ))}
            </select>
            {loadingOrganizations && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Loading organizations...
              </p>
            )}
          </div>

          {/* Provider Filter - Future Enhancement */}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-600"></div>
                <span>Updating all charts...</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        💡 Dashboard filters apply to all charts. Individual chart settings are overridden.
      </div>
    </div>
  );
}

