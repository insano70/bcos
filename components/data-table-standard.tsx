'use client';

import { type ReactNode, useCallback, useMemo, useState } from 'react';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { useItemSelection } from '@/components/utils/use-item-selection';
import { usePagination } from '@/lib/hooks/use-pagination';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import DataTableDropdown from './data-table-dropdown';
import { BaseDataTable } from './data-table/base-data-table';
import { DataTablePagination } from './data-table/data-table-pagination';
import { DataTableToolbar } from './data-table/data-table-toolbar';
import { DataTableRow } from './data-table/data-table-row';
import type { DataTableBulkAction, DataTableColumn } from './data-table/types';
import { DEFAULT_ITEMS_PER_PAGE, type DensityMode } from './data-table/utils';

// Re-export types for backward compatibility
export type { DataTableColumn, DataTableBulkAction };

// Dropdown action definition
export interface DataTableDropdownAction<T> {
  label: string | ((item: T) => string);
  icon?: ReactNode;
  onClick: (item: T) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirm?: string | ((item: T) => string);
  confirmModal?: {
    title: string | ((item: T) => string);
    message: string | ((item: T) => string);
    confirmText?: string | ((item: T) => string);
  };
  show?: (item: T) => boolean;
}

// Selection mode
export type SelectionMode = 'none' | 'single' | 'multi';

// Re-export DensityMode for backward compatibility
export type { DensityMode };

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
  exportable?: boolean;
  exportFileName?: string;
  isLoading?: boolean;
  /** @reserved Future feature - not yet implemented */
  resizable?: boolean;
  densityToggle?: boolean; // Enable density toggle
  stickyHeader?: boolean; // Enable sticky headers
  expandable?: {
    render: (item: T) => ReactNode; // Custom render for expanded content
  };
}

/**
 * Standard read-only data table component.
 *
 * ## Selection State Architecture
 * Uses **GLOBAL selection state** via `useItemSelection` hook, which stores
 * selected IDs in React context. This enables:
 * - Selection to persist across re-renders and page navigation
 * - External components (DeleteButton, etc.) to access selected items
 * - Bulk actions via the toolbar
 *
 * **For inline editing with local selection**, use `EditableDataTable` instead.
 *
 * @see EditableDataTable - For tables requiring inline edit/save/cancel
 * @see useItemSelection - For the selection hook documentation
 */
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
  exportable = false,
  exportFileName = 'export',
  isLoading = false,
  resizable: _resizable = true,
  densityToggle = true,
  stickyHeader = true,
  expandable,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');

  // Density state
  const [density, setDensity] = useState<DensityMode>('normal');

  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  // Bulk action confirmation modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<DataTableBulkAction<T> | null>(null);

  // Use columns directly (column visibility feature removed as unused)
  const visibleColumns = initialColumns;

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
  const { sortedData, handleSort, getSortIcon, sortConfig } = useTableSort(searchedData);

  // Map sort direction for ARIA accessibility
  const ariaSortDirection = sortConfig?.direction === 'asc'
    ? 'ascending' as const
    : sortConfig?.direction === 'desc'
      ? 'descending' as const
      : undefined;

  // Pagination
  const pagination = usePagination(sortedData, {
    itemsPerPage: paginationConfig?.itemsPerPage || DEFAULT_ITEMS_PER_PAGE,
  });

  const displayData = paginationConfig ? pagination.currentItems : sortedData;

  /**
   * Escape a value for safe CSV export.
   * Handles commas, quotes, newlines, and formula injection prevention.
   */
  const escapeCSVValue = (value: string): string => {
    // Prevent formula injection by prefixing dangerous characters
    const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
    let escaped = value;
    if (formulaChars.some((char) => value.startsWith(char))) {
      escaped = `'${value}`;
    }
    // Escape quotes by doubling them, wrap in quotes if contains special chars
    if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
      return `"${escaped.replace(/"/g, '""')}"`;
    }
    return escaped;
  };

  // CSV Export
  const handleExport = () => {
    const selectedData =
      selectedItems.length > 0
        ? data.filter((item) => selectedItems.includes(item.id))
        : sortedData;

    const headers = visibleColumns
      .filter((col) => col.key !== 'checkbox' && col.key !== 'actions' && col.header)
      .map((col) => escapeCSVValue(col.header || ''));

    const rows = selectedData.map((item) =>
      visibleColumns
        .filter((col) => col.key !== 'checkbox' && col.key !== 'actions')
        .map((col) => {
          const value = item[col.key as keyof T];
          const stringValue = value !== null && value !== undefined ? String(value) : '';
          return escapeCSVValue(stringValue);
        })
    );

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Default cell renderer wrapped in useCallback for memoization
  const defaultRender = useCallback(
    (key: keyof T | 'checkbox' | 'actions' | 'expand', item: T): ReactNode => {
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
    },
    [selectionMode, handleCheckboxChange, selectedItems, dropdownActions]
  );

  // Get selected items for bulk actions
  const selectedItemsData = data.filter((item) => selectedItems.includes(item.id));

  // Helper function to toggle row expansion
  const toggleRowExpansion = useCallback((id: string | number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Memoized cell renderer to prevent unnecessary re-renders
  const renderCell = useCallback(
    (column: DataTableColumn<T>, item: T): ReactNode => {
      if (column.render) {
        return column.render(item);
      }
      return defaultRender(column.key, item);
    },
    [defaultRender]
  );

  return (
    <>
      <DataTableToolbar
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        bulkActions={bulkActions}
        selectedItemsCount={selectedItems.length}
        onBulkAction={(action: DataTableBulkAction<T>) => {
          // Always use modal for confirmation (confirmModal preferred, legacy confirm converted)
          if (action.confirmModal || action.confirm) {
            setPendingBulkAction(action);
            setBulkModalOpen(true);
            return;
          }
          // No confirmation needed - execute directly
          action.onClick(selectedItemsData);
        }}
        densityToggle={densityToggle}
        density={density}
        onDensityChange={setDensity}
        exportable={exportable}
        onExport={handleExport}
      />

      <BaseDataTable
        title={title}
        data={displayData}
        columns={visibleColumns}
        isLoading={isLoading}
        emptyState={emptyState}
        sortable={true}
        onSort={handleSort}
        getSortIcon={getSortIcon}
        currentSortKey={sortConfig?.key}
        currentSortDirection={ariaSortDirection}
        selectable={selectionMode !== 'none'}
        selectionMode={selectionMode === 'none' ? undefined : selectionMode}
        isAllSelected={isAllSelected}
        onSelectAll={handleSelectAllChange}
        expandable={!!expandable}
        stickyHeader={!!stickyHeader}
        density={density}
      >
        {displayData.map((item) => (
          <DataTableRow
            key={item.id}
            item={item}
            columns={visibleColumns}
            density={density}
            isExpanded={expandedRows.has(item.id)}
            expandable={expandable}
            onToggleExpand={() => toggleRowExpansion(item.id)}
            renderCell={renderCell}
          />
        ))}
      </BaseDataTable>

      {paginationConfig && (
        <DataTablePagination
          pagination={{
            ...pagination,
            goToPrevious: pagination.goToPrevious,
            goToNext: pagination.goToNext,
          }}
          isLoading={isLoading}
        />
      )}

      {pendingBulkAction && (pendingBulkAction.confirmModal || pendingBulkAction.confirm) && (() => {
        // Get first item for dynamic modal content (only used when function callbacks need it)
        const firstItem = selectedItemsData[0];
        return (
          <DeleteConfirmationModal
            isOpen={bulkModalOpen}
            setIsOpen={setBulkModalOpen}
            title={
              pendingBulkAction.confirmModal?.title
                ? typeof pendingBulkAction.confirmModal.title === 'function' && firstItem
                  ? pendingBulkAction.confirmModal.title(firstItem)
                  : typeof pendingBulkAction.confirmModal.title === 'string'
                    ? pendingBulkAction.confirmModal.title
                    : 'Confirm Action'
                : 'Confirm Action'
            }
            itemName={`${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
            message={
              pendingBulkAction.confirmModal?.message
                ? typeof pendingBulkAction.confirmModal.message === 'function' && firstItem
                  ? pendingBulkAction.confirmModal.message(firstItem)
                  : typeof pendingBulkAction.confirmModal.message === 'string'
                    ? pendingBulkAction.confirmModal.message
                    : 'Are you sure you want to proceed?'
                : pendingBulkAction.confirm || 'Are you sure you want to proceed?'
            }
            confirmButtonText={
              pendingBulkAction.confirmModal?.confirmText
                ? typeof pendingBulkAction.confirmModal.confirmText === 'function' && firstItem
                  ? pendingBulkAction.confirmModal.confirmText(firstItem)
                  : typeof pendingBulkAction.confirmModal.confirmText === 'string'
                    ? pendingBulkAction.confirmModal.confirmText
                    : 'Confirm'
                : 'Confirm'
            }
            onConfirm={async () => {
              if (pendingBulkAction) {
                await pendingBulkAction.onClick(selectedItemsData);
                setPendingBulkAction(null);
              }
            }}
          />
        );
      })()}
    </>
  );
}
