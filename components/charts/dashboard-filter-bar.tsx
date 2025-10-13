'use client';

import { useState, useEffect, useCallback } from 'react';
import DateRangePresets from './date-range-presets';
import { apiClient } from '@/lib/api/client';

/**
 * Dashboard Universal Filters
 * Filters that apply to ALL charts in a dashboard
 */
export interface DashboardUniversalFilters {
  dateRangePreset?: string;
  startDate?: string | null;
  endDate?: string | null;
  organizationId?: string | null;
  practiceUid?: number | null;
  providerName?: string | null;
}

interface DashboardFilterBarProps {
  initialFilters?: DashboardUniversalFilters;
  onFiltersChange: (filters: DashboardUniversalFilters) => void;
  loading?: boolean;
  className?: string;
}

interface Practice {
  practice_uid: number;
  practice_name: string;
  practice_primary: string;
}

/**
 * DashboardFilterBar Component
 *
 * Phase 7: Dashboard-level universal filters
 *
 * Provides dashboard-wide filtering controls that apply to ALL charts.
 * Supports date ranges, organization, practice, and provider filtering.
 *
 * Features:
 * - Reuses DateRangePresets component
 * - Fetches available practices from API
 * - Filter changes trigger dashboard-wide regeneration
 * - Filters persist in URL query params (Phase 7.3.2)
 */
export default function DashboardFilterBar({
  initialFilters = {},
  onFiltersChange,
  loading = false,
  className = '',
}: DashboardFilterBarProps) {
  const [filters, setFilters] = useState<DashboardUniversalFilters>(initialFilters);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [loadingPractices, setLoadingPractices] = useState(false);

  // Load available practices for dropdown
  useEffect(() => {
    loadPractices();
  }, []);

  const loadPractices = async () => {
    try {
      setLoadingPractices(true);
      const result = await apiClient.get<{ practices: Practice[] }>(
        '/api/admin/analytics/practices'
      );
      setPractices(result.practices || []);
    } catch (error) {
      // Silently fail - practices dropdown just won't be populated
      console.error('Failed to load practices:', error);
    } finally {
      setLoadingPractices(false);
    }
  };

  const handleDateRangeChange = useCallback((presetId: string, startDate: string, endDate: string) => {
    const newFilters = {
      ...filters,
      dateRangePreset: presetId,
      startDate: presetId === 'custom' ? startDate : null,
      endDate: presetId === 'custom' ? endDate : null,
    };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const handlePracticeChange = useCallback((practiceUid: string) => {
    const newFilters = {
      ...filters,
      practiceUid: practiceUid ? parseInt(practiceUid, 10) : null,
    };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const handleReset = useCallback(() => {
    const resetFilters: DashboardUniversalFilters = {
      dateRangePreset: 'last_30_days',
      startDate: null,
      endDate: null,
      organizationId: null,
      practiceUid: null,
      providerName: null,
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Date Range Filter */}
        <div>
          <DateRangePresets
            onDateRangeChange={handleDateRangeChange}
            {...(filters.startDate && { currentStartDate: filters.startDate })}
            {...(filters.endDate && { currentEndDate: filters.endDate })}
            selectedPreset={filters.dateRangePreset || 'last_30_days'}
          />
        </div>

        {/* Organization/Practice Filters */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Practice Filter
            </label>
            <select
              value={filters.practiceUid || ''}
              onChange={(e) => handlePracticeChange(e.target.value)}
              disabled={loading || loadingPractices}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            >
              <option value="">All Practices</option>
              {practices.map((practice) => (
                <option key={practice.practice_uid} value={practice.practice_uid}>
                  {practice.practice_name} - {practice.practice_primary}
                </option>
              ))}
            </select>
            {loadingPractices && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Loading practices...
              </p>
            )}
          </div>

          {/* Organization Filter - Future Enhancement */}
          {/* Provider Filter - Future Enhancement */}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-600"></div>
              <span>Updating all charts...</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        💡 Dashboard filters apply to all charts. Individual chart settings are overridden.
      </div>
    </div>
  );
}

