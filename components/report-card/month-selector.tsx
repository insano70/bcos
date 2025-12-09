'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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
    year: 'numeric' 
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
    <div className={`flex items-center gap-1 ${className}`} ref={dropdownRef}>
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
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
            compact ? 'px-2 py-1 min-w-[120px]' : 'px-3 py-1.5 min-w-[160px]'
          }`}
        >
          <span className={`font-medium text-slate-700 dark:text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
            {displayLabel}
          </span>
          {isLatest && (
            <span className={`font-medium text-emerald-500 uppercase tracking-wide ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
              Latest
            </span>
          )}
          <ChevronDown 
            className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} 
          />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-full min-w-[160px] bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
            <div className="max-h-48 overflow-y-auto">
              {availableMonths.map((month, index) => (
                <button
                  key={month}
                  onClick={() => {
                    onMonthChange(month);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                    selectedMonth === month
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{formatMonthLabel(month)}</span>
                  {index === 0 && (
                    <span className="text-[10px] font-medium text-emerald-500 uppercase">
                      Latest
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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

