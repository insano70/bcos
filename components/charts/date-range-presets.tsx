'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Date Range Presets Component
 * Provides quick date range selection with common presets
 */

interface DateRangePresetsProps {
  onDateRangeChange: (presetId: string, startDate: string, endDate: string) => void;
  currentStartDate?: string;
  currentEndDate?: string;
  selectedPreset?: string;
}

interface DateRangePreset {
  id: string;
  label: string;
  description: string;
  getDateRange: () => { startDate: string; endDate: string };
}

const DATE_PRESETS: DateRangePreset[] = [
  {
    id: 'today',
    label: 'Today',
    description: 'Current day',
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
    description: 'Previous day',
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
    description: 'Past week',
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
    description: 'Past 2 weeks',
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
    description: 'Past month',
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
    description: 'Past 3 months',
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
    description: 'Past 6 months',
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
    description: 'Past year',
    getDateRange: () => {
      const start = new Date();
      start.setDate(start.getDate() - 365);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: '', // No upper bound - include all data from start date forward
      };
    },
  },
  {
    id: 'this_month',
    label: 'This Month',
    description: 'Current month',
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
    description: 'Previous month',
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
    description: '3 complete months ending last month',
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
    description: '6 complete months ending last month',
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
    description: '12 complete months ending last month',
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
  {
    id: 'this_quarter',
    label: 'This Quarter',
    description: 'Current quarter',
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
    description: 'Previous quarter',
    getDateRange: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3) - 1;
      const year = quarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const adjustedQuarter = quarter < 0 ? 3 : quarter;
      const start = new Date(year, adjustedQuarter * 3, 1);
      const end = new Date(year, adjustedQuarter * 3 + 3, 0);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!,
      };
    },
  },
  // Year to Date: Only set startDate (Jan 1), no endDate
  // This allows data with future-dated records to be included correctly.
  {
    id: 'ytd',
    label: 'Year to Date',
    description: 'January 1st to present',
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
    description: 'Current full year',
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
    description: 'Previous full year',
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

export default function DateRangePresets({
  onDateRangeChange,
  currentStartDate,
  currentEndDate,
  selectedPreset: initialSelectedPreset = 'custom',
}: DateRangePresetsProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(initialSelectedPreset);
  const [customStartDate, setCustomStartDate] = useState(currentStartDate || '');
  const [customEndDate, setCustomEndDate] = useState(currentEndDate || '');

  const customRadioId = useId();

  // Update selectedPreset when prop changes (for editing existing charts)
  useEffect(() => {
    setSelectedPreset(initialSelectedPreset);
  }, [initialSelectedPreset]);

  // Update custom dates when props change
  useEffect(() => {
    setCustomStartDate(currentStartDate || '');
    setCustomEndDate(currentEndDate || '');
  }, [currentStartDate, currentEndDate]);

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);

    if (presetId === 'custom') {
      onDateRangeChange(presetId, customStartDate, customEndDate);
    } else {
      const preset = DATE_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        const { startDate, endDate } = preset.getDateRange();
        onDateRangeChange(presetId, startDate, endDate);
      }
    }
  };

  const handleCustomDateChange = (startDate: string, endDate: string) => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setSelectedPreset('custom');
    onDateRangeChange('custom', startDate, endDate);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Date Range</h3>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {DATE_PRESETS.map((preset) => (
          <button type="button" key={preset.id}
            onClick={() => handlePresetSelect(preset.id)}
            className={`p-3 text-left border rounded-lg transition-colors ${
              selectedPreset === preset.id
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="font-medium text-sm">{preset.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {preset.description}
            </div>
          </button>
        ))}
      </div>

      {/* Custom Date Range */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="radio"
            id={customRadioId}
            checked={selectedPreset === 'custom'}
            onChange={() => setSelectedPreset('custom')}
            className="text-violet-500"
          />
          <label htmlFor={customRadioId} className="font-medium text-gray-900 dark:text-gray-100">
            Custom Range
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => handleCustomDateChange(e.target.value, customEndDate)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => handleCustomDateChange(customStartDate, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        {selectedPreset !== 'custom' && (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Current range: {(() => {
              const preset = DATE_PRESETS.find((p) => p.id === selectedPreset);
              if (preset) {
                const { startDate, endDate } = preset.getDateRange();
                return `${startDate} to ${endDate}`;
              }
              return 'No range selected';
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
