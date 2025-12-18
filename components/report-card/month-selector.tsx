'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthSelectorProps {
  /** Available months in YYYY-MM-DD format, sorted newest first */
  availableMonths: string[];
  /** Currently selected month */
  selectedMonth: string;
  /** Callback when month is selected */
  onMonthChange: (month: string) => void;
  /** Loading state */
  isLoading?: boolean;
  /** Compact mode for mobile */
  compact?: boolean;
  className?: string;
}

/**
 * Format month string for display
 */
function formatMonthLabel(monthStr: string, short = false): string {
  const date = new Date(`${monthStr}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    month: short ? 'short' : 'long',
    year: 'numeric',
  });
}

/**
 * Month Selector Component
 *
 * Allows users to select from available report card months.
 * Shows a dropdown with formatted month names.
 *
 * Arrow convention (timeline order):
 * - Left arrow = go back in time (older months)
 * - Right arrow = go forward in time (newer months)
 */
export default function MonthSelector({
  availableMonths,
  selectedMonth,
  onMonthChange,
  isLoading,
  compact = false,
  className = '',
}: MonthSelectorProps) {
  if (!availableMonths || availableMonths.length === 0) {
    return null;
  }

  const currentIndex = availableMonths.indexOf(selectedMonth);
  // Array is sorted newest first, so:
  // - Going "back in time" (left arrow) = higher index = older month
  // - Going "forward in time" (right arrow) = lower index = newer month
  const canGoOlder = currentIndex < availableMonths.length - 1;
  const canGoNewer = currentIndex > 0;

  const handleGoOlder = () => {
    const olderMonth = availableMonths[currentIndex + 1];
    if (canGoOlder && olderMonth) {
      onMonthChange(olderMonth);
    }
  };

  const handleGoNewer = () => {
    const newerMonth = availableMonths[currentIndex - 1];
    if (canGoNewer && newerMonth) {
      onMonthChange(newerMonth);
    }
  };

  const displayLabel = formatMonthLabel(selectedMonth, compact);
  const isLatest = currentIndex === 0;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Left arrow = go back in time (older) */}
      <button
        onClick={handleGoOlder}
        disabled={!canGoOlder}
        className={`p-1 rounded-md transition-colors ${
          canGoOlder
            ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
        title="Previous month"
        aria-label="Go to previous month"
      >
        <ChevronLeft className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </button>

      {/* Month dropdown */}
      <Listbox value={selectedMonth} onChange={onMonthChange} disabled={isLoading ?? false}>
        {({ open }) => (
          <div className="relative">
            <ListboxButton
              className={`flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
                compact ? 'px-2 py-1 min-w-[120px]' : 'px-3 py-1.5 min-w-[160px]'
              } ${open ? 'ring-2 ring-blue-500' : ''}`}
            >
              <span
                className={`font-medium text-slate-700 dark:text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}
              >
                {displayLabel}
              </span>
              {isLatest && (
                <span
                  className={`font-medium text-emerald-500 uppercase tracking-wide ${compact ? 'text-[8px]' : 'text-[10px]'}`}
                >
                  Latest
                </span>
              )}
              <ChevronDown
                className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`}
              />
            </ListboxButton>

            {/* Dropdown menu */}
            <Transition
              show={open}
              enter="transition ease-out duration-100 transform"
              enterFrom="opacity-0 -translate-y-2"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-out duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <ListboxOptions
                static
                className="absolute z-50 top-full left-0 mt-1 w-full min-w-[160px] bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 max-h-48 overflow-y-auto focus:outline-none"
              >
                {availableMonths.map((month, index) => (
                  <ListboxOption
                    key={month}
                    value={month}
                    className={({ focus }) => `
                      w-full px-3 py-2 text-left text-sm flex items-center justify-between cursor-pointer transition-colors
                      ${focus ? 'bg-slate-100 dark:bg-slate-700' : ''}
                      ${selectedMonth === month ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}
                    `}
                  >
                    <span>{formatMonthLabel(month)}</span>
                    {index === 0 && (
                      <span className="text-[10px] font-medium text-emerald-500 uppercase">Latest</span>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </Transition>
          </div>
        )}
      </Listbox>

      {/* Right arrow = go forward in time (newer) */}
      <button
        onClick={handleGoNewer}
        disabled={!canGoNewer}
        className={`p-1 rounded-md transition-colors ${
          canGoNewer
            ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
        title="Next month"
        aria-label="Go to next month"
      >
        <ChevronRight className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
      </button>
    </div>
  );
}
