'use client';

import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import EditableTableRow from './editable-table-row';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { usePagination } from '@/lib/hooks/use-pagination';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { BaseDataTable } from './data-table/base-data-table';
import { DataTablePagination } from './data-table/data-table-pagination';
import { DataTableToolbar } from './data-table/data-table-toolbar';
import type { DataTableBulkAction, DataTableColumn } from './data-table/types';
import { DEFAULT_EDITABLE_ITEMS_PER_PAGE } from './data-table/utils';

/**
 * Delay in milliseconds before entering edit mode after quick-add.
 * This allows React Query to update the data before attempting to edit the new row.
 * Without this delay, the row may not exist in the data yet.
 */
const QUICK_ADD_EDIT_DELAY_MS = 100;

// Re-export types for backward compatibility
export type EditableColumn<T> = DataTableColumn<T>;
export type EditableDataTableBulkAction<T> = DataTableBulkAction<T>;

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
  /** @reserved Future feature - keyboard navigation partially implemented in row component */
  keyboardNavigation?: boolean; // Default: true

  // Row state overrides (for optimistic updates)
  editingRows?: Set<string>; // Row IDs in edit mode
  savingRows?: Set<string>; // Row IDs currently saving
  /** @reserved Future feature - external error state not yet integrated */
  errorRows?: Map<string, string>; // Row ID → error message
}

/**
 * Editable data table with inline edit/save/cancel functionality.
 *
 * ## Selection State Architecture
 * Uses **LOCAL selection state** via `useState`, scoped to this component instance.
 * This design choice enables:
 * - Multiple editable tables on the same page without selection conflicts
 * - Selection state tied to component lifecycle (resets on unmount)
 * - No interference with external components like DeleteButton
 *
 * **For read-only tables with global selection**, use `DataTableStandard` instead.
 *
 * ## ID Type Constraint
 * This component requires `id` to be `string` (not `string | number`).
 * This is intentional: edit state tracking uses string keys in Maps/Sets,
 * and database IDs are typically UUIDs (strings).
 *
 * @see DataTableStandard - For read-only tables with global selection
 * @see useItemSelection - Hook used by DataTableStandard for global selection
 */
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
    itemsPerPage: paginationConfig?.itemsPerPage || DEFAULT_EDITABLE_ITEMS_PER_PAGE,
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

  // All columns are visible (column visibility feature not implemented for editable tables)
  const visibleColumns = columns;

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
        setTimeout(() => {
          enterEditMode(newItemId);
        }, QUICK_ADD_EDIT_DELAY_MS);
      }
    } catch (error) {
      clientErrorLog('Quick add failed', error);
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

  /**
   * Enters edit mode for a row. If allowMultiEdit is false, exits edit mode
   * for all other rows first. Auto-expands the row if expandable content exists.
   * @param rowId - The ID of the row to edit
   */
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

  /**
   * Exits edit mode for a row. Clears any unsaved changes and validation errors.
   * @param rowId - The ID of the row to exit edit mode
   */
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

  /**
   * Tracks field changes for a row, storing them in unsavedChanges state.
   * @param rowId - The ID of the row being edited
   * @param fieldKey - The field/column key being changed
   * @param value - The new value for the field
   */
  const handleFieldChange = (rowId: string, fieldKey: keyof T, value: unknown) => {
    setUnsavedChanges((prev) => {
      const next = new Map(prev);
      const rowChanges = next.get(rowId) || {};
      next.set(rowId, { ...rowChanges, [fieldKey]: value });
      return next;
    });
  };

  /**
   * Validates a row by checking required fields and running custom validators.
   * Merges original item data with pending changes before validation.
   * @param item - The original item data
   * @param changes - Pending changes to be validated
   * @returns Record of field keys to error messages (empty if valid)
   */
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

  /**
   * Handles saving a row's changes. Validates the data, calls onSave callback,
   * and manages saving/error states. Keeps row in edit mode if validation fails
   * or save throws an error.
   * @param rowId - The ID of the row to save
   */
  const handleSave = async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    const changes = unsavedChanges.get(rowId) || {};

    if (!item) return;

    // Note: We don't exit early if changes is empty, because onSave callback
    // may need to run validation (e.g. for required fields on new items)

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
        // System error - log to client error handler
        clientErrorLog('Save failed', error);
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

  /**
   * Handles canceling row edits. Exits edit mode and discards unsaved changes.
   * Calls onCancel callback if provided.
   * @param rowId - The ID of the row to cancel
   */
  const handleCancel = async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    exitEditMode(rowId);
    if (item && onCancel) {
      onCancel(item);
    }
  };

  /**
   * Handles deleting a row. Calls onDelete callback if provided.
   * Note: Confirmation should be handled by the parent component.
   * @param rowId - The ID of the row to delete
   */
  const handleDelete = async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    if (!item) return;

    // For now, call delete directly - confirmation modal will be added later
    try {
      await onDelete?.(item);
    } catch (error) {
      clientErrorLog('Delete failed', error);
    }
  };

  return (
    <>
      <DataTableToolbar
        onQuickAdd={onQuickAdd ? handleQuickAdd : undefined}
        isQuickAdding={isQuickAdding}
        bulkActions={bulkActions}
        selectedItemsCount={selectedRows.size}
        onBulkAction={handleBulkAction}
      />

      <BaseDataTable
        title={title}
        data={displayData}
        columns={visibleColumns}
        isLoading={isLoading}
        emptyState={emptyState}
        selectable={true} // Always selectable in editable table for now
        selectionMode="multi"
        isAllSelected={isAllSelected}
        onSelectAll={handleSelectAllChange}
        expandable={!!expandable}
      >
        {displayData.map((item) => {
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
        })}
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

      {pendingBulkAction?.confirmModal && (() => {
        // Get first item for dynamic modal content (only used when function callbacks need it)
        const firstItem = selectedItemsData[0];
        return (
          <DeleteConfirmationModal
            isOpen={bulkModalOpen}
            setIsOpen={setBulkModalOpen}
            title={
              typeof pendingBulkAction.confirmModal.title === 'function' && firstItem
                ? pendingBulkAction.confirmModal.title(firstItem)
                : typeof pendingBulkAction.confirmModal.title === 'string'
                  ? pendingBulkAction.confirmModal.title
                  : 'Confirm Action'
            }
            itemName={`${selectedRows.size} item${selectedRows.size !== 1 ? 's' : ''}`}
            message={
              typeof pendingBulkAction.confirmModal.message === 'function' && firstItem
                ? pendingBulkAction.confirmModal.message(firstItem)
                : typeof pendingBulkAction.confirmModal.message === 'string'
                  ? pendingBulkAction.confirmModal.message
                  : 'Are you sure you want to proceed?'
            }
            confirmButtonText={
              typeof pendingBulkAction.confirmModal.confirmText === 'function' && firstItem
                ? pendingBulkAction.confirmModal.confirmText(firstItem)
                : typeof pendingBulkAction.confirmModal.confirmText === 'string'
                  ? pendingBulkAction.confirmModal.confirmText
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
