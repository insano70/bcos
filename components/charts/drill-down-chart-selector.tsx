'use client';

/**
 * DrillDownChartSelector Component
 *
 * Searchable dropdown for selecting a target chart for drill-down.
 * Fetches compatible charts from API (same data source).
 *
 * Features:
 * - Search/filter charts by name
 * - Shows chart type icons
 * - Loading and error states
 * - Keyboard navigation
 *
 * Single Responsibility: Chart selection dropdown
 *
 * @module components/charts/drill-down-chart-selector
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  LineChart,
  PieChart,
  Search,
  Table,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { DrillDownTargetChart } from '@/lib/types/drill-down';
import { Spinner } from '@/components/ui/spinner';

/**
 * Chart type to icon mapping
 */
function getChartIcon(chartType: string): React.ElementType {
  switch (chartType) {
    case 'line':
    case 'area':
      return LineChart;
    case 'bar':
    case 'stacked-bar':
    case 'horizontal-bar':
    case 'progress-bar':
      return BarChart3;
    case 'pie':
    case 'doughnut':
      return PieChart;
    case 'table':
      return Table;
    default:
      return BarChart3;
  }
}

/**
 * API response type
 */
interface DrillDownTargetsResponse {
  targets: DrillDownTargetChart[];
}

/**
 * Props for DrillDownChartSelector
 */
interface DrillDownChartSelectorProps {
  /** Source chart ID (to fetch compatible targets) */
  sourceChartId: string;
  /** Currently selected target chart ID */
  selectedChartId: string | null;
  /** Callback when selection changes */
  onSelect: (chartId: string | null) => void;
  /** Optional placeholder text */
  placeholder?: string;
  /** Optional label */
  label?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Searchable dropdown for selecting drill-down target charts
 */
export function DrillDownChartSelector({
  sourceChartId,
  selectedChartId,
  onSelect,
  placeholder = 'Select target chart...',
  label,
  disabled = false,
}: DrillDownChartSelectorProps) {
  // State
  const [targets, setTargets] = useState<DrillDownTargetChart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch compatible target charts
  useEffect(() => {
    if (!sourceChartId) {
      setTargets([]);
      return;
    }

    const fetchTargets = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get<DrillDownTargetsResponse>(
          `/api/admin/analytics/charts/${sourceChartId}/drill-down-targets`
        );
        setTargets(response.targets);
      } catch {
        setError('Failed to load available charts');
        setTargets([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchTargets();
  }, [sourceChartId]);

  // Filter targets by search query
  const filteredTargets = useMemo(() => {
    if (!searchQuery.trim()) {
      return targets;
    }
    const query = searchQuery.toLowerCase();
    return targets.filter(
      (target) =>
        target.chartName.toLowerCase().includes(query) ||
        target.chartType.toLowerCase().includes(query)
    );
  }, [targets, searchQuery]);

  // Get selected chart name
  const selectedChart = useMemo(
    () => targets.find((t) => t.chartDefinitionId === selectedChartId),
    [targets, selectedChartId]
  );

  // Handle selection
  const handleSelect = useCallback(
    (chartId: string) => {
      onSelect(chartId);
      setIsOpen(false);
      setSearchQuery('');
    },
    [onSelect]
  );

  // Handle clear
  const handleClear = useCallback(() => {
    onSelect(null);
    setSearchQuery('');
  }, [onSelect]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      } else if (event.key === 'Enter' && filteredTargets.length === 1) {
        const firstTarget = filteredTargets[0];
        if (firstTarget) {
          handleSelect(firstTarget.chartDefinitionId);
        }
      }
    },
    [filteredTargets, handleSelect]
  );

  return (
    <div className="relative">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}

      {/* Input / Trigger */}
      <div
        className={`
          relative flex items-center gap-2 w-full px-3 py-2
          border rounded-lg bg-white dark:bg-gray-800
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isOpen ? 'border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900' : 'border-gray-300 dark:border-gray-600'}
          ${error ? 'border-red-500' : ''}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
      >
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />

        {isOpen ? (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
            placeholder="Search charts..."
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`flex-1 text-sm truncate ${
              selectedChart
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {loading ? 'Loading...' : selectedChart?.chartName || placeholder}
          </span>
        )}

        {/* Clear button */}
        {selectedChartId && !isOpen && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error message */}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
          {loading && (
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              <Spinner size="sm" className="mx-auto mb-2" />
              Loading charts...
            </div>
          )}

          {!loading && filteredTargets.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No matching charts found' : 'No compatible charts available'}
            </div>
          )}

          {!loading && filteredTargets.length > 0 && (
            <ul role="listbox" className="py-1">
              {filteredTargets.map((target) => {
                const Icon = getChartIcon(target.chartType);
                const isSelected = target.chartDefinitionId === selectedChartId;

                return (
                  <li
                    key={target.chartDefinitionId}
                    role="option"
                    aria-selected={isSelected}
                    className={`
                      flex items-center gap-3 px-3 py-2 cursor-pointer
                      ${isSelected ? 'bg-violet-50 dark:bg-violet-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}
                    `}
                    onClick={() => handleSelect(target.chartDefinitionId)}
                  >
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 ${
                        isSelected
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          isSelected
                            ? 'font-medium text-violet-700 dark:text-violet-300'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {target.chartName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {target.chartType.replace(/-/g, ' ')}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setIsOpen(false);
            setSearchQuery('');
          }}
        />
      )}
    </div>
  );
}

export default DrillDownChartSelector;

