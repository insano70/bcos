'use client';

import { type ReactNode, memo, useEffect, useRef } from 'react';
import type { EditableColumn } from './editable-data-table';
import { getDensityClasses, type DensityMode } from './data-table/utils';
import { Button } from '@/components/ui/button';

/** Configurable labels for i18n support */
export interface EditableTableRowLabels {
  edit?: string;
  save?: string;
  saving?: string;
  cancel?: string;
  delete?: string;
  viewDetails?: string;
  saveHint?: string;
  cancelHint?: string;
}

/** Default English labels */
const DEFAULT_LABELS: Required<EditableTableRowLabels> = {
  edit: 'Edit',
  save: 'Save',
  saving: 'Saving...',
  cancel: 'Cancel',
  delete: 'Delete',
  viewDetails: 'View details',
  saveHint: 'Save changes (Ctrl+Enter)',
  cancelHint: 'Discard changes (Escape)',
};

export interface EditableTableRowProps<T extends { id: string }> {
  item: T;
  columns: EditableColumn<T>[];
  isEditing: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  changes: Partial<T>;
  errors: Record<string, string>;

  // Callbacks
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onChange: (key: keyof T, value: unknown) => void;
  onToggleExpand?: () => void;
  onToggleSelect: (checked: boolean) => void;
  onNavigate?: () => void;

  // Expansion content
  expandableContent?: ReactNode;

  // Show expandable toggle
  hasExpandable: boolean;

  // Density mode for row padding
  density?: DensityMode;

  // Configurable labels for i18n
  labels?: EditableTableRowLabels;
}

function EditableTableRowComponent<T extends { id: string }>({
  item,
  columns,
  isEditing,
  isSaving,
  hasUnsavedChanges,
  isExpanded,
  isSelected,
  changes,
  errors,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onChange,
  onToggleExpand,
  onToggleSelect,
  onNavigate,
  expandableContent,
  hasExpandable,
  density = 'normal',
  labels: customLabels,
}: EditableTableRowProps<T>) {
  // Merge custom labels with defaults
  const labels = { ...DEFAULT_LABELS, ...customLabels };

  // Ref for first editable input
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Get padding class based on density
  const paddingClass = getDensityClasses(density);

  // Auto-focus first editable input when entering edit mode
  useEffect(() => {
    if (isEditing && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isEditing]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;

    // Enter key (with Ctrl/Cmd) - Save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave();
      return;
    }

    // Escape key - Cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }

    // Tab key - Allow default behavior (move to next field)
  };
  // Helper: Get row className based on state
  const getRowClassName = () => {
    const baseClasses = 'border-b border-gray-100 dark:border-gray-700';

    if (isEditing) {
      return `${baseClasses} bg-blue-50 dark:bg-blue-900/10 border-l-4 border-l-blue-500`;
    }

    if (hasUnsavedChanges) {
      return `${baseClasses} border-l-4 border-l-orange-500`;
    }

    return baseClasses;
  };

  // Helper: Get current value for a field (changes override original)
  const getCurrentValue = (fieldKey: keyof T) => {
    if (changes && fieldKey in changes) {
      return changes[fieldKey];
    }
    return item[fieldKey];
  };

  // Helper: Find first editable column index
  const firstEditableColumnIndex = columns.findIndex(
    (col) => col.key !== 'checkbox' && col.key !== 'actions' && col.key !== 'expand' && col.editable !== false
  );

  return (
    <>
      <tr className={getRowClassName()} onKeyDown={handleKeyDown}>
        {/* Expand toggle */}
        {hasExpandable && (
          <td className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}>
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

        {/* Data and special columns */}
        {columns.map((column) => {
          // Checkbox column
          if (column.key === 'checkbox') {
            return (
              <td
                key="checkbox"
                className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}
              >
                <div className="flex items-center">
                  <label className="inline-flex">
                    <span className="sr-only">Select</span>
                    <input
                      className="form-checkbox"
                      type="checkbox"
                      onChange={(e) => onToggleSelect(e.target.checked)}
                      checked={isSelected}
                      disabled={isEditing}
                    />
                  </label>
                </div>
              </td>
            );
          }

          // Actions column
          if (column.key === 'actions') {
            return (
              <td
                key="actions"
                className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap w-px`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onSave}
                      disabled={isSaving}
                      loading={isSaving}
                      loadingText={labels.saving}
                      title={labels.saveHint}
                    >
                      {labels.save}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onCancel}
                      disabled={isSaving}
                      title={labels.cancelHint}
                    >
                      {labels.cancel}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onEdit}
                    >
                      {labels.edit}
                    </Button>
                    <Button
                      variant="danger-outline"
                      size="sm"
                      onClick={onDelete}
                    >
                      {labels.delete}
                    </Button>
                    {onNavigate && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onNavigate}
                        title={labels.viewDetails}
                      >
                        →
                      </Button>
                    )}
                  </div>
                )}
              </td>
            );
          }

          // Data columns
          const fieldKey = column.key as keyof T;
          const currentValue = getCurrentValue(fieldKey);
          const error = errors[String(fieldKey)];
          const columnIndex = columns.indexOf(column);
          const isFirstEditableColumn = columnIndex === firstEditableColumnIndex;

          return (
            <td
              key={String(column.key)}
              className={`px-2 first:pl-5 last:pr-5 ${paddingClass} whitespace-nowrap ${column.className || ''}`}
              style={column.width ? { width: column.width } : undefined}
            >
              {isEditing && column.editable !== false ? (
                // Edit mode
                <div>
                  {column.renderEdit ? (
                    column.renderEdit(item, currentValue, (val) => onChange(fieldKey, val), error)
                  ) : (
                    // Default edit input (text)
                    <input
                      ref={isFirstEditableColumn ? firstInputRef : undefined}
                      type="text"
                      value={String(currentValue ?? '')}
                      onChange={(e) => onChange(fieldKey, e.target.value)}
                      className={`form-input w-full ${error ? 'border-red-500' : ''}`}
                    />
                  )}
                  {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
                </div>
              ) : (
                // Display mode
                column.render ? column.render(item) : String(currentValue ?? '')
              )}
            </td>
          );
        })}
      </tr>

      {/* Expanded row */}
      {hasExpandable && isExpanded && expandableContent && (
        <tr>
          <td
            colSpan={columns.length + 1}
            className="px-2 first:pl-5 last:pr-5 py-4 bg-gray-50 dark:bg-gray-900/10"
          >
            {expandableContent}
          </td>
        </tr>
      )}
    </>
  );
}

// Memoize to prevent whole-table re-renders when only one row changes
const EditableTableRow = memo(EditableTableRowComponent) as typeof EditableTableRowComponent;
export default EditableTableRow;
