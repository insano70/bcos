'use client';

import { useState } from 'react';

/**
 * Date Range Presets Component
 * Provides quick date range selection with common presets
 */

interface DateRangePresetsProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
  currentStartDate?: string;
  currentEndDate?: string;
}

interface DateRangePreset {
  id: string;
  label: string;
  description: string;
  getDateRange: () => { startDate: string; endDate: string };
}

const DATE_PRESETS: DateRangePreset[] = [
  {
    id: 'last_7_days',
    label: 'Last 7 Days',
    description: 'Past week',
    getDateRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!
      };
    }
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    description: 'Past month',
    getDateRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: end.toISOString().split('T')[0]!
      };
    }
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
        endDate: end.toISOString().split('T')[0]!
      };
    }
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
        endDate: end.toISOString().split('T')[0]!
      };
    }
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
        endDate: end.toISOString().split('T')[0]!
      };
    }
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
        endDate: end.toISOString().split('T')[0]!
      };
    }
  },
  {
    id: 'ytd',
    label: 'Year to Date',
    description: 'January 1st to today',
    getDateRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        startDate: start.toISOString().split('T')[0]!,
        endDate: now.toISOString().split('T')[0]!
      };
    }
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
        endDate: end.toISOString().split('T')[0]!
      };
    }
  }
];

export default function DateRangePresets({
  onDateRangeChange,
  currentStartDate,
  currentEndDate
}: DateRangePresetsProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [customStartDate, setCustomStartDate] = useState(currentStartDate || '');
  const [customEndDate, setCustomEndDate] = useState(currentEndDate || '');

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    
    if (presetId === 'custom') {
      onDateRangeChange(customStartDate, customEndDate);
    } else {
      const preset = DATE_PRESETS.find(p => p.id === presetId);
      if (preset) {
        const { startDate, endDate } = preset.getDateRange();
        onDateRangeChange(startDate, endDate);
      }
    }
  };

  const handleCustomDateChange = (startDate: string, endDate: string) => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setSelectedPreset('custom');
    onDateRangeChange(startDate, endDate);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        Date Range
      </h3>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {DATE_PRESETS.map(preset => (
          <button
            key={preset.id}
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
            id="custom"
            checked={selectedPreset === 'custom'}
            onChange={() => setSelectedPreset('custom')}
            className="text-violet-500"
          />
          <label htmlFor="custom" className="font-medium text-gray-900 dark:text-gray-100">
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
              const preset = DATE_PRESETS.find(p => p.id === selectedPreset);
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
