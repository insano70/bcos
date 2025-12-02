'use client';

import type { ReactNode } from 'react';
import type { DataTableColumn } from './types';

/**
 * Utility functions for creating common column configurations.
 * 
 * Reduces boilerplate when defining columns that follow standard patterns.
 * 
 * @example
 * ```tsx
 * import { checkboxColumn, actionsColumn, dateColumn, statusBadgeColumn } from '@/components/data-table';
 * 
 * const columns: DataTableColumn<User>[] = [
 *   checkboxColumn(),
 *   { key: 'name', header: 'Name', sortable: true },
 *   dateColumn('created_at', 'Created'),
 *   statusBadgeColumn('status', 'Status', {
 *     active: { label: 'Active', color: 'green' },
 *     inactive: { label: 'Inactive', color: 'red' },
 *   }),
 *   actionsColumn(),
 * ];
 * ```
 */

/**
 * Creates a checkbox column for row selection.
 */
export function checkboxColumn<T extends { id: string | number }>(): DataTableColumn<T> {
  return {
    key: 'checkbox',
  };
}

/**
 * Creates an actions column for row actions (dropdowns, buttons).
 * @param width - Optional width override (default: '200px')
 */
export function actionsColumn<T>(width = '200px'): DataTableColumn<T> {
  return {
    key: 'actions',
    width,
  };
}

type DateFormatOptions = {
  /** Date format style */
  style?: 'short' | 'medium' | 'long';
  /** Show time in addition to date */
  showTime?: boolean;
};

/**
 * Creates a date column with consistent formatting.
 * @param key - The field key containing the date value
 * @param header - Column header text
 * @param options - Formatting options
 */
export function dateColumn<T>(
  key: keyof T,
  header: string,
  options: DateFormatOptions = {}
): DataTableColumn<T> {
  const { style = 'medium', showTime = false } = options;

  const formatDate = (date: unknown): string => {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date as Date;
    if (Number.isNaN(dateObj.getTime())) return '—';

    const dateOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: style === 'short' ? '2-digit' : style === 'long' ? 'long' : 'short',
      day: 'numeric',
    };

    if (showTime) {
      dateOptions.hour = '2-digit';
      dateOptions.minute = '2-digit';
    }

    return dateObj.toLocaleDateString('en-US', dateOptions);
  };

  return {
    key: key as keyof T | 'checkbox' | 'actions' | 'expand',
    header,
    sortable: true,
    render: (item) => (
      <span className="text-gray-500 dark:text-gray-400">
        {formatDate(item[key])}
      </span>
    ),
  };
}

type BadgeConfig = {
  label: string;
  color: 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple';
};

const badgeColorClasses: Record<BadgeConfig['color'], string> = {
  green: 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
  red: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
  yellow: 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400',
  blue: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
  gray: 'text-gray-700 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400',
  orange: 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400',
  purple: 'text-purple-700 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400',
};

/**
 * Creates a status badge column with configurable colors per status.
 * @param key - The field key containing the status value
 * @param header - Column header text
 * @param statusConfig - Map of status values to badge configuration
 * @param defaultConfig - Default badge config for unknown statuses
 */
export function statusBadgeColumn<T>(
  key: keyof T,
  header: string,
  statusConfig: Record<string, BadgeConfig>,
  defaultConfig: BadgeConfig = { label: 'Unknown', color: 'gray' }
): DataTableColumn<T> {
  return {
    key: key as keyof T | 'checkbox' | 'actions' | 'expand',
    header,
    sortable: true,
    align: 'center',
    render: (item) => {
      const value = String(item[key] ?? '');
      const config = statusConfig[value] || {
        ...defaultConfig,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      };
      const colorClass = badgeColorClasses[config.color];

      return (
        <div className="text-center">
          <span
            className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}
          >
            {config.label}
          </span>
        </div>
      );
    },
  };
}

/**
 * Creates a user/name column with avatar initials.
 * @param firstNameKey - Key for first name field
 * @param lastNameKey - Key for last name field (optional)
 * @param header - Column header text
 * @param avatarColor - Background color for avatar (default: 'violet')
 */
export function userColumn<T>(
  firstNameKey: keyof T,
  lastNameKey: keyof T | null,
  header: string,
  avatarColor: 'violet' | 'blue' | 'green' | 'orange' | 'red' = 'violet'
): DataTableColumn<T> {
  const colorClasses: Record<typeof avatarColor, string> = {
    violet: 'bg-violet-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return {
    key: firstNameKey as keyof T | 'checkbox' | 'actions' | 'expand',
    header,
    sortable: true,
    render: (item) => {
      const firstName = String(item[firstNameKey] ?? '');
      const lastName = lastNameKey ? String(item[lastNameKey] ?? '') : '';
      const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
      const fullName = lastName ? `${firstName} ${lastName}` : firstName;

      return (
        <div className="flex items-center">
          <div className="w-10 h-10 shrink-0 mr-2 sm:mr-3">
            <div
              className={`w-10 h-10 rounded-full ${colorClasses[avatarColor]} flex items-center justify-center text-white font-medium`}
            >
              {initials || '?'}
            </div>
          </div>
          <div className="font-medium text-gray-800 dark:text-gray-100">
            {fullName || 'Unknown'}
          </div>
        </div>
      );
    },
  };
}

/**
 * Creates a text column with optional link styling.
 * @param key - The field key
 * @param header - Column header text
 * @param options - Column options
 */
export function textColumn<T>(
  key: keyof T,
  header: string,
  options: {
    sortable?: boolean;
    className?: string;
    emptyText?: string;
    render?: (value: unknown, item: T) => ReactNode;
  } = {}
): DataTableColumn<T> {
  const { sortable = true, className = '', emptyText = '—', render } = options;

  return {
    key: key as keyof T | 'checkbox' | 'actions' | 'expand',
    header,
    sortable,
    render: (item) => {
      const value = item[key];
      if (render) {
        return render(value, item);
      }
      const displayValue = value !== null && value !== undefined && value !== ''
        ? String(value)
        : emptyText;
      
      return (
        <span className={`text-gray-600 dark:text-gray-400 ${className}`}>
          {displayValue}
        </span>
      );
    },
  };
}

