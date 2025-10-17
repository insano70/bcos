'use client';

import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react';
import { useState } from 'react';

export interface FilterOption {
  label: string;
  value: string;
  field: string;
  comparator?: boolean | string | number | null | undefined;
}

export interface FilterGroup {
  group: string;
  options: FilterOption[];
}

export interface ActiveFilter {
  field: string;
  value: string;
  label: string;
  comparator?: boolean | string | number | null | undefined;
}

interface DropdownFilterProps {
  align?: 'left' | 'right';
  filters?: FilterGroup[];
  onFilterChange?: (activeFilters: ActiveFilter[]) => void;
}

export default function DropdownFilter({
  align,
  filters = [],
  onFilterChange,
}: DropdownFilterProps) {
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());

  // Calculate active filter count (excluding "All" options)
  const activeFilterCount = Array.from(selectedFilters).filter((value) => value !== 'all').length;

  const handleCheckboxChange = (option: FilterOption) => {
    setSelectedFilters((prev) => {
      const newSet = new Set(prev);

      // If this is an "All" option, clear all filters in this group
      if (option.value === 'all') {
        // Remove all options from this field
        filters.forEach((group) => {
          group.options.forEach((opt) => {
            if (opt.field === option.field) {
              newSet.delete(opt.value);
            }
          });
        });
        newSet.add(option.value);
      } else {
        // Remove "All" option for this field if it exists
        filters.forEach((group) => {
          group.options.forEach((opt) => {
            if (opt.field === option.field && opt.value === 'all') {
              newSet.delete(opt.value);
            }
          });
        });

        // Toggle the selected filter
        if (newSet.has(option.value)) {
          newSet.delete(option.value);
        } else {
          newSet.add(option.value);
        }
      }

      return newSet;
    });
  };

  const handleClear = () => {
    setSelectedFilters(new Set());
    if (onFilterChange) {
      onFilterChange([]);
    }
  };

  const handleApply = (close: () => void) => {
    if (onFilterChange) {
      const activeFilters: ActiveFilter[] = [];

      filters.forEach((group) => {
        group.options.forEach((option) => {
          if (selectedFilters.has(option.value) && option.value !== 'all') {
            activeFilters.push({
              field: option.field,
              value: option.value,
              label: option.label,
              comparator: option.comparator,
            });
          }
        });
      });

      onFilterChange(activeFilters);
    }
    close();
  };

  // For screens without filters configured, show empty state
  if (!filters || filters.length === 0) {
    return (
      <Popover className="relative inline-flex">
        <PopoverButton className="btn px-2.5 bg-white dark:bg-gray-800 border-gray-200 hover:border-gray-300 dark:border-gray-700/60 dark:hover:border-gray-600 text-gray-400 dark:text-gray-500">
          <span className="sr-only">Filter</span>
          <wbr />
          <svg className="fill-current" width="16" height="16" viewBox="0 0 16 16">
            <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H1a1 1 0 0 1-1-1ZM3 8a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1ZM7 12a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2H7Z" />
          </svg>
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
            className={`origin-top-right z-50 absolute top-full left-0 right-auto min-w-[14rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pt-1.5 rounded-lg shadow-lg overflow-hidden mt-1 ${
              align === 'right' ? 'md:left-auto md:right-0' : 'md:left-0 md:right-auto'
            }`}
          >
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800">
              No filters available
            </div>
          </PopoverPanel>
        </Transition>
      </Popover>
    );
  }

  return (
    <Popover className="relative inline-flex">
      <PopoverButton className="btn px-2.5 bg-white dark:bg-gray-800 border-gray-200 hover:border-gray-300 dark:border-gray-700/60 dark:hover:border-gray-600 text-gray-400 dark:text-gray-500 relative">
        <span className="sr-only">Filter</span>
        <wbr />
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
          className={`origin-top-right z-50 absolute top-full left-0 right-auto min-w-[14rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 pt-1.5 rounded-lg shadow-lg overflow-hidden mt-1 ${
            align === 'right' ? 'md:left-auto md:right-0' : 'md:left-0 md:right-auto'
          }`}
        >
          {({ close }) => (
            <>
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase pt-1.5 pb-2 px-3 bg-white dark:bg-gray-800">
                Filters
              </div>

              {filters.map((filterGroup, groupIndex) => (
                <div key={groupIndex} className="bg-white dark:bg-gray-800">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 pt-2 pb-1 px-3 bg-white dark:bg-gray-800">
                    {filterGroup.group}
                  </div>
                  <ul className="mb-2 bg-white dark:bg-gray-800">
                    {filterGroup.options.map((option, optionIndex) => (
                      <li key={optionIndex} className="py-1 px-3 bg-white dark:bg-gray-800">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            checked={selectedFilters.has(option.value)}
                            onChange={() => handleCheckboxChange(option)}
                          />
                          <span className="text-sm font-medium ml-2 text-gray-800 dark:text-gray-100">
                            {option.label}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="py-2 px-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 opacity-100">
                <ul className="flex items-center justify-between">
                  <li>
                    <button
                      type="button"
                      className="btn-xs bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-red-500"
                      onClick={handleClear}
                    >
                      Clear
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="btn-xs bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
                      onClick={() => handleApply(close)}
                    >
                      Apply
                    </button>
                  </li>
                </ul>
              </div>
            </>
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  );
}
