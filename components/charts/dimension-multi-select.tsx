'use client';

/**
 * Value Multi-Select
 *
 * Multi-select dropdown with search-as-you-type for filter value selection.
 * Used in DimensionValueSelector for selecting specific values within a dimension.
 *
 * Features:
 * - Dropdown with search/filter
 * - Checkboxes for multi-select
 * - Record counts shown next to values
 * - Click outside to close (via Headless UI)
 * - Keyboard navigation (via Headless UI)
 * - Select All / Reset shortcuts
 */

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOptions,
  Transition,
} from '@headlessui/react';
import { useState, useCallback, useMemo } from 'react';
import type { DimensionValue } from '@/lib/types/dimensions';
import { Spinner } from '@/components/ui/spinner';

interface ValueMultiSelectProps {
  /** Dimension name for display */
  dimensionName: string;
  /** Available values to select from */
  options: DimensionValue[];
  /** Currently selected values */
  selected: Set<string | number>;
  /** Callback when selection changes */
  onChange: (selected: Set<string | number>) => void;
  /** Placeholder text when nothing selected */
  placeholder?: string;
  /** Maximum number of selections allowed (optional) */
  maxSelectable?: number;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Compact mode for tighter spacing */
  compact?: boolean;
  /** Whether values are loading */
  isLoading?: boolean;
  /** Error message if value fetch failed */
  error?: string;
}

/**
 * Multi-select dropdown for dimension value selection
 */
export function ValueMultiSelect({
  dimensionName,
  options,
  selected,
  onChange,
  placeholder = 'Select values...',
  maxSelectable,
  disabled = false,
  compact = false,
  isLoading = false,
  error,
}: ValueMultiSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Convert Set to array for Combobox value
  const selectedArray = useMemo(() => Array.from(selected), [selected]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  // Handle selection change from Combobox
  const handleChange = useCallback(
    (newValues: (string | number)[]) => {
      // Check max limit if set
      if (maxSelectable && newValues.length > maxSelectable) {
        return;
      }
      onChange(new Set(newValues));
    },
    [onChange, maxSelectable]
  );

  // Select all values
  const selectAll = useCallback(() => {
    const newSelected = new Set(options.map((opt) => opt.value));
    onChange(newSelected);
  }, [options, onChange]);

  // Reset selection
  const resetSelection = useCallback(() => {
    onChange(new Set());
  }, [onChange]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`flex items-center gap-2 text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}
      >
        <Spinner
          sizeClassName="w-4 h-4"
          borderClassName="border-2"
          trackClassName="border-current opacity-25"
          indicatorClassName="border-current opacity-75"
        />
        <span>Loading {dimensionName}...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`text-red-600 dark:text-red-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        {error}
      </div>
    );
  }

  // Empty state
  if (options.length === 0) {
    return (
      <div className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        No values available
      </div>
    );
  }

  return (
    <Combobox value={selectedArray} onChange={handleChange} disabled={disabled} multiple>
      {({ open }) => (
        <div className="relative">
          {/* Input field / trigger */}
          <div
            className={`
              flex items-center gap-2 rounded-md border cursor-pointer
              bg-white dark:bg-slate-800
              ${
                open
                  ? 'border-violet-400 dark:border-violet-500 ring-1 ring-violet-400 dark:ring-violet-500'
                  : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}
            `}
          >
            <svg
              className={`text-slate-400 flex-shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <ComboboxInput
              className={`
                flex-1 bg-transparent border-none outline-none min-w-0 focus:ring-0
                text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500
                text-base sm:text-sm ${compact ? 'sm:text-xs' : ''}
              `}
              placeholder={selected.size > 0 ? `${selected.size} selected` : placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              displayValue={() => searchQuery}
            />
            <ComboboxButton>
              <svg
                className={`text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''} ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </ComboboxButton>
          </div>

          {/* Dropdown */}
          <Transition
            show={open}
            enter="transition ease-out duration-100 transform"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-out duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ComboboxOptions
              static
              className="absolute z-50 w-full mt-1 rounded-md shadow-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 max-h-60 overflow-hidden flex flex-col focus:outline-none"
            >
              {/* Quick actions */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <span
                  className={`text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}
                >
                  {selected.size}/{options.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={selected.size === options.length}
                    className={`
                      text-violet-600 dark:text-violet-400
                      hover:text-violet-800 dark:hover:text-violet-300
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${compact ? 'text-xs' : 'text-sm'}
                    `}
                  >
                    All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={resetSelection}
                    disabled={selected.size === 0}
                    className={`
                      text-slate-600 dark:text-slate-400
                      hover:text-slate-800 dark:hover:text-slate-200
                      disabled:opacity-40 disabled:cursor-not-allowed
                      ${compact ? 'text-xs' : 'text-sm'}
                    `}
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Options list */}
              <div className="overflow-auto flex-1">
                {filteredOptions.length === 0 ? (
                  <div
                    className={`px-3 py-2 text-slate-500 dark:text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    {searchQuery ? 'No values match your search' : 'No values available'}
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const isSelected = selected.has(option.value);
                    const isDisabled =
                      maxSelectable !== undefined && !isSelected && selected.size >= maxSelectable;

                    return (
                      <label
                        key={String(option.value)}
                        className={`
                          flex items-center gap-2 px-3 py-2 cursor-pointer
                          ${isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                          ${compact ? 'py-1.5' : ''}
                        `}
                        onClick={(e) => {
                          if (isDisabled) {
                            e.preventDefault();
                            return;
                          }
                          // Toggle selection manually since we're using labels
                          const newSelected = new Set(selected);
                          if (newSelected.has(option.value)) {
                            newSelected.delete(option.value);
                          } else {
                            newSelected.add(option.value);
                          }
                          onChange(newSelected);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          disabled={isDisabled}
                          tabIndex={-1}
                          className={`
                            rounded border-slate-300 dark:border-slate-600
                            text-violet-600 focus:ring-violet-500
                            ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}
                          `}
                        />
                        <span
                          className={`flex-1 text-slate-700 dark:text-slate-200 truncate ${compact ? 'text-xs' : 'text-sm'}`}
                        >
                          {option.label}
                        </span>
                        {option.recordCount !== undefined && (
                          <span
                            className={`text-slate-500 dark:text-slate-400 flex-shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}
                          >
                            ({option.recordCount.toLocaleString()})
                          </span>
                        )}
                        {option.isOther && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0">
                            *
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>

              {/* Max selection hint */}
              {maxSelectable !== undefined && selected.size >= maxSelectable && (
                <div
                  className={`px-3 py-1.5 text-amber-600 dark:text-amber-400 border-t border-slate-200 dark:border-slate-700 ${compact ? 'text-[10px]' : 'text-xs'}`}
                >
                  Maximum {maxSelectable} values selected
                </div>
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      )}
    </Combobox>
  );
}

export default ValueMultiSelect;
