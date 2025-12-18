'use client';

import type { ReactNode } from 'react';
import { useReducer, useEffect, useMemo, useCallback } from 'react';
import EditableTableRow from './editable-table-row';
import DeleteConfirmationModal from './delete-confirmation-modal';
import { usePagination } from '@/lib/hooks/use-pagination';
import { useTableSort } from '@/lib/hooks/use-table-sort';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { BaseDataTable } from './data-table/base-data-table';
import { DataTablePagination } from './data-table/data-table-pagination';
import { DataTableToolbar } from './data-table/data-table-toolbar';
import type { DataTableBulkAction, DataTableColumn } from './data-table/types';
import { DEFAULT_EDITABLE_ITEMS_PER_PAGE } from './data-table/utils';
import { useBulkActionModal } from './data-table/use-bulk-action-modal';

// ============================================================================
// Table State Reducer
// ============================================================================

interface TableState<T> {
  editingRows: Set<string>;
  savingRows: Set<string>;
  unsavedChanges: Map<string, Partial<T>>;
  validationErrors: Map<string, Record<string, string>>;
  expandedRows: Set<string>;
  selectedRows: Set<string>;
  isQuickAdding: boolean;
  deleteModal: {
    isOpen: boolean;
    item: T | null;
  };
}

type TableAction<T> =
  | { type: 'ENTER_EDIT_MODE'; rowId: string; autoExpand: boolean; singleEdit: boolean }
  | { type: 'EXIT_EDIT_MODE'; rowId: string }
  | { type: 'START_SAVING'; rowId: string }
  | { type: 'STOP_SAVING'; rowId: string }
  | { type: 'UPDATE_FIELD'; rowId: string; key: string; value: unknown }
  | { type: 'SET_VALIDATION_ERRORS'; rowId: string; errors: Record<string, string> }
  | { type: 'TOGGLE_EXPANSION'; rowId: string }
  | { type: 'SELECT_ROW'; rowId: string }
  | { type: 'DESELECT_ROW'; rowId: string }
  | { type: 'SELECT_ALL'; rowIds: string[] }
  | { type: 'DESELECT_ALL' }
  | { type: 'SET_QUICK_ADDING'; isQuickAdding: boolean }
  | { type: 'OPEN_DELETE_MODAL'; item: T }
  | { type: 'CLOSE_DELETE_MODAL' };

function createInitialState<T>(): TableState<T> {
  return {
    editingRows: new Set(),
    savingRows: new Set(),
    unsavedChanges: new Map(),
    validationErrors: new Map(),
    expandedRows: new Set(),
    selectedRows: new Set(),
    isQuickAdding: false,
    deleteModal: { isOpen: false, item: null },
  };
}

function tableReducer<T>(state: TableState<T>, action: TableAction<T>): TableState<T> {
  switch (action.type) {
    case 'ENTER_EDIT_MODE': {
      const newEditingRows = action.singleEdit
        ? new Set([action.rowId])
        : new Set(state.editingRows).add(action.rowId);
      const newExpandedRows = action.autoExpand
        ? new Set(state.expandedRows).add(action.rowId)
        : state.expandedRows;
      return { ...state, editingRows: newEditingRows, expandedRows: newExpandedRows };
    }
    case 'EXIT_EDIT_MODE': {
      const newEditingRows = new Set(state.editingRows);
      newEditingRows.delete(action.rowId);
      const newUnsavedChanges = new Map(state.unsavedChanges);
      newUnsavedChanges.delete(action.rowId);
      const newValidationErrors = new Map(state.validationErrors);
      newValidationErrors.delete(action.rowId);
      return {
        ...state,
        editingRows: newEditingRows,
        unsavedChanges: newUnsavedChanges,
        validationErrors: newValidationErrors,
      };
    }
    case 'START_SAVING': {
      const newSavingRows = new Set(state.savingRows).add(action.rowId);
      return { ...state, savingRows: newSavingRows };
    }
    case 'STOP_SAVING': {
      const newSavingRows = new Set(state.savingRows);
      newSavingRows.delete(action.rowId);
      return { ...state, savingRows: newSavingRows };
    }
    case 'UPDATE_FIELD': {
      const newUnsavedChanges = new Map(state.unsavedChanges);
      const rowChanges = newUnsavedChanges.get(action.rowId) || {};
      newUnsavedChanges.set(action.rowId, { ...rowChanges, [action.key]: action.value });
      return { ...state, unsavedChanges: newUnsavedChanges };
    }
    case 'SET_VALIDATION_ERRORS': {
      const newValidationErrors = new Map(state.validationErrors);
      newValidationErrors.set(action.rowId, action.errors);
      return { ...state, validationErrors: newValidationErrors };
    }
    case 'TOGGLE_EXPANSION': {
      const newExpandedRows = new Set(state.expandedRows);
      if (newExpandedRows.has(action.rowId)) {
        newExpandedRows.delete(action.rowId);
      } else {
        newExpandedRows.add(action.rowId);
      }
      return { ...state, expandedRows: newExpandedRows };
    }
    case 'SELECT_ROW': {
      const newSelectedRows = new Set(state.selectedRows).add(action.rowId);
      return { ...state, selectedRows: newSelectedRows };
    }
    case 'DESELECT_ROW': {
      const newSelectedRows = new Set(state.selectedRows);
      newSelectedRows.delete(action.rowId);
      return { ...state, selectedRows: newSelectedRows };
    }
    case 'SELECT_ALL': {
      return { ...state, selectedRows: new Set(action.rowIds) };
    }
    case 'DESELECT_ALL': {
      return { ...state, selectedRows: new Set() };
    }
    case 'SET_QUICK_ADDING': {
      return { ...state, isQuickAdding: action.isQuickAdding };
    }
    case 'OPEN_DELETE_MODAL': {
      return { ...state, deleteModal: { isOpen: true, item: action.item } };
    }
    case 'CLOSE_DELETE_MODAL': {
      return { ...state, deleteModal: { isOpen: false, item: null } };
    }
    default:
      return state;
  }
}

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
  sortable?: boolean; // Enable column sorting (default: false)
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
  sortable = false,
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
  // Consolidated table state management
  const [state, dispatch] = useReducer(
    tableReducer<T>,
    undefined,
    createInitialState<T>
  );

  // Sorting (applied before pagination)
  const { sortedData, handleSort, getSortIcon, sortConfig } = useTableSort(data);

  // Map sort direction for ARIA accessibility
  const ariaSortDirection = sortConfig?.direction === 'asc'
    ? 'ascending' as const
    : sortConfig?.direction === 'desc'
      ? 'descending' as const
      : undefined;

  // Pagination (applied to sorted data)
  const pagination = usePagination(sortable ? sortedData : data, {
    itemsPerPage: paginationConfig?.itemsPerPage || DEFAULT_EDITABLE_ITEMS_PER_PAGE,
  });

  // Use paginated data if pagination is enabled, otherwise use sorted/unsorted data
  const displayData = paginationConfig
    ? pagination.currentItems
    : (sortable ? sortedData : data);

  // Use external state if provided, otherwise use internal state
  const editingRows = externalEditingRows ?? state.editingRows;
  const savingRows = externalSavingRows ?? state.savingRows;
  const { unsavedChanges, validationErrors, expandedRows, selectedRows } = state;

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
  const handleSelectAllChange = useCallback((checked: boolean) => {
    if (checked) {
      dispatch({ type: 'SELECT_ALL', rowIds: data.map((item) => item.id) });
    } else {
      dispatch({ type: 'DESELECT_ALL' });
    }
  }, [data]);

  // Handler: Individual row selection
  const handleRowSelect = useCallback((rowId: string, checked: boolean) => {
    dispatch({ type: checked ? 'SELECT_ROW' : 'DESELECT_ROW', rowId });
  }, []);

  // Handler: Toggle row expansion
  const toggleRowExpansion = useCallback((rowId: string) => {
    dispatch({ type: 'TOGGLE_EXPANSION', rowId });
  }, []);

  // Get selected items for bulk actions (memoized to prevent recalculation on every render)
  const selectedItemsData = useMemo(
    () => data.filter((item) => selectedRows.has(item.id)),
    [data, selectedRows]
  );

  // State from reducer for quick-add and delete modal
  const { isQuickAdding, deleteModal } = state;

  // Bulk action confirmation modal hook
  const { handleBulkAction, BulkActionModal } = useBulkActionModal({
    selectedItems: selectedItemsData,
    selectedCount: selectedRows.size,
  });

  // Quick-add handler
  const handleQuickAdd = async () => {
    if (!onQuickAdd) return;

    dispatch({ type: 'SET_QUICK_ADDING', isQuickAdding: true });
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
      dispatch({ type: 'SET_QUICK_ADDING', isQuickAdding: false });
    }
  };

  /**
   * Enters edit mode for a row. If allowMultiEdit is false, exits edit mode
   * for all other rows first. Auto-expands the row if expandable content exists.
   * @param rowId - The ID of the row to edit
   */
  const enterEditMode = useCallback((rowId: string) => {
    if (!externalEditingRows) {
      dispatch({
        type: 'ENTER_EDIT_MODE',
        rowId,
        autoExpand: !!expandable,
        singleEdit: !allowMultiEdit,
      });
    }
  }, [externalEditingRows, allowMultiEdit, expandable]);

  /**
   * Exits edit mode for a row. Clears any unsaved changes and validation errors.
   * @param rowId - The ID of the row to exit edit mode
   */
  const exitEditMode = useCallback((rowId: string) => {
    if (!externalEditingRows) {
      dispatch({ type: 'EXIT_EDIT_MODE', rowId });
    }
  }, [externalEditingRows]);

  /**
   * Tracks field changes for a row, storing them in unsavedChanges state.
   * @param rowId - The ID of the row being edited
   * @param fieldKey - The field/column key being changed
   * @param value - The new value for the field
   */
  const handleFieldChange = useCallback((rowId: string, fieldKey: keyof T, value: unknown) => {
    dispatch({ type: 'UPDATE_FIELD', rowId, key: String(fieldKey), value });
  }, []);

  /**
   * Validates a row by checking required fields and running custom validators.
   * Merges original item data with pending changes before validation.
   * @param item - The original item data
   * @param changes - Pending changes to be validated
   * @returns Record of field keys to error messages (empty if valid)
   */
  const validateRow = useCallback((item: T, changes: Partial<T>): Record<string, string> => {
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
  }, [columns]);

  /**
   * Handles saving a row's changes. Validates the data, calls onSave callback,
   * and manages saving/error states. Keeps row in edit mode if validation fails
   * or save throws an error.
   * @param rowId - The ID of the row to save
   */
  const handleSave = useCallback(async (rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    const changes = unsavedChanges.get(rowId) || {};

    if (!item) return;

    // Note: We don't exit early if changes is empty, because onSave callback
    // may need to run validation (e.g. for required fields on new items)

    // Validate
    const errors = validateRow(item, changes);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'SET_VALIDATION_ERRORS', rowId, errors });
      return;
    }

    // Set saving state
    if (!externalSavingRows) {
      dispatch({ type: 'START_SAVING', rowId });
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
        dispatch({ type: 'SET_VALIDATION_ERRORS', rowId, errors: customFieldErrors });
      } else {
        // System error - log to client error handler
        clientErrorLog('Save failed', error);
      }
      // Keep in edit mode on error - let parent handle error toast
    } finally {
      // Clear saving state
      if (!externalSavingRows) {
        dispatch({ type: 'STOP_SAVING', rowId });
      }
    }
  }, [data, unsavedChanges, validateRow, externalSavingRows, onSave, exitEditMode]);

  /**
   * Handles canceling row edits. Exits edit mode and discards unsaved changes.
   * Calls onCancel callback if provided.
   * @param rowId - The ID of the row to cancel
   */
  const handleCancel = useCallback((rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    exitEditMode(rowId);
    if (item && onCancel) {
      onCancel(item);
    }
  }, [data, exitEditMode, onCancel]);

  /**
   * Initiates row deletion by showing confirmation modal.
   * @param rowId - The ID of the row to delete
   */
  const handleDelete = useCallback((rowId: string) => {
    const item = data.find((d) => d.id === rowId);
    if (!item) return;

    dispatch({ type: 'OPEN_DELETE_MODAL', item });
  }, [data]);

  /**
   * Confirms and executes the pending delete action.
   */
  const confirmDelete = useCallback(async () => {
    if (!deleteModal.item) return;

    try {
      await onDelete?.(deleteModal.item);
    } catch (error) {
      clientErrorLog('Delete failed', error);
    } finally {
      dispatch({ type: 'CLOSE_DELETE_MODAL' });
    }
  }, [deleteModal.item, onDelete]);

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
        sortable={sortable}
        onSort={handleSort}
        getSortIcon={getSortIcon}
        currentSortKey={sortConfig?.key}
        currentSortDirection={ariaSortDirection}
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
          pagination={pagination}
          isLoading={isLoading}
        />
      )}

      {BulkActionModal}

      {/* Delete confirmation modal */}
      {deleteModal.item && (
        <DeleteConfirmationModal
          isOpen={deleteModal.isOpen}
          setIsOpen={(open) => {
            if (!open) {
              dispatch({ type: 'CLOSE_DELETE_MODAL' });
            }
          }}
          title="Delete Item"
          itemName={
            'subject' in deleteModal.item
              ? String(deleteModal.item.subject)
              : 'name' in deleteModal.item
                ? String(deleteModal.item.name)
                : deleteModal.item.id
          }
          message="This action cannot be undone. The item and all associated data will be permanently removed."
          confirmButtonText="Delete"
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
