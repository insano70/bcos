'use client';

import { useEffect, useState } from 'react';
import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';
import { apiClient } from '@/lib/api/client';

/**
 * Dashboard Filter Pills Component
 *
 * Visual display of active dashboard filters as dismissible pills.
 * Shows to the left of the filter dropdown button.
 *
 * Features:
 * - Visual pills for each active filter
 * - Click X to remove individual filter
 * - Hover tooltips with full details
 * - Responsive design
 * - Graceful loading states
 *
 * Filter Types:
 * - Organization: Shows org name (fetched from API)
 * - Date Range: Shows preset label (e.g., "Last 30 Days")
 * - Practice: Shows practice UID count
 * - Provider: Shows provider name
 */

interface DashboardFilterPillsProps {
  filters: DashboardUniversalFilters;
  onRemoveFilter: (filterKey: keyof DashboardUniversalFilters) => void;
  loading?: boolean;
}

// Local Organization interface (matches API response)
interface Organization extends Record<string, unknown> {
  id?: string; // API returns 'id' field
  organization_id?: string; // Legacy field name
  name: string;
  slug: string;
  parent_organization_id?: string | null;
  is_active?: boolean;
}

interface DatePreset {
  id: string;
  label: string;
}

// Date presets for label resolution (shared with dashboard-filter-dropdown)
const DATE_PRESETS: DatePreset[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_14_days', label: 'Last 14 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'last_180_days', label: 'Last 180 Days' },
  { id: 'last_365_days', label: 'Last 365 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_3_full_months', label: 'Trailing 3 Months' },
  { id: 'last_6_full_months', label: 'Trailing 6 Months' },
  { id: 'last_12_full_months', label: 'Trailing 12 Months' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'ytd', label: 'Year to Date' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
];

export default function DashboardFilterPills({
  filters,
  onRemoveFilter,
  loading = false,
}: DashboardFilterPillsProps) {
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [loadingOrgName, setLoadingOrgName] = useState(false);

  // Fetch organization name when organizationId changes
  useEffect(() => {
    if (!filters.organizationId) {
      setOrganizationName(null);
      return;
    }

    const fetchOrganizationName = async () => {
      try {
        setLoadingOrgName(true);
        const orgs = await apiClient.get<Organization[]>('/api/organizations?is_active=true');

        // API returns 'id' field, but filter stores 'organization_id'
        // Check both fields for compatibility
        const org = orgs.find(
          (o) => o.id === filters.organizationId || o.organization_id === filters.organizationId
        );

        setOrganizationName(org?.name || null);
      } catch (error) {
        console.error('[DashboardFilterPills] Failed to load organization name:', error);
        setOrganizationName(null);
      } finally {
        setLoadingOrgName(false);
      }
    };

    fetchOrganizationName();
  }, [filters.organizationId]);

  // Get date range label
  const getDateRangeLabel = (): string | null => {
    if (!filters.dateRangePreset) {
      return null;
    }

    const preset = DATE_PRESETS.find((p) => p.id === filters.dateRangePreset);
    return preset?.label || filters.dateRangePreset;
  };

  // Calculate active filters
  const activePills: Array<{
    key: keyof DashboardUniversalFilters;
    label: string;
    value: string;
    tooltip?: string;
    loading?: boolean;
  }> = [];

  // Organization pill
  if (filters.organizationId) {
    activePills.push({
      key: 'organizationId',
      label: 'Organization',
      value: loadingOrgName ? 'Loading...' : organizationName || 'Unknown',
      tooltip: filters.organizationId,
      loading: loadingOrgName,
    });
  }

  // Date range pill
  const dateLabel = getDateRangeLabel();
  if (dateLabel) {
    let tooltip = dateLabel;
    if (filters.startDate && filters.endDate) {
      tooltip = `${filters.startDate} to ${filters.endDate}`;
    }

    activePills.push({
      key: 'dateRangePreset',
      label: 'Date Range',
      value: dateLabel,
      tooltip,
    });
  }

  // Practice pill
  if (filters.practiceUids && filters.practiceUids.length > 0) {
    const count = filters.practiceUids.length;
    activePills.push({
      key: 'practiceUids',
      label: 'Practices',
      value: `${count} selected`,
      tooltip: `Practice UIDs: ${filters.practiceUids.join(', ')}`,
    });
  }

  // Provider pill
  if (filters.providerName) {
    activePills.push({
      key: 'providerName',
      label: 'Provider',
      value: filters.providerName,
      tooltip: `Provider: ${filters.providerName}`,
    });
  }

  // Don't render anything if no active filters
  if (activePills.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {activePills.map((pill) => (
        <div
          key={pill.key}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium border border-violet-200 dark:border-violet-700/50 transition-all hover:bg-violet-200 dark:hover:bg-violet-900/50"
          title={pill.tooltip}
        >
          {/* Filter label and value */}
          <span className="flex items-center gap-1.5">
            <span className="text-violet-600 dark:text-violet-400 font-semibold">
              {pill.label}:
            </span>
            <span className={pill.loading ? 'opacity-50' : ''}>
              {pill.value}
            </span>
          </span>

          {/* Remove button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemoveFilter(pill.key);
            }}
            disabled={loading || pill.loading}
            className="ml-1 p-0.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Remove ${pill.label} filter`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
