'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import DataTable, {
  type DataTableColumn,
  type DataTableDropdownAction,
} from '@/components/data-table-standard';
import WorkItemFieldModal from '@/components/work-item-field-modal';
import { useDeleteWorkItemField, useWorkItemFields } from '@/lib/hooks/use-work-item-fields';
import type { WorkItemField } from '@/lib/types/work-item-fields';

interface WorkItemFieldConfigProps {
  workItemTypeId: string;
  workItemTypeName: string;
}

export default function WorkItemFieldConfig({
  workItemTypeId,
  workItemTypeName,
}: WorkItemFieldConfigProps) {
  const {
    data: fields,
    isLoading,
    error,
    refetch,
  } = useWorkItemFields({ work_item_type_id: workItemTypeId });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<WorkItemField | null>(null);

  const deleteFieldMutation = useDeleteWorkItemField();

  // Table columns
  const columns: DataTableColumn<WorkItemField>[] = useMemo(
    () => [
      {
        key: 'field_label',
        header: 'Field Label',
        sortable: true,
        render: (item) => (
          <div className="font-medium text-gray-800 dark:text-gray-100">{item.field_label}</div>
        ),
      },
      {
        key: 'field_name',
        header: 'Field Name',
        sortable: true,
        render: (item) => (
          <div className="font-mono text-sm text-gray-600 dark:text-gray-400">
            {item.field_name}
          </div>
        ),
      },
      {
        key: 'field_type',
        header: 'Type',
        sortable: true,
        align: 'center',
        render: (item) => {
          const typeColors: Record<string, string> = {
            text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            number: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            date: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            datetime: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            dropdown: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
            checkbox: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
            user_picker: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
            attachment: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
          };
          return (
            <div className="text-center">
              <span
                className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full ${typeColors[item.field_type] || 'bg-gray-100 text-gray-700'}`}
              >
                {item.field_type.replace('_', ' ')}
              </span>
            </div>
          );
        },
      },
      {
        key: 'is_required_on_creation',
        header: 'Requirements',
        sortable: false,
        align: 'center',
        render: (item) => (
          <div className="text-center space-x-1">
            {item.is_required_on_creation && (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                On Creation
              </span>
            )}
            {item.is_required_to_complete && (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                To Complete
              </span>
            )}
            {!item.is_required_on_creation && !item.is_required_to_complete && (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                Optional
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'is_visible',
        header: 'Visible',
        sortable: true,
        align: 'center',
        render: (item) => (
          <div className="text-center">
            {item.is_visible ? (
              <svg
                className="w-5 h-5 text-green-500 mx-auto"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-gray-400 mx-auto"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        ),
      },
      {
        key: 'display_order',
        header: 'Order',
        sortable: true,
        align: 'center',
        render: (item) => (
          <div className="text-center text-gray-600 dark:text-gray-400">{item.display_order}</div>
        ),
      },
      { key: 'actions' },
    ],
    []
  );

  // Dropdown actions
  const getDropdownActions = useCallback(
    (_field: WorkItemField): DataTableDropdownAction<WorkItemField>[] => [
      {
        label: 'Edit',
        icon: (
          <svg
            className="w-4 h-4 fill-current text-gray-400 dark:text-gray-500 shrink-0"
            viewBox="0 0 16 16"
          >
            <path d="m13.7 2.3-1-1c-.4-.4-1-.4-1.4 0l-10 10c-.2.2-.3.4-.3.7v4c0 .6.4 1 1 1h4c.3 0 .5-.1.7-.3l10-10c.4-.4.4-1 0-1.4zM10.5 6.5L9 5l.5-.5L11 6l-.5.5zM2 14v-3l6-6 3 3-6 6H2z" />
          </svg>
        ),
        onClick: (field) => {
          setSelectedField(field);
          setIsEditModalOpen(true);
        },
      },
      {
        label: 'Delete',
        icon: (
          <svg className="w-4 h-4 fill-current text-red-400 shrink-0" viewBox="0 0 16 16">
            <path d="M5 7h6v6H5V7zm6-3.5V2h-1V.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V2H5v1.5H4V4h8v-.5H11zM7 2V1h2v1H7zM6 5v6h1V5H6zm3 0v6h1V5H9z" />
          </svg>
        ),
        onClick: async (field) => {
          await deleteFieldMutation.mutateAsync(field.work_item_field_id);
          refetch();
        },
        variant: 'danger',
        confirm: (field) =>
          `Are you sure you want to delete "${field.field_label}"? This will affect all work items of this type.`,
      },
    ],
    [deleteFieldMutation, refetch]
  );

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <p className="text-red-600 dark:text-red-400">
          Error loading custom fields: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            Custom Fields for {workItemTypeName}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure custom fields for this work item type
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsAddModalOpen(true)}
          leftIcon={
            <svg className="fill-current shrink-0" width="16" height="16" viewBox="0 0 16 16">
              <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
            </svg>
          }
        >
          Add Field
        </Button>
      </div>

      {/* Data Table */}
      <DataTable
        title="Custom Fields"
        data={(fields || []).map((f) => ({ ...f, id: f.work_item_field_id }))}
        columns={columns}
        dropdownActions={getDropdownActions}
        pagination={{ itemsPerPage: 10 }}
        selectionMode="none"
        isLoading={isLoading}
        searchable={true}
        searchPlaceholder="Search fields..."
        densityToggle={true}
        resizable={true}
      />

      {/* Modals */}
      <WorkItemFieldModal
        mode="create"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={refetch}
        workItemTypeId={workItemTypeId}
      />

      <WorkItemFieldModal
        mode="edit"
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedField(null);
        }}
        onSuccess={refetch}
        workItemTypeId={workItemTypeId}
        field={selectedField}
        allFields={fields || []}
      />
    </div>
  );
}
