'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { EditableColumn } from './editable-data-table';
import EditableDataTable from './editable-data-table';
import UserPicker from './user-picker';
import Toast from './toast';
import WorkItemExpandedRow from './work-items/work-item-expanded-row';
import type { WorkItem } from '@/lib/hooks/use-work-items';
import {
  useWorkItem,
  useWorkItemChildren,
  useCreateWorkItem,
  useUpdateWorkItem,
  useDeleteWorkItem,
} from '@/lib/hooks/use-work-items';
import { useActiveWorkItemTypes } from '@/lib/hooks/use-work-item-types';
import { useWorkItemStatuses } from '@/lib/hooks/use-work-item-statuses';
import { useTypeRelationshipsForParent } from '@/lib/hooks/use-work-item-type-relationships';
import { useUsers } from '@/lib/hooks/use-users';
import { apiClient } from '@/lib/api/client';
import type { WorkItemField } from '@/lib/types/work-item-fields';
import {
  validateCustomFields,
  hasValidationErrors,
  formatValidationErrorsForToast,
  ValidationError,
} from '@/lib/validations/custom-fields-validation';

export interface EditableWorkItemsTableProps {
  parentWorkItemId: string;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

export default function EditableWorkItemsTable({
  parentWorkItemId,
  onUnsavedChangesChange,
}: EditableWorkItemsTableProps) {
  const router = useRouter();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  // Fetch parent work item
  const { data: parentWorkItem } = useWorkItem(parentWorkItemId);

  // Fetch children
  const {
    data: children = [],
    isLoading,
  } = useWorkItemChildren(parentWorkItemId);

  // Fetch users for assignee picker
  const { data: users = [] } = useUsers();

  // Fetch work item types (all active types)
  const { data: allWorkItemTypes = [] } = useActiveWorkItemTypes();

  // Fetch type relationships for the parent
  const { data: typeRelationships = [] } = useTypeRelationshipsForParent(
    parentWorkItem?.work_item_type_id
  );

  // Filter allowed child types based on relationships
  const allowedChildTypes = useMemo(() => {
    if (!parentWorkItem || typeRelationships.length === 0) {
      // If no relationships defined, allow all types
      return allWorkItemTypes;
    }
    // Filter to only allowed child types
    return allWorkItemTypes.filter((type) =>
      typeRelationships.some((rel) => rel.child_type_id === type.id)
    );
  }, [allWorkItemTypes, typeRelationships, parentWorkItem]);

  // Fetch statuses for the first child's type (or parent's type as fallback)
  const firstChildType = children[0]?.work_item_type_id || parentWorkItem?.work_item_type_id;
  const { data: statusesData = [] } = useWorkItemStatuses(firstChildType || undefined);

  // Mutations
  const createWorkItem = useCreateWorkItem();
  const updateWorkItem = useUpdateWorkItem();
  const deleteWorkItem = useDeleteWorkItem();

  // Map data for column dropdowns
  const statuses = statusesData.map((s) => ({
    work_item_status_id: s.work_item_status_id,
    status_name: s.status_name,
  }));

  const workItemTypes = allowedChildTypes.map((t) => ({
    work_item_type_id: t.id,
    type_name: t.name,
  }));

  // Bulk actions
  const bulkActions = useMemo(
    () => [
      {
        label: 'Change Status',
        onClick: async (items: WorkItem[]) => {
          if (items.length === 0) return;

          // For now, use a browser prompt for status selection
          // In production, this could be a modal with a proper status picker
          const statusOptions = statuses.map((s) => `${s.status_name}`).join(', ');
          const selectedStatus = window.prompt(
            `Select a status for ${items.length} item(s):\nAvailable: ${statusOptions}\n\nEnter status name:`
          );

          if (!selectedStatus) return;

          // Find the status object
          const status = statuses.find(
            (s) => s.status_name.toLowerCase() === selectedStatus.toLowerCase()
          );

          if (!status) {
            setToastType('error');
            setToastMessage(`Invalid status: ${selectedStatus}`);
            setShowToast(true);
            return;
          }

          // Update all selected items
          try {
            await Promise.all(
              items.map((item) =>
                updateWorkItem.mutateAsync({
                  id: item.id,
                  data: { status_id: status.work_item_status_id },
                })
              )
            );

            setToastType('success');
            setToastMessage(`Updated ${items.length} item(s) to ${status.status_name}`);
            setShowToast(true);
          } catch (error) {
            console.error('Failed to update status:', error);
            setToastType('error');
            setToastMessage('Failed to update status');
            setShowToast(true);
          }
        },
        variant: 'default' as const,
        confirmModal: {
          title: 'Change Status',
          message: 'This will update the status for all selected items.',
          confirmText: 'Continue',
        },
      },
    ],
    [statuses, updateWorkItem]
  );

  // Column definitions
  const columns = useMemo<EditableColumn<WorkItem>[]>(
    () => [
      {
        key: 'checkbox',
        header: '',
        width: '40px',
        editable: false,
      },
      {
        key: 'work_item_type_name',
        header: 'Type',
        width: '150px',
        editable: true,
        required: true,
        render: (item) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {item.work_item_type_name}
          </span>
        ),
        renderEdit: (item, _value, onChange, error) => (
          <select
            value={item.work_item_type_id}
            onChange={(e) => onChange(e.target.value)}
            className={`form-select w-full ${error ? 'border-red-500' : ''}`}
          >
            <option value="">Select type...</option>
            {workItemTypes.map((type) => (
              <option key={type.work_item_type_id} value={type.work_item_type_id}>
                {type.type_name}
              </option>
            ))}
          </select>
        ),
        validate: (value) => {
          if (!value) return 'Type is required';
          return undefined;
        },
      },
      {
        key: 'subject',
        header: 'Subject',
        width: 'auto',
        editable: true,
        required: true,
        render: (item) => (
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {item.subject || <span className="text-gray-400 italic">Untitled</span>}
          </span>
        ),
        renderEdit: (_item, value, onChange, error) => (
          <input
            type="text"
            value={String(value || '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter subject..."
            className={`form-input w-full ${error ? 'border-red-500' : ''}`}
            autoFocus
          />
        ),
        validate: (value) => {
          if (!value || String(value).trim().length === 0) {
            return 'Subject is required';
          }
          if (String(value).length > 500) {
            return 'Subject must be 500 characters or less';
          }
          return undefined;
        },
      },
      {
        key: 'status_name',
        header: 'Status',
        width: '150px',
        editable: true,
        render: (item) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            {item.status_name}
          </span>
        ),
        renderEdit: (item, _value, onChange, error) => (
          <select
            value={item.status_id}
            onChange={(e) => onChange(e.target.value)}
            className={`form-select w-full ${error ? 'border-red-500' : ''}`}
          >
            {statuses.map((status) => (
              <option key={status.work_item_status_id} value={status.work_item_status_id}>
                {status.status_name}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: 'priority',
        header: 'Priority',
        width: '120px',
        editable: true,
        render: (item) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              item.priority === 'critical'
                ? 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
                : item.priority === 'high'
                  ? 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400'
                  : item.priority === 'medium'
                    ? 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
            }`}
          >
            {item.priority}
          </span>
        ),
        renderEdit: (_item, value, onChange, error) => (
          <select
            value={String(value || 'medium')}
            onChange={(e) => onChange(e.target.value)}
            className={`form-select w-full ${error ? 'border-red-500' : ''}`}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        ),
      },
      {
        key: 'assigned_to',
        header: 'Assignee',
        width: '180px',
        editable: true,
        render: (item) =>
          item.assigned_to_name ? (
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {item.assigned_to_name}
            </span>
          ) : (
            <span className="text-sm text-gray-400 italic">Unassigned</span>
          ),
        renderEdit: (_item, value, onChange, error) => (
          <UserPicker
            value={String(value || '')}
            onChange={onChange}
            users={users}
            placeholder="Assign to..."
            error={error}
          />
        ),
      },
      {
        key: 'due_date',
        header: 'Due Date',
        width: '150px',
        editable: true,
        render: (item) =>
          item.due_date ? (
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {new Date(item.due_date).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          ),
        renderEdit: (_item, value, onChange, error) => (
          <input
            type="date"
            value={value ? new Date(value as Date).toISOString().split('T')[0] : ''}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
            className={`form-input w-full ${error ? 'border-red-500' : ''}`}
          />
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '200px',
        editable: false,
      },
    ],
    [statuses, workItemTypes, users]
  );

  // Handlers
  const handleSave = async (item: WorkItem, changes: Partial<WorkItem>) => {
    try {
      // Determine if this is a new item
      const isNewItem = newItemIds.has(item.id);

      // Fetch custom field definitions for this work item type
      const customFields = await apiClient.get<WorkItemField[]>(
        `/api/work-item-types/${item.work_item_type_id}/fields`
      );

      // Determine new status category if status is changing
      let newStatusCategory: string | undefined;
      if (changes.status_id && changes.status_id !== item.status_id) {
        const newStatus = statusesData.find((s) => s.work_item_status_id === changes.status_id);
        newStatusCategory = newStatus?.status_category;
      }

      // Validate custom fields
      const validationResult = validateCustomFields({
        workItem: item,
        changes,
        customFields,
        isNewItem,
        newStatusCategory,
      });

      // If validation fails, prevent save and show errors
      if (hasValidationErrors(validationResult)) {
        setToastType('error');
        setToastMessage(formatValidationErrorsForToast(validationResult));
        setShowToast(true);

        // Throw ValidationError with details to keep row in edit mode and show field errors
        throw new ValidationError(validationResult.customFieldErrors, formatValidationErrorsForToast(validationResult));
      }

      // Format custom fields before sending (ensure datetime fields are in ISO format)
      // We need to format ALL custom fields if any are being sent, not just changed ones
      let formattedCustomFields: Record<string, unknown> | undefined;
      if (changes.custom_fields) {
        formattedCustomFields = {};

        // Merge current and changed custom fields
        const allCustomFields = { ...item.custom_fields, ...changes.custom_fields };

        for (const [fieldId, value] of Object.entries(allCustomFields)) {
          const field = customFields.find((f) => f.work_item_field_id === fieldId);

          if (field?.field_type === 'datetime' && value && typeof value === 'string') {
            // If value is just a date (YYYY-MM-DD), convert to ISO datetime
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              formattedCustomFields[fieldId] = `${value}T00:00:00.000Z`;
            } else {
              // Already in correct format or has time component
              formattedCustomFields[fieldId] = value;
            }
          } else if (value !== undefined && value !== null) {
            formattedCustomFields[fieldId] = value;
          }
        }
      }

      // Validation passed - proceed with save
      await updateWorkItem.mutateAsync({
        id: item.id,
        data: {
          subject: changes.subject as string | undefined,
          description: changes.description !== undefined ? (changes.description === null ? undefined : String(changes.description)) : undefined,
          status_id: changes.status_id as string | undefined,
          priority: changes.priority as string | undefined,
          assigned_to: (changes.assigned_to === null ? undefined : changes.assigned_to) as string | undefined,
          due_date: changes.due_date ? (changes.due_date as Date).toISOString() : undefined,
          custom_fields: formattedCustomFields,
        },
      });

      // Remove from new items tracking after successful first save
      if (isNewItem) {
        setNewItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }

      // Note: React Query handles optimistic updates and refetch automatically
      setToastType('success');
      setToastMessage('Work item updated successfully');
      setShowToast(true);
    } catch (error) {
      // Check if this is a validation error (expected user error, not a system error)
      if (error instanceof ValidationError) {
        // Validation error - toast already shown, just re-throw to keep row in edit mode
        throw error;
      }

      // System error - log and show generic error message
      console.error('Failed to update work item:', error);
      setToastType('error');
      setToastMessage('Failed to update work item');
      setShowToast(true);
      throw error; // Re-throw to keep row in edit mode
    }
  };

  const handleDelete = async (item: WorkItem) => {
    try {
      await deleteWorkItem.mutateAsync(item.id);
      // Note: React Query handles optimistic updates and refetch automatically
      setToastType('success');
      setToastMessage('Work item deleted successfully');
      setShowToast(true);
    } catch (error) {
      console.error('Failed to delete work item:', error);
      setToastType('error');
      setToastMessage('Failed to delete work item');
      setShowToast(true);
      throw error;
    }
  };

  const handleQuickAdd = async (): Promise<string | undefined> => {
    try {
      if (!parentWorkItem) {
        throw new Error('Parent work item not loaded');
      }

      // Get the first allowed child type
      const firstAllowedType = allowedChildTypes[0];
      if (!firstAllowedType) {
        throw new Error('No allowed child types configured');
      }

      // Create stub work item
      const newWorkItem = await createWorkItem.mutateAsync({
        parent_work_item_id: parentWorkItemId,
        work_item_type_id: firstAllowedType.id,
        organization_id: parentWorkItem.organization_id,
        subject: 'New Item', // Default subject - user will edit
        priority: 'medium', // Default priority
        // All other fields will be null/undefined
      });

      // Track this as a new item (for validation)
      setNewItemIds((prev) => {
        const next = new Set(prev);
        next.add(newWorkItem.id);
        return next;
      });

      // Note: React Query handles optimistic updates and refetch automatically

      setToastType('success');
      setToastMessage('New row added - fill in required fields');
      setShowToast(true);

      // Return the new item ID so EditableDataTable can auto-edit it
      return newWorkItem.id;
    } catch (error) {
      console.error('Failed to add row:', error);
      setToastType('error');
      setToastMessage('Failed to add row');
      setShowToast(true);
      throw error;
    }
  };

  return (
    <div>
      <EditableDataTable
        title={`Child Work Items (${children.length})`}
        data={children}
        columns={columns}
        onSave={handleSave}
        onDelete={handleDelete}
        onQuickAdd={handleQuickAdd}
        onNavigate={(item) => router.push(`/default/work/${item.id}`)}
        {...(onUnsavedChangesChange ? { onUnsavedChangesChange } : {})}
        bulkActions={bulkActions}
        isLoading={isLoading}
        pagination={{ itemsPerPage: 50 }}
        expandable={{
          render: (item, isEditing, changes, onChange, errors) => (
            <WorkItemExpandedRow
              workItem={item}
              isEditing={isEditing}
              changes={changes}
              onChange={onChange}
              errors={errors}
            />
          ),
        }}
        emptyState={{
          title: 'No child work items',
          description: 'Click "+ Add Row" to create a new child work item',
        }}
      />

      <Toast type={toastType} open={showToast} setOpen={setShowToast}>
        {toastMessage}
      </Toast>
    </div>
  );
}
