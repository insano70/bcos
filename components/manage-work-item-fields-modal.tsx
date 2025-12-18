'use client';

import { useCallback, useMemo, useState } from 'react';
import DeleteConfirmationModal from '@/components/delete-confirmation-modal';
import { ErrorDisplay } from '@/components/error-display';
import WorkItemFieldModal from '@/components/work-item-field-modal';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { useDeleteWorkItemField, useUpdateWorkItemField, useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import type { WorkItemField } from '@/lib/types/work-item-fields';
import { clientErrorLog } from '@/lib/utils/debug-client';
import { Button } from '@/components/ui/button';

interface ManageWorkItemFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workItemTypeId: string;
  workItemTypeName: string;
}

export default function ManageWorkItemFieldsModal({
  isOpen,
  onClose,
  workItemTypeId,
  workItemTypeName,
}: ManageWorkItemFieldsModalProps) {
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<WorkItemField | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<WorkItemField | null>(null);

  const {
    data: fields,
    isLoading,
    error,
    refetch,
  } = useWorkItemFields({
    work_item_type_id: workItemTypeId,
  });

  const deleteField = useDeleteWorkItemField();
  const updateField = useUpdateWorkItemField();

  const handleDeleteClick = useCallback((field: WorkItemField) => {
    setFieldToDelete(field);
    setDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!fieldToDelete) return;
    
    try {
      await deleteField.mutateAsync(fieldToDelete.work_item_field_id);
      refetch();
      setFieldToDelete(null);
    } catch (error) {
      clientErrorLog('Failed to delete field:', error);
    }
  }, [fieldToDelete, deleteField, refetch]);

  const handleEditField = useCallback((field: WorkItemField) => {
    setEditingField(field);
  }, []);

  const sortedFields = useMemo(() => {
    if (!fields) return [];
    return [...fields].sort((a, b) => a.display_order - b.display_order);
  }, [fields]);

  const handleMoveUp = useCallback(async (field: WorkItemField) => {
    const currentIndex = sortedFields.findIndex(f => f.work_item_field_id === field.work_item_field_id);
    if (currentIndex <= 0) return;

    const previousField = sortedFields[currentIndex - 1];
    if (!previousField) return;

    try {
      // Swap display_order values
      await Promise.all([
        updateField.mutateAsync({
          fieldId: field.work_item_field_id,
          data: { display_order: previousField.display_order },
        }),
        updateField.mutateAsync({
          fieldId: previousField.work_item_field_id,
          data: { display_order: field.display_order },
        }),
      ]);
      refetch();
    } catch (error) {
      clientErrorLog('Failed to reorder field:', error);
    }
  }, [sortedFields, updateField, refetch]);

  const handleMoveDown = useCallback(async (field: WorkItemField) => {
    const currentIndex = sortedFields.findIndex(f => f.work_item_field_id === field.work_item_field_id);
    if (currentIndex < 0 || currentIndex >= sortedFields.length - 1) return;

    const nextField = sortedFields[currentIndex + 1];
    if (!nextField) return;

    try {
      // Swap display_order values
      await Promise.all([
        updateField.mutateAsync({
          fieldId: field.work_item_field_id,
          data: { display_order: nextField.display_order },
        }),
        updateField.mutateAsync({
          fieldId: nextField.work_item_field_id,
          data: { display_order: field.display_order },
        }),
      ]);
      refetch();
    } catch (error) {
      clientErrorLog('Failed to reorder field:', error);
    }
  }, [sortedFields, updateField, refetch]);

  const getFieldTypeLabel = (fieldType: string) => {
    const labels: Record<string, string> = {
      text: 'Text',
      number: 'Number',
      date: 'Date',
      datetime: 'Date & Time',
      dropdown: 'Dropdown',
      checkbox: 'Checkbox',
      user_picker: 'User Picker',
    };
    return labels[fieldType] || fieldType;
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Manage Custom Fields
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Configure custom fields for {workItemTypeName}
            </p>
          </div>

          {/* Add Field Button */}
          <div className="mb-4">
            <Button
              variant="primary"
              onClick={() => setIsAddFieldOpen(true)}
              leftIcon={
                <svg
                  className="fill-current shrink-0"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                >
                  <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
                </svg>
              }
            >
              Add Custom Field
            </Button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-8">
              <Spinner size="md" />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading fields...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <ErrorDisplay
              variant="alert"
              error={error.message}
              onRetry={() => refetch()}
            />
          )}

          {/* Empty State */}
          {!isLoading && !error && sortedFields.length === 0 && (
            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                No custom fields
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by adding a custom field.
              </p>
            </div>
          )}

          {/* Fields List */}
          {!isLoading && !error && sortedFields.length > 0 && (
            <div className="space-y-2">
              {sortedFields.map((field, index) => (
                <div
                  key={field.work_item_field_id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">
                        {field.field_label}
                      </h4>
                      {field.is_required_on_creation && (
                        <Badge color="red" size="sm" shape="rounded">Required on Creation</Badge>
                      )}
                      {field.is_required_to_complete && (
                        <Badge color="orange" size="sm" shape="rounded">Required to Complete</Badge>
                      )}
                      <Badge color="gray" size="sm" shape="rounded">
                        {getFieldTypeLabel(field.field_type)}
                      </Badge>
                    </div>
                    {field.field_description && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {field.field_description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Field name: {field.field_name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {/* Move Up */}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleMoveUp(field)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="p-1"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="M8 2l6 6h-4v6H6V8H2z" />
                      </svg>
                    </Button>

                    {/* Move Down */}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleMoveDown(field)}
                      disabled={index === sortedFields.length - 1}
                      aria-label="Move down"
                      className="p-1"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="M8 14l-6-6h4V2h4v6h4z" />
                      </svg>
                    </Button>

                    {/* Edit */}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleEditField(field)}
                      aria-label="Edit field"
                      className="p-1"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
                      </svg>
                    </Button>

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDeleteClick(field)}
                      aria-label="Delete field"
                      className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                        <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Field Modal */}
      <WorkItemFieldModal
        mode="create"
        isOpen={isAddFieldOpen}
        onClose={() => setIsAddFieldOpen(false)}
        onSuccess={() => {
          setIsAddFieldOpen(false);
          refetch();
        }}
        workItemTypeId={workItemTypeId}
      />

      {/* Edit Field Modal */}
      {editingField && (
        <WorkItemFieldModal
          mode="edit"
          isOpen={true}
          onClose={() => setEditingField(null)}
          onSuccess={() => {
            setEditingField(null);
            refetch();
          }}
          workItemTypeId={workItemTypeId}
          field={editingField}
          allFields={sortedFields}
        />
      )}
      
      {/* Delete Confirmation Modal */}
      {fieldToDelete && (
        <DeleteConfirmationModal
          isOpen={deleteModalOpen}
          setIsOpen={setDeleteModalOpen}
          title="Delete Custom Field"
          itemName={fieldToDelete.field_name}
          message="This action cannot be undone. All data for this field will be lost."
          confirmButtonText="Delete Field"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
