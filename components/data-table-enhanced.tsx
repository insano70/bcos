'use client';

import { ReactNode, useState, useMemo } from 'react';
import { useItemSelection } from '@/components/utils/use-item-selection';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import { usePagination } from '@/lib/hooks/use-pagination';
import PaginationClassic from '@/components/pagination-classic';
import DataTableDropdown from './data-table-dropdown';

// Column definition
export interface DataTableColumn<T> {
  key: keyof T | 'checkbox' | 'actions';
  header?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  visible?: boolean;
  render?: (item: T) => ReactNode;
}

// Dropdown action definition
export interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirm?: string | ((item: T) => string);
  show?: (item: T) => boolean;
}

// Bulk action definition
export interface DataTableBulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (items: T[]) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirm?: string;
}

// Selection mode
export type SelectionMode = 'none' | 'single' | 'multi';

// Main props
export interface DataTableEnhancedProps<T extends { id: string | number }> {
  title: string;
  data: T[];
  columns: DataTableColumn<T>[];
  dropdownActions?: (item: T) => DataTableDropdownAction<T>[];
  bulkActions?: DataTableBulkAction<T>[];
  emptyState?: {
    title: string;
    description?: string;
    icon?: ReactNode;
  };
  pagination?: {
    itemsPerPage?: number;
  };
  selectionMode?: SelectionMode;
  searchable?: boolean;
  searchPlaceholder?: string;
  columnVisibility?: boolean;
  exportable?: boolean;
  exportFileName?: string;
  isLoading?: boolean;
}

export default function DataTableEnhanced<T extends { id: string | number }>({
  title,
  data,
  columns: initialColumns,
  dropdownActions,
  bulkActions,
  emptyState,
  pagination: paginationConfig,
  selectionMode = 'multi',
  searchable = false,
  searchPlaceholder = 'Search...',
  columnVisibility = false,
  exportable = false,
  exportFileName = 'export',
  isLoading = false,
}: DataTableEnhancedProps<T>) {
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Filter visible columns
  const visibleColumns = initialColumns.filter(
    (col) => !hiddenColumns.has(String(col.key))
  );

  // Selection hook
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(data);

  // Search filtering
  const searchedData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    return data.filter((item) => {
      const searchLower = searchQuery.toLowerCase();
      return Object.values(item).some((value) =>
        String(value).toLowerCase().includes(searchLower)
      );
    });
  }, [data, searchQuery]);

  // Sorting
  const { sortedData, handleSort, getSortIcon } = useTableSort(searchedData);

  // Pagination
  const pagination = usePagination(sortedData, {
    itemsPerPage: paginationConfig?.itemsPerPage || 10,
  });

  const displayData = paginationConfig ? pagination.currentItems : sortedData;

  const hasCheckbox = selectionMode !== 'none' && visibleColumns.some((col) => col.key === 'checkbox');
  const hasActions = visibleColumns.some((col) => col.key === 'actions');

  // Column visibility toggle
  const toggleColumnVisibility = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // CSV Export
  const handleExport = () => {
    const selectedData = selectedItems.length > 0
      ? data.filter((item) => selectedItems.includes(item.id))
      : sortedData;

    const headers = visibleColumns
      .filter((col) => col.key !== 'checkbox' && col.key !== 'actions' && col.header)
      .map((col) => col.header);

    const rows = selectedData.map((item) =>
      visibleColumns
        .filter((col) => col.key !== 'checkbox' && col.key !== 'actions')
        .map((col) => {
          const value = item[col.key as keyof T];
          return value !== null && value !== undefined ? String(value) : '';
        })
    );

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center justify-center';
    if (align === 'right') return 'text-right justify-end';
    return 'text-left';
  };

  const defaultRender = (key: keyof T | 'checkbox' | 'actions', item: T): ReactNode => {
    if (key === 'checkbox') {
      return (
        <div className="flex items-center">
          <label className="inline-flex">
            <span className="sr-only">Select</span>
            <input
              className="form-checkbox"
              type={selectionMode === 'single' ? 'radio' : 'checkbox'}
              onChange={(e) => handleCheckboxChange(item.id, e.target.checked)}
              checked={selectedItems.includes(item.id)}
            />
          </label>
        </div>
      );
    }

    if (key === 'actions' && dropdownActions) {
      return <DataTableDropdown item={item} actions={dropdownActions(item)} />;
    }

    const value = item[key as keyof T];
    return value !== null && value !== undefined ? String(value) : '';
  };

  // Get selected items for bulk actions
  const selectedItemsData = data.filter((item) =>
    selectedItems.includes(item.id)
  );

  return (
    <>
      {/* Toolbar */}
      {(searchable || columnVisibility || exportable || (bulkActions && selectedItems.length > 0)) && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left side - Search */}
            {searchable && (
              <div className="flex-1 min-w-[200px] max-w-md">
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input w-full"
                />
              </div>
            )}

            {/* Right side - Actions */}
            <div className="flex items-center gap-2">
              {/* Bulk Actions */}
              {bulkActions && selectedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedItems.length} selected
                  </span>
                  {bulkActions.map((action, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (action.confirm && !confirm(action.confirm)) return;
                        action.onClick(selectedItemsData);
                      }}
                      className={`btn-sm ${
                        action.variant === 'danger'
                          ? 'bg-red-500 hover:bg-red-600 text-white'
                          : 'bg-gray-900 hover:bg-gray-800 text-gray-100'
                      }`}
                    >
                      {action.icon && <span className="mr-1">{action.icon}</span>}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Export */}
              {exportable && (
                <button
                  type="button"
                  onClick={handleExport}
                  className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
                >
                  Export CSV
                </button>
              )}

              {/* Column Visibility */}
              {columnVisibility && (
                <div className="relative">
                  <button
                    type="button"
                    className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
                  >
                    Columns
                  </button>
                  {/* TODO: Implement dropdown for column visibility */}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
        <header className="px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title}{' '}
            <span className="text-gray-400 dark:text-gray-500 font-medium">
              {searchedData.length}
            </span>
          </h2>
        </header>
        <div>
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  {visibleColumns.map((column, idx) => {
                    if (column.key === 'checkbox') {
                      return (
                        <th
                          key={idx}
                          className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px"
                        >
                          {selectionMode === 'multi' && (
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
                          )}
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
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx}>
                      {visibleColumns.map((col, colIdx) => (
                        <td key={colIdx} className="px-2 first:pl-5 last:pr-5 py-3">
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
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
                    return (
                      <tr key={item.id}>
                        {visibleColumns.map((column, idx) => {
                          const alignClass = getAlignmentClass(column.align);
                          const isCheckboxCol = column.key === 'checkbox';
                          const isActionsCol = column.key === 'actions';
                          const widthClass = isCheckboxCol || isActionsCol ? 'w-px' : '';

                          return (
                            <td
                              key={idx}
                              className={`px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap ${widthClass} ${column.className || ''}`}
                            >
                              {column.render
                                ? column.render(item)
                                : defaultRender(column.key, item)}
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
      {paginationConfig && searchedData.length > 0 && !isLoading && (
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
