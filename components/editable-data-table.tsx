'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import EditableTableRow from './editable-table-row';
import PaginationClassic from './pagination-classic';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { usePagination } from '@/lib/hooks/use-pagination';

// Column definition with display and edit mode support
export interface EditableColumn<T> {
  key: keyof T | 'checkbox' | 'actions' | 'expand';
  header?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  width?: string; // e.g., '200px', '30%', 'auto'

  // Display mode rendering
  render?: (item: T) => ReactNode;

  // Edit mode rendering
  renderEdit?: (
    item: T,
    value: unknown,
    onChange: (value: unknown) => void,
    error?: string
  ) => ReactNode;

  // Field metadata
  editable?: boolean; // Default: false for checkbox/actions, true for data columns
  required?: boolean;
  validate?: (value: unknown, item: T) => string | undefined; // Return error message
}

// Bulk action definition
export interface EditableDataTableBulkAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (items: T[]) => void | Promise<void>;
  variant?: 'default' | 'danger';
  confirmModal?: {
    title: string;
    message: string;
    confirmText?: string;
  };
}

// Main props interface
export interface EditableDataTableProps<T extends { id: string }> {
  title: string;
  data: T[];
  columns: EditableColumn<T>[];

  // Edit mode callbacks
  onSave?: (item: T, changes: Partial<T>) => Promise<void>;
  onDelete?: (item: T) => Promise<void>;
  onCancel?: (item: T) => void;
  onQuickAdd?: () => Promise<string | undefined>; // Rapid stub creation - returns new item ID to auto-edit
  onNavigate?: (item: T) => void; // Navigate to detail page
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void; // Notify parent of unsaved changes

  // Row expansion
  expandable?: {
    render: (
      item: T,
      isEditing: boolean,
      changes: Partial<T>,
      onChange: (key: keyof T, value: unknown) => void,
      errors: Record<string, string>
    ) => ReactNode;
  };

  // Bulk actions
  bulkActions?: EditableDataTableBulkAction<T>[];

  // UI configuration
  pagination?: {
    itemsPerPage?: number;
  };
  emptyState?: {
    title: string;
    description?: string;
    icon?: ReactNode;
  };
  isLoading?: boolean;

  // Edit mode configuration
  allowMultiEdit?: boolean; // Default: true
  unsavedChangesWarning?: boolean; // Default: true
  keyboardNavigation?: boolean; // Default: true

  // Row state overrides (for optimistic updates)
  editingRows?: Set<string>; // Row IDs in edit mode
  savingRows?: Set<string>; // Row IDs currently saving
  errorRows?: Map<string, string>; // Row ID → error message
}

export default function EditableDataTable<T extends { id: string }>({
  title,
  data,
  columns,
  onSave,
  onDelete,
  onCancel,
  onQuickAdd,
  onNavigate,
  onUnsavedChangesChange,
  expandable,
  bulkActions,
  pagination: paginationConfig,
  emptyState,
  isLoading = false,
  allowMultiEdit = true,
  unsavedChangesWarning: _unsavedChangesWarning = true,
  keyboardNavigation: _keyboardNavigation = true,
  editingRows: externalEditingRows,
  savingRows: externalSavingRows,
  errorRows: _externalErrorRows,
}: EditableDataTableProps<T>) {
  // Internal state for edit mode tracking
  const [internalEditingRows, setInternalEditingRows] = useState<Set<string>>(new Set());
  const [internalSavingRows, setInternalSavingRows] = useState<Set<string>>(new Set());

  // Pagination
  const pagination = usePagination(data, {
    itemsPerPage: paginationConfig?.itemsPerPage || 50,
  });

  // Use paginated data if pagination is enabled, otherwise use all data
  const displayData = paginationConfig ? pagination.currentItems : data;

  // Use external state if provided, otherwise use internal state
  const editingRows = externalEditingRows ?? internalEditingRows;
  const savingRows = externalSavingRows ?? internalSavingRows;

  // Unsaved changes tracking
  const [unsavedChanges, setUnsavedChanges] = useState<Map<string, Partial<T>>>(new Map());

  // Validation errors tracking
  const [validationErrors, setValidationErrors] = useState<Map<string, Record<string, string>>>(
    new Map()
  );

  // Expanded rows tracking
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Selected rows for bulk actions
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Warn user about unsaved changes before navigating away
  useEffect(() => {
    if (!_unsavedChangesWarning) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there are any unsaved changes
      if (unsavedChanges.size > 0) {
        e.preventDefault();
        // Chrome requires returnValue to be set
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [unsavedChanges, _unsavedChangesWarning]);

  // Notify parent component when unsaved changes state changes
  useEffect(() => {
    onUnsavedChangesChange?.(unsavedChanges.size > 0);
  }, [unsavedChanges, onUnsavedChangesChange]);

  // Compute visible columns
  const visibleColumns = columns.filter((col) => {
    // Always show these special columns if defined
    if (col.key === 'checkbox' || col.key === 'actions' || col.key === 'expand') {
      return true;
    }
    return true; // For now, show all data columns
  });

  // Helper: Get alignment class
  const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center justify-center';
    if (align === 'right') return 'text-right justify-end';
    return 'text-left';
  };

  // Helper: Check if all rows are selected
  const isAllSelected = data.length > 0 && selectedRows.size === data.length;

  // Handler: Select all toggle
  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(data.map((item) => item.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  // Handler: Individual row selection
  const handleRowSelect = (rowId: string, checked: boolean) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  };

  // Handler: Toggle row expansion
  const toggleRowExpansion = (rowId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Get selected items for bulk actions
  const selectedItemsData = data.filter((item) => selectedRows.has(item.id));

  // Determine if table has bulk actions
  const hasBulkActions = bulkActions && bulkActions.length > 0;
  const showBulkActions = hasBulkActions && selectedRows.size > 0;

  // Quick-add state
  const [isQuickAdding, setIsQuickAdding] = useState(false);

  // Bulk action confirmation modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<EditableDataTableBulkAction<T> | null>(null);

  // Quick-add handler
  const handleQuickAdd = async () => {
    if (!onQuickAdd) return;

    setIsQuickAdding(true);
    try {
      const newItemId = await onQuickAdd();

      // If onQuickAdd returns an item ID, automatically enter edit mode for that item
      if (newItemId && typeof newItemId === 'string') {
        // Wait a tick for React Query to update the data
        setTimeout(() => {
          enterEditMode(newItemId);
        }, 100);
      }
    } catch (error) {
      console.error('Quick add failed:', error);
    } finally {
      setIsQuickAdding(false);
    }
  };

  // Bulk action handler
  const handleBulkAction = (action: EditableDataTableBulkAction<T>) => {
    // Check for custom modal first (preferred)
    if (action.confirmModal) {
      setPendingBulkAction(action);
      setBulkModalOpen(true);
      return;
    }

    // Execute directly if no confirmation needed
    action.onClick(selectedItemsData);
  };

  // Edit mode handlers
  const enterEditMode = (rowId: string) => {
    if (!externalEditingRows) {
      setInternalEditingRows((prev) => {
        // If allowMultiEdit is false, clear other editing rows
        if (!allowMultiEdit) {
          // Auto-save other rows if needed (future enhancement)
          return new Set([rowId]);
        }
        const next = new Set(prev);
        next.add(rowId);
        return next;
      });
    }

    // Auto-expand row when entering edit mode (if expandable content exists)
    if (expandable) {
      setExpandedRows((prev) => {
        const next = new Set(prev);
        next.add(rowId);
        return next;
      });
    }
  };

  const exitEditMode = (rowId: string) => {
    if (!externalEditingRows) {
      setInternalEditingRows((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
    // Clear unsaved changes for this row
    setUnsavedChanges((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
    // Clear validation errors for this row
    setValidationErrors((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
  };

  // Change tracking handler
  const handleFieldChange = (rowId: string, fieldKey: keyof T, value: unknown) => {
    setUnsavedChanges((prev) => {
      const next = new Map(prev);
      const rowChanges = next.get(rowId) || {};
      next.set(rowId, { ...rowChanges, [fieldKey]: value });
      return next;
    });
  };

  // Validation handler
  const validateRow = (item: T, changes: Partial<T>): Record<string, string> => {
    const errors: Record<string, string> = {};
    const mergedItem = { ...item, ...changes };

    columns.forEach((column) => {
      if (column.key === 'checkbox' || column.key === 'actions' || column.key === 'expand') {
        return;
      }

      const fieldKey = column.key as keyof T;
      const value = mergedItem[fieldKey];

      // Check required
      if (column.required && (value === null || value === undefined || value === '')) {
        errors[String(fieldKey)] = `${column.header || String(fieldKey)} is required`;
      }

      // Run custom validator if provided
      if (column.validate) {
        const error = column.validate(value, mergedItem);
        if (error) {
          errors[String(fieldKey)] = error;
        }
      }
    });

    return errors;
  };

  // Save handler
  const handleSave = async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    const changes = unsavedChanges.get(rowId);

    if (!item) return;

    // If no changes, just exit edit mode
    if (!changes || Object.keys(changes).length === 0) {
      exitEditMode(rowId);
      return;
    }

    // Validate
    const errors = validateRow(item, changes);
    if (Object.keys(errors).length > 0) {
      setValidationErrors((prev) => new Map(prev).set(rowId, errors));
      return;
    }

    // Clear validation errors
    setValidationErrors((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });

    // Set saving state
    if (!externalSavingRows) {
      setInternalSavingRows((prev) => {
        const next = new Set(prev);
        next.add(rowId);
        return next;
      });
    }

    try {
      // Call save callback
      await onSave?.(item, changes);

      // Exit edit mode on success
      exitEditMode(rowId);
    } catch (error) {
      // Check if error contains validation errors for custom fields
      const validationError = error as Error & { validationErrors?: Record<string, string> };
      if (validationError.validationErrors) {
        // Validation error - expected user error, not a system error
        // Merge validation errors with existing errors (prefix custom field keys with 'custom_fields.')
        const customFieldErrors: Record<string, string> = {};
        for (const [fieldId, errorMsg] of Object.entries(validationError.validationErrors)) {
          customFieldErrors[`custom_fields.${fieldId}`] = errorMsg;
        }
        setValidationErrors((prev) => new Map(prev).set(rowId, customFieldErrors));
      } else {
        // System error - log to console
        console.error('Save failed:', error);
      }
      // Keep in edit mode on error - let parent handle error toast
    } finally {
      // Clear saving state
      if (!externalSavingRows) {
        setInternalSavingRows((prev) => {
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        });
      }
    }
  };

  // Cancel handler
  const handleCancel = (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    exitEditMode(rowId);
    if (item && onCancel) {
      onCancel(item);
    }
  };

  // Delete handler
  const handleDelete = async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    if (!item) return;

    // For now, call delete directly - confirmation modal will be added later
    try {
      await onDelete?.(item);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <>
      {/* Toolbar */}
      {(showBulkActions || onQuickAdd) && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {showBulkActions ? (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedRows.size} selected
              </span>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {/* Quick Add Button */}
              {onQuickAdd && (
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={isQuickAdding}
                  className="btn bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-60"
                >
                  {isQuickAdding ? 'Adding...' : '+ Add Row'}
                </button>
              )}
              {bulkActions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => handleBulkAction(action)}
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
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl relative">
        <header className="px-5 py-4">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            {title}{' '}
            <span className="text-gray-400 dark:text-gray-500 font-medium">{data.length}</span>
          </h2>
        </header>
        <div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60 sticky top-0 z-10">
                <tr>
                  {expandable && (
                    <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px">
                      <span className="sr-only">Expand</span>
                    </th>
                  )}
                  {visibleColumns.map((column) => {
                    if (column.key === 'checkbox') {
                      return (
                        <th
                          key="checkbox"
                          className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap w-px"
                        >
                          <div className="flex items-center">
                            <label className="inline-flex">
                              <span className="sr-only">Select all</span>
                              <input
                                className="form-checkbox"
                                type="checkbox"
                                onChange={(e) => handleSelectAllChange(e.target.checked)}
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
                        style={column.width ? { width: column.width } : undefined}
                      >
                        <div className={`font-semibold ${alignClass}`}>{column.header}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {isLoading ? (
                  // Loading skeleton
                  Array.from({ length: 5 }, (_, idx) => idx).map((idx) => (
                    <tr key={`skeleton-${idx}`}>
                      {expandable && (
                        <td className="px-2 first:pl-5 last:pr-5 py-3">
                          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      )}
                      {visibleColumns.map((col) => (
                        <td
                          key={`skeleton-col-${idx}-${String(col.key)}`}
                          className="px-2 first:pl-5 last:pr-5 py-3"
                        >
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.length === 0 ? (
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
                    const isSelected = selectedRows.has(item.id);
                    const isEditing = editingRows.has(item.id);
                    const isSaving = savingRows.has(item.id);
                    const rowChanges = unsavedChanges.get(item.id) || {};
                    const rowErrors = validationErrors.get(item.id) || {};
                    const hasUnsaved = unsavedChanges.has(item.id) && Object.keys(rowChanges).length > 0;

                    return (
                      <EditableTableRow
                        key={item.id}
                        item={item}
                        columns={visibleColumns}
                        isEditing={isEditing}
                        isSaving={isSaving}
                        hasUnsavedChanges={hasUnsaved}
                        isExpanded={isExpanded}
                        isSelected={isSelected}
                        changes={rowChanges}
                        errors={rowErrors}
                        onEdit={() => enterEditMode(item.id)}
                        onSave={() => handleSave(item.id)}
                        onCancel={() => handleCancel(item.id)}
                        onDelete={() => handleDelete(item.id)}
                        onChange={(key, value) => handleFieldChange(item.id, key, value)}
                        onToggleExpand={() => toggleRowExpansion(item.id)}
                        onToggleSelect={(checked) => handleRowSelect(item.id, checked)}
                        {...(onNavigate ? { onNavigate: () => onNavigate(item) } : {})}
                        expandableContent={
                          expandable?.render(
                            item,
                            isEditing,
                            rowChanges,
                            (key, value) => handleFieldChange(item.id, key, value),
                            rowErrors
                          )
                        }
                        hasExpandable={Boolean(expandable)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {paginationConfig && data.length > 0 && !isLoading && (
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
      {pendingBulkAction?.confirmModal && (
        <DeleteConfirmationModal
          isOpen={bulkModalOpen}
          setIsOpen={setBulkModalOpen}
          title={pendingBulkAction.confirmModal.title}
          itemName={`${selectedRows.size} item${selectedRows.size !== 1 ? 's' : ''}`}
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
