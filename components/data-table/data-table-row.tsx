'use client';

import { Fragment, type ReactNode, memo } from 'react';
import type { DataTableColumn } from './types';
import { getDensityClasses, type DensityMode } from './utils';

interface DataTableRowProps<T extends { id: string | number }> {
  item: T;
  columns: DataTableColumn<T>[];
  density: DensityMode;
  isExpanded: boolean;
  expandable?: {
    render: (item: T) => ReactNode;
  } | undefined;
  onToggleExpand?: (() => void) | undefined;
  renderCell: (column: DataTableColumn<T>, item: T) => ReactNode;
}

function DataTableRowComponent<T extends { id: string | number }>({
  item,
  columns,
  density,
  isExpanded,
  expandable,
  onToggleExpand,
  renderCell,
}: DataTableRowProps<T>) {
  const paddingClass = getDensityClasses(density);

  return (
    <Fragment>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        {expandable && (
          <td
            className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}
          >
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </td>
        )}
        {columns.map((column) => {
          const isCheckboxCol = column.key === 'checkbox';
          const isActionsCol = column.key === 'actions';
          const widthClass = isCheckboxCol || isActionsCol ? 'w-px' : '';

          return (
            <td
              key={String(column.key)}
              className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap ${widthClass} ${column.className || ''}`}
            >
              {renderCell(column, item)}
            </td>
          );
        })}
      </tr>
      {expandable && isExpanded && (
        <tr>
          <td
            colSpan={columns.length + 1}
            className="px-2 first:pl-5 last:pr-5 py-4 bg-gray-50 dark:bg-gray-900/10"
          >
            {expandable.render(item)}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Memoize to prevent re-renders when other rows change
export const DataTableRow = memo(DataTableRowComponent) as typeof DataTableRowComponent;

