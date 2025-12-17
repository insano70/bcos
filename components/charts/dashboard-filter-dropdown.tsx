'use client';

import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DashboardUniversalFilters } from '@/hooks/useDashboardData';
import { useStickyFilters } from '@/hooks/useStickyFilters';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import HierarchySelect from '@/components/hierarchy-select';

/**
 * Dashboard Filter Dropdown - Compact Version
 *
 * Replaces the full-width DashboardFilterBar with a compact dropdown
 * in the top-right corner of the dashboard.
 *
 * Features:
 * - Small filter icon button with active filter badge
 * - Compact popout panel (~320px wide)
 * - Vertical layout: Organization → Date Range
 * - Apply/Clear buttons
 * - Follows standard DropdownFilter pattern
 */

interface DatePreset {
  id: string;
  label: string;
  getDateRange: () => { startDate: string; endDate: string };
}

const DATE_PRESETS: DatePreset[] = [
  // Day-based periods
  {
    id: 'today',
    label: 'Today',
    getDateRange: () => {
      const today = new Date();
      return {
        startDate: today.toISOString().split('T')[0]!,
        endDate: today.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    getDateRange: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: yesterday.toISOString().split('T')[0]!,
        endDate: yesterday.toISOString().split('T')[0]!,
      };
    },
  },
  // Day-based "Last N Days" presets: Only set startDate, no endDate
  // This allows data with future-dated records (monthly stored as end-of-month,
  // quarterly as end-of-quarter, annual as Dec 31) to be included correctly.
  {
    id: 'last_7_days',
    label: 'Last 7 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'last_14_days',
    label: 'Last 14 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 14);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'last_90_days',
    label: 'Last 90 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'last_180_days',
    label: 'Last 180 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 180);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'last_365_days',
    label: 'Last 365 Days',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 365);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  // Month-based periods
  {
    id: 'this_month',
    label: 'This Month',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_month',
    label: 'Last Month',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_3_full_months',
    label: 'Trailing 3 Months',
    getDateRange: () => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_6_full_months',
    label: 'Trailing 6 Months',
    getDateRange: () => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_12_full_months',
    label: 'Trailing 12 Months',
    getDateRange: () => {
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  // Quarter-based periods
  {
    id: 'this_quarter',
    label: 'This Quarter',
    getDateRange: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_quarter',
    label: 'Last Quarter',
    getDateRange: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3, 0);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  // Year-based periods
  // Year to Date: Only set startDate (Jan 1), no endDate
  // This allows data with future-dated records to be included correctly.
  {
    id: 'ytd',
    label: 'Year to Date',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from Jan 1 forward
      };
    },
  },
  {
    id: 'this_year',
    label: 'This Year',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  {
    id: 'last_year',
    label: 'Last Year',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
];

interface DashboardFilterDropdownProps {
  initialFilters?: DashboardUniversalFilters;
  onFiltersChange: (filters: DashboardUniversalFilters) => void;
  loading?: boolean;
  align?: 'left' | 'right';
}

export default function DashboardFilterDropdown({
  initialFilters = {},
  onFiltersChange,
  loading = false,
  align = 'right',
}: DashboardFilterDropdownProps) {
  const { clearAll } = useStickyFilters();
  // Use React Query hook for organizations - shared across components, cached
  const { data: organizations = [], isLoading: loadingOrganizations } = useOrganizations();
  // Local state for filter editing (not applied until user clicks Apply)
  const [pendingFilters, setPendingFilters] = useState<DashboardUniversalFilters>(initialFilters);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Tailwind md breakpoint
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync pending filters with initial filters when they change
  useEffect(() => {
    setPendingFilters(initialFilters);
  }, [JSON.stringify(initialFilters)]);

  // Calculate active filter count
  const activeFilterCount = [
    pendingFilters.dateRangePreset !== undefined,
    pendingFilters.organizationId,
  ].filter(Boolean).length;

  const handleDatePresetChange = (presetId: string) => {
    if (presetId === 'default') {
      // Clear date range override - use chart defaults
      setPendingFilters((prev) => {
        const newFilters = { ...prev };
        delete newFilters.dateRangePreset;
        delete newFilters.startDate;
        delete newFilters.endDate;
        return newFilters;
      });
    } else if (presetId === 'custom') {
      setPendingFilters((prev) => ({ ...prev, dateRangePreset: presetId }));
    } else {
      const preset = DATE_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        const { startDate, endDate } = preset.getDateRange();
        setPendingFilters((prev) => ({
          ...prev,
          dateRangePreset: presetId,
          startDate,
          endDate,
        }));
      }
    }
  };

  const handleOrganizationChange = (organizationId: string) => {
    setPendingFilters(
      (prev) =>
        ({
          ...prev,
          organizationId: organizationId || undefined,
        }) as DashboardUniversalFilters
    );
  };

  const handleClear = () => {
    const resetFilters: DashboardUniversalFilters = {};
    setPendingFilters(resetFilters);
    clearAll(); // Clear localStorage
  };

  const handleApply = (close: () => void) => {
    onFiltersChange(pendingFilters);
    close();
  };

  return (
    <Popover className="relative inline-flex">
      <PopoverButton className="btn px-2.5 bg-white dark:bg-gray-800 border-gray-200 hover:border-gray-300 dark:border-gray-700/60 dark:hover:border-gray-600 text-gray-400 dark:text-gray-500 relative">
        <span className="sr-only">Dashboard Filters</span>
        <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
          <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1ZM3 8a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1ZM7 12a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {activeFilterCount}
          </span>
        )}
      </PopoverButton>

      <Transition
        enter="transition ease-out duration-200 transform"
        enterFrom="opacity-0 -translate-y-2"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-out duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <PopoverPanel
          className={`
            dashboard-filter-panel
            z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden
            ${
              isMobile
                ? 'fixed inset-x-4 top-20 max-w-full max-h-[80vh]'
                : `origin-top-right absolute top-full min-w-[20rem] max-w-[24rem] max-h-[calc(100vh-8rem)] mt-1 ${align === 'right' ? 'right-0' : 'left-0'}`
            }
          `}
        >
          {({ close }) => (
            <div className="flex flex-col max-h-full">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Dashboard Filters
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Filters apply to all charts
                </p>
              </div>

              {/* Filter Content - Scrollable area */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Date Range Filter - Top (Dropdown) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Date Range
                  </label>
                  <select
                    value={pendingFilters.dateRangePreset || 'default'}
                    onChange={(e) => handleDatePresetChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="default">Default Date Range</option>
                    {DATE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Organization Filter - Below */}
                <div>
                  <HierarchySelect
                    items={organizations}
                    value={pendingFilters.organizationId ?? undefined}
                    onChange={(id) => handleOrganizationChange((id as string) || '')}
                    idField="id"
                    nameField="name"
                    parentField="parent_organization_id"
                    activeField="is_active"
                    label="Organization"
                    placeholder="All Organizations"
                    disabled={loadingOrganizations}
                    showSearch
                    allowClear
                    rootLabel="All Organizations"
                  />
                </div>
              </div>

              {/* Footer with Apply/Clear */}
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="danger-outline"
                    size="xs"
                    onClick={handleClear}
                    disabled={loading}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="violet"
                    size="xs"
                    onClick={() => handleApply(close)}
                    disabled={loading}
                    loading={loading}
                    loadingText="Applying..."
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PopoverPanel>
      </Transition>

      {/* CSS override to increase HierarchySelect dropdown height and prevent nested scroll */}
      <style jsx global>{`
        /* Target the HierarchySelect dropdown inside dashboard filter */
        .dashboard-filter-panel .absolute.z-50.w-full {
          position: static !important;
          max-height: none !important;
          box-shadow: none !important;
          border: none !important;
          margin-top: 0.5rem !important;
        }

        /* Make the items list inside HierarchySelect fill available space */
        .dashboard-filter-panel .overflow-y-auto.flex-1 {
          max-height: 32rem !important;
        }
      `}</style>
    </Popover>
  );
}
