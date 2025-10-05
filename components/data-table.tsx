'use client';

import { ReactNode } from 'react';
import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import { usePagination } from '@/lib/hooks/use-pagination';
import PaginationClassic from '@/components/pagination-classic';

export interface DataTableColumn<T> {
  key: keyof T | 'checkbox' | 'actions';
  header?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableAction<T> {
  label: string;
  onClick: (item: T) => void;
  icon?: ReactNode;
  permission?: string;
  className?: string;
}

export interface DataTableProps<T extends { id: string | number }> {
  title: string;
  data: T[];
  columns: DataTableColumn<T>[];
  renderCell?: (key: keyof T | 'checkbox' | 'actions', item: T) => ReactNode;
  actions?: DataTableAction<T>[];
  emptyState?: {
    title: string;
    description?: string;
    icon?: ReactNode;
  };
  pagination?: {
    itemsPerPage?: number;
  };
  getRowId?: (item: T) => string | number;
}

export default function DataTable<T extends { id: string | number }>({
  title,
  data,
  columns,
  renderCell,
  actions,
  emptyState,
  pagination: paginationConfig,
  getRowId,
}: DataTableProps<T>) {
  // Hooks
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(data, getRowId);
  const { sortedData, handleSort, getSortIcon } = useTableSort(data);
  const pagination = usePagination(sortedData, {
    itemsPerPage: paginationConfig?.itemsPerPage || 10,
  });

  const displayData = paginationConfig ? pagination.currentItems : sortedData;
  const hasCheckbox = columns.some((col) => col.key === 'checkbox');
  const hasActions = columns.some((col) => col.key === 'actions');

  const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center justify-center';
    if (align === 'right') return 'text-right justify-end';
    return 'text-left';
  };

  const defaultRenderCell = (key: keyof T | 'checkbox' | 'actions', item: T): ReactNode => {
    if (key === 'checkbox') {
      const itemId = getRowId ? getRowId(item) : item.id;
      return (
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type="checkbox"
              onChange={(e) => handleCheckboxChange(itemId, e.target.checked)}
              checked={selectedItems.includes(itemId)}
            />
          </label>
        </div>
      );
    }

    if (key === 'actions' && actions) {
      return (
        <div className="flex items-center space-x-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => action.onClick(item)}
              className={
                action.className ||
                'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
              }
              title={action.label}
            >
              {action.icon || action.label}
            </button>
          ))}
        </div>
      );
    }

    const value = item[key as keyof T];
    return value !== null && value !== undefined ? String(value) : '';
  };

  const cellRenderer = renderCell || defaultRenderCell;

  return (
    <>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
        <header className="px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title}{' '}
            <span className="text-gray-400 dark:text-gray-500 font-medium">{data.length}</span>
          </h2>
        </header>
        <div>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              {/* Table header */}
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  {columns.map((column, idx) => {
                    if (column.key === 'checkbox') {
                      return (
                        <th
                          key={idx}
                          className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px"
                        >
                          <div className="flex items-center">
                            <label className="inline-flex">
                              <span className="sr-only">Select all</span>
                              <input
                                className="form-checkbox"
                                type="checkbox"
                                onChange={handleSelectAllChange}
                                checked={isAllSelected}
                              />
                            </label>
                          </div>
                        </th>
                      );
                    }

                    if (column.key === 'actions') {
                      return (
                        <th
                          key={idx}
                          className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px"
                        >
                          <span className="sr-only">{column.header || 'Actions'}</span>
                        </th>
                      );
                    }

                    const alignClass = getAlignmentClass(column.align);

                    return (
                      <th
                        key={idx}
                        className={`px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap ${column.className || ''}`}
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(column.key as keyof T)}
                            className={`flex items-center gap-1 font-semibold hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer ${alignClass}`}
                          >
                            <span>{column.header}</span>
                            {getSortIcon(column.key as keyof T)}
                          </button>
                        ) : (
                          <div className={`font-semibold ${alignClass}`}>{column.header}</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              {/* Table body */}
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-2 first:pl-5 last:pr-5 py-12 text-center"
                    >
                      {emptyState ? (
                        <>
                          {emptyState.icon && <div className="mb-2">{emptyState.icon}</div>}
                          <div className="text-gray-500 dark:text-gray-400">
                            {emptyState.title}
                          </div>
                          {emptyState.description && (
                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
                              {emptyState.description}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-500 dark:text-gray-400">No data found</div>
                      )}
                    </td>
                  </tr>
                ) : (
                  displayData.map((item) => {
                    const rowId = getRowId ? getRowId(item) : item.id;
                    return (
                      <tr key={rowId}>
                        {columns.map((column, idx) => {
                          const alignClass = getAlignmentClass(column.align);
                          const isCheckboxCol = column.key === 'checkbox';
                          const isActionsCol = column.key === 'actions';
                          const widthClass =
                            isCheckboxCol || isActionsCol ? 'w-px' : '';

                          return (
                            <td
                              key={idx}
                              className={`px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap ${widthClass} ${column.className || ''}`}
                            >
                              <div className={alignClass}>
                                {cellRenderer(column.key, item)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {paginationConfig && data.length > 0 && (
        <div className="mt-8">
          <PaginationClassic
            currentPage={pagination.currentPage}
            totalItems={pagination.totalItems}
            itemsPerPage={pagination.itemsPerPage}
            startItem={pagination.startItem}
            endItem={pagination.endItem}
            hasPrevious={pagination.hasPrevious}
            hasNext={pagination.hasNext}
            onPrevious={pagination.goToPrevious}
            onNext={pagination.goToNext}
          />
        </div>
      )}
    </>
  );
}
