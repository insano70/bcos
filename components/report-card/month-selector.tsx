'use client';

import { ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface MonthSelectorProps {
  /** Available months in YYYY-MM-DD format, sorted newest first */
  availableMonths: string[];
  /** Currently selected month (undefined means latest) */
  selectedMonth: string | undefined;
  /** Callback when month is selected */
  onMonthChange: (month: string | undefined) => void;
  /** Whether to show "Latest" option */
  showLatest?: boolean;
  /** Loading state */
  isLoading?: boolean;
  className?: string;
}

/**
 * Format month string for display (full month name)
 */
function formatMonthLabel(monthStr: string): string {
  const date = new Date(`${monthStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Format month string for full display
 */
function formatMonthFull(monthStr: string): string {
  const date = new Date(`${monthStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Month Selector Component
 * 
 * Allows users to select from available report card months.
 * Shows a dropdown with formatted month names.
 */
export default function MonthSelector({
  availableMonths,
  selectedMonth,
  onMonthChange,
  showLatest = true,
  isLoading,
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

  const currentIndex = selectedMonth 
    ? availableMonths.indexOf(selectedMonth) 
    : -1;
  const canGoNewer = selectedMonth ? currentIndex > 0 : false;
  const canGoOlder = selectedMonth 
    ? currentIndex < availableMonths.length - 1 
    : availableMonths.length > 1;

  const handlePrevious = () => {
    if (canGoNewer) {
      onMonthChange(availableMonths[currentIndex - 1]);
    } else if (!selectedMonth && availableMonths.length > 0) {
      // If viewing latest, go to second newest
      onMonthChange(availableMonths[0]);
    }
  };

  const handleNext = () => {
    if (canGoOlder && selectedMonth) {
      onMonthChange(availableMonths[currentIndex + 1]);
    }
  };

  const displayLabel = selectedMonth 
    ? formatMonthFull(selectedMonth)
    : 'Latest';

  const isLatest = !selectedMonth || selectedMonth === availableMonths[0];

  return (
    <div className={`flex items-center gap-2 ${className}`} ref={dropdownRef}>
      {/* Previous button */}
      <button
        onClick={handlePrevious}
        disabled={!canGoNewer && selectedMonth !== undefined}
        className={`p-1.5 rounded-lg transition-colors ${
          canGoNewer || !selectedMonth
            ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
        title="Newer month"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Month dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors min-w-[160px] justify-between"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {displayLabel}
            </span>
          </div>
          {isLatest && (
            <span className="text-[10px] font-medium text-blue-500 uppercase tracking-wide">
              Current
            </span>
          )}
          <ChevronDown 
            className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
            {showLatest && (
              <button
                onClick={() => {
                  onMonthChange(undefined);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                  !selectedMonth
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>Latest</span>
                {!selectedMonth && (
                  <span className="text-[10px] font-medium text-blue-500 uppercase">
                    Selected
                  </span>
                )}
              </button>
            )}
            
            {showLatest && <div className="border-t border-slate-200 dark:border-slate-700 my-1" />}
            
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
                  {index === 0 && !selectedMonth && (
                    <span className="text-[10px] font-medium text-slate-400">
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Next button */}
      <button
        onClick={handleNext}
        disabled={!canGoOlder}
        className={`p-1.5 rounded-lg transition-colors ${
          canGoOlder
            ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
        }`}
        title="Older month"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

