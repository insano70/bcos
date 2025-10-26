'use client';

import { Fragment, type ReactNode, useMemo, useState } from 'react';
import DeleteConfirmationModal from './delete-confirmation-modal';
import PaginationClassic from '@/components/pagination-classic';
import { useItemSelection } from '@/components/utils/use-item-selection';
import { usePagination } from '@/lib/hooks/use-pagination';
import { useTableSort } from '@/lib/hooks/use-table-sort';
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
  width?: number; // Initial width in pixels for resizable columns
  minWidth?: number; // Minimum width in pixels
}

// Dropdown action definition
export interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => void | Promise<void>;
  variant?: 'default' | 'danger';
  
  /**
   * @deprecated Use confirmModal instead for better UX
   * Native browser confirm dialog (ugly, but works)
   */
  confirm?: string | ((item: T) => string);
  
  /**
   * Custom confirmation modal (recommended)
   * Shows beautiful modal matching app UI design
   * 
   * @example
   * confirmModal: {
   *   title: 'Delete User',
   *   message: (user) => `This action cannot be undone.`,
   *   confirmText: 'Delete User',
   * }
   */
  confirmModal?: {
    title: string | ((item: T) => string);
    message: string | ((item: T) => string);
    confirmText?: string | ((item: T) => string);
  };
  
  show?: (item: T) => boolean;
}

// Bulk action definition
export interface DataTableBulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (items: T[]) => void | Promise<void>;
  variant?: 'default' | 'danger';
  
  /**
   * @deprecated Use confirmModal instead for better UX
   * Native browser confirm dialog (ugly, but works)
   */
  confirm?: string;
  
  /**
   * Custom confirmation modal (recommended)
   * Shows beautiful modal matching app UI design
   */
  confirmModal?: {
    title: string;
    message: string;
    confirmText?: string;
  };
}

// Selection mode
export type SelectionMode = 'none' | 'single' | 'multi';

// Density mode
export type DensityMode = 'normal' | 'compact';

// Main props
export interface DataTableProps<T extends { id: string | number }> {
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
  resizable?: boolean; // Enable column resizing
  densityToggle?: boolean; // Enable density toggle
  stickyHeader?: boolean; // Enable sticky headers
  expandable?: {
    render: (item: T) => ReactNode; // Custom render for expanded content
  };
}

export default function DataTable<T extends { id: string | number }>({
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
  resizable: _resizable = true, // Default to enabled
  densityToggle = true, // Default to enabled
  stickyHeader = true, // Default to enabled
  expandable,
}: DataTableProps<T>) {
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Density state
  const [density, setDensity] = useState<DensityMode>('normal');

  // Column widths state for resizing
  const [_columnWidths, _setColumnWidths] = useState<Record<string, number>>({});

  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());
  
  // Bulk action confirmation modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<DataTableBulkAction<T> | null>(null);

  // Filter visible columns
  const visibleColumns = initialColumns.filter((col) => !hiddenColumns.has(String(col.key)));

  // Selection hook
  const { selectedItems, isAllSelected, handleCheckboxChange, handleSelectAllChange } =
    useItemSelection(data);

  // Search filtering
  const searchedData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    return data.filter((item) => {
      const searchLower = searchQuery.toLowerCase();
      return Object.values(item).some((value) => String(value).toLowerCase().includes(searchLower));
    });
  }, [data, searchQuery]);

  // Sorting
  const { sortedData, handleSort, getSortIcon } = useTableSort(searchedData);

  // Pagination
  const pagination = usePagination(sortedData, {
    itemsPerPage: paginationConfig?.itemsPerPage || 10,
  });

  const displayData = paginationConfig ? pagination.currentItems : sortedData;

  const _hasCheckbox =
    selectionMode !== 'none' && visibleColumns.some((col) => col.key === 'checkbox');
  const _hasActions = visibleColumns.some((col) => col.key === 'actions');

  // Column visibility toggle
  const _toggleColumnVisibility = (key: string) => {
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
    const selectedData =
      selectedItems.length > 0
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
  const selectedItemsData = data.filter((item) => selectedItems.includes(item.id));

  // Helper function to toggle row expansion
  const toggleRowExpansion = (id: string | number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get density-based padding classes
  const getDensityClasses = () => {
    return density === 'compact' ? 'py-2' : 'py-3';
  };

  return (
    <>
      {/* Toolbar */}
      {(searchable ||
        columnVisibility ||
        exportable ||
        densityToggle ||
        (bulkActions && selectedItems.length > 0)) && (
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
                  {bulkActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => {
                        // Check for custom modal first (preferred)
                        if (action.confirmModal) {
                          setPendingBulkAction(action);
                          setBulkModalOpen(true);
                          return;
                        }
                        
                        // Fallback to native confirm (deprecated)
                        if (action.confirm && !confirm(action.confirm)) return;
                        
                        // Execute action
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

              {/* Density Toggle */}
              {densityToggle && (
                <button
                  type="button"
                  onClick={() => setDensity((prev) => (prev === 'normal' ? 'compact' : 'normal'))}
                  className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300"
                  title={density === 'normal' ? 'Switch to compact view' : 'Switch to normal view'}
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                    {density === 'normal' ? (
                      // Icon for normal density (3 lines with spacing)
                      <>
                        <rect x="2" y="3" width="12" height="1" />
                        <rect x="2" y="7" width="12" height="1" />
                        <rect x="2" y="11" width="12" height="1" />
                      </>
                    ) : (
                      // Icon for compact density (4 lines closer together)
                      <>
                        <rect x="2" y="2" width="12" height="1" />
                        <rect x="2" y="5" width="12" height="1" />
                        <rect x="2" y="8" width="12" height="1" />
                        <rect x="2" y="11" width="12" height="1" />
                      </>
                    )}
                  </svg>
                  <span className="ml-2">{density === 'normal' ? 'Normal' : 'Compact'}</span>
                </button>
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
          <div className={`overflow-x-auto ${stickyHeader ? 'max-h-[600px] overflow-y-auto' : ''}`}>
            <table className="table-auto w-full dark:text-gray-300">
              <thead
                className={`text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}
              >
                <tr>
                  {expandable && (
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
                      <span className="sr-only">Expand</span>
                    </th>
                  )}
                  {visibleColumns.map((column, _idx) => {
                    if (column.key === 'checkbox') {
                      return (
                        <th
                          key="checkbox"
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
                          key="actions"
                          className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px"
                        >
                          <span className="sr-only">{column.header || 'Actions'}</span>
                        </th>
                      );
                    }

                    const alignClass = getAlignmentClass(column.align);

                    return (
                      <th
                        key={String(column.key)}
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
                  (() => {
                    let rowCounter = 0;
                    return Array.from({ length: 5 }).map(() => {
                      const currentRow = rowCounter++;
                      return (
                        <tr key={`skeleton-row-${currentRow}`}>
                          {expandable && (
                            <td key={`skeleton-expand-${currentRow}`} className="px-2 first:pl-5 last:pr-5 py-3">
                              <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            </td>
                          )}
                          {visibleColumns.map((col) => (
                            <td key={`skeleton-col-${currentRow}-${String(col.key)}`} className="px-2 first:pl-5 last:pr-5 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      );
                    });
                  })()
                ) : displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + (expandable ? 1 : 0)}
                      className="px-2 first:pl-5 last:pr-5 py-12 text-center"
                    >
                      {emptyState ? (
                        <>
                          {emptyState.icon && <div className="mb-2">{emptyState.icon}</div>}
                          <div className="text-gray-500 dark:text-gray-400">{emptyState.title}</div>
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
                    const isExpanded = expandedRows.has(item.id);
                    return (
                      <Fragment key={item.id}>
                        <tr>
                          {expandable && (
                            <td
                              className={`px-2 first:pl-5 last:pr-5 ${getDensityClasses()} whitespace-nowrap w-px`}
                            >
                              <button
                                type="button"
                                onClick={() => toggleRowExpansion(item.id)}
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
                          {visibleColumns.map((column) => {
                            const _alignClass = getAlignmentClass(column.align);
                            const isCheckboxCol = column.key === 'checkbox';
                            const isActionsCol = column.key === 'actions';
                            const widthClass = isCheckboxCol || isActionsCol ? 'w-px' : '';

                            return (
                              <td
                                key={String(column.key)}
                                className={`px-2 first:pl-5 last:pr-5 ${getDensityClasses()} whitespace-nowrap ${widthClass} ${column.className || ''}`}
                              >
                                {column.render
                                  ? column.render(item)
                                  : defaultRender(column.key, item)}
                              </td>
                            );
                          })}
                        </tr>
                        {expandable && isExpanded && (
                          <tr>
                            <td
                              colSpan={visibleColumns.length + 1}
                              className="px-2 first:pl-5 last:pr-5 py-4 bg-gray-50 dark:bg-gray-900/10"
                            >
                              {expandable.render(item)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
      
      {/* Bulk Action Confirmation Modal */}
      {pendingBulkAction && pendingBulkAction.confirmModal && (
        <DeleteConfirmationModal
          isOpen={bulkModalOpen}
          setIsOpen={setBulkModalOpen}
          title={pendingBulkAction.confirmModal.title}
          itemName={`${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
          message={pendingBulkAction.confirmModal.message}
          confirmButtonText={pendingBulkAction.confirmModal.confirmText || 'Confirm'}
          onConfirm={async () => {
            if (pendingBulkAction) {
              await pendingBulkAction.onClick(selectedItemsData);
              setPendingBulkAction(null);
            }
          }}
        />
      )}
    </>
  );
}
