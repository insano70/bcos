'use client';

import { useMemo } from 'react';
import AttachmentFieldRenderer from '@/components/attachment-field-renderer';
import DateInput from '@/components/inputs/date-input';
import DateTimeInput from '@/components/inputs/datetime-input';
import UserPicker from '@/components/user-picker';
import { useUsers } from '@/lib/hooks/use-users';
import type { WorkItemField } from '@/lib/types/work-item-fields';

interface DynamicFieldRendererProps {
  fields: WorkItemField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  errors?: Record<string, string>;
  workItemId?: string; // Required for attachment fields
}

export default function DynamicFieldRenderer({
  fields,
  values,
  onChange,
  errors = {},
  workItemId,
}: DynamicFieldRendererProps) {
  // Fetch users for user_picker fields (cached with 5min staleTime, so minimal overhead)
  const { data: users = [] } = useUsers();

  // Sort fields by display order
  const sortedFields = useMemo(() => {
    return [...fields]
      .filter((f) => f.is_visible)
      .sort((a, b) => a.display_order - b.display_order);
  }, [fields]);

  const renderField = (field: WorkItemField) => {
    const value = values[field.work_item_field_id];
    const error = errors[field.work_item_field_id];
    const fieldId = `custom-field-${field.work_item_field_id}`;

    switch (field.field_type) {
      case 'text':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <input
              id={fieldId}
              type="text"
              className={`form-input w-full ${error ? 'border-red-500' : ''}`}
              value={(value as string) || ''}
              onChange={(e) => onChange(field.work_item_field_id, e.target.value)}
              required={field.is_required_on_creation}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        );

      case 'number':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <input
              id={fieldId}
              type="number"
              className={`form-input w-full ${error ? 'border-red-500' : ''}`}
              value={(value as number) || ''}
              onChange={(e) => onChange(field.work_item_field_id, parseFloat(e.target.value))}
              required={field.is_required_on_creation}
              min={field.validation_rules?.min}
              max={field.validation_rules?.max}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        );

      case 'date':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <DateInput
              id={fieldId}
              value={(value as string) || null}
              onChange={(val) => onChange(field.work_item_field_id, val)}
              required={field.is_required_on_creation}
              error={error}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        );

      case 'datetime':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <DateTimeInput
              id={fieldId}
              value={(value as string) || null}
              onChange={(val) => onChange(field.work_item_field_id, val)}
              required={field.is_required_on_creation}
              error={error}
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        );

      case 'dropdown':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <select
              id={fieldId}
              className={`form-select w-full ${error ? 'border-red-500' : ''}`}
              value={(value as string) || ''}
              onChange={(e) => onChange(field.work_item_field_id, e.target.value)}
              required={field.is_required_on_creation}
            >
              <option value="">Select an option...</option>
              {field.field_options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.work_item_field_id} className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id={fieldId}
                type="checkbox"
                className={`form-checkbox ${error ? 'border-red-500' : ''}`}
                checked={(value as boolean) || false}
                onChange={(e) => onChange(field.work_item_field_id, e.target.checked)}
              />
            </div>
            <div className="ml-3">
              <label className="text-sm font-medium" htmlFor={fieldId}>
                {field.field_label}
                {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.field_description && (
                <p className="text-xs text-gray-500 mt-1">{field.field_description}</p>
              )}
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
          </div>
        );

      case 'user_picker':
        return (
          <div key={field.work_item_field_id}>
            <label className="block text-sm font-medium mb-1" htmlFor={fieldId}>
              {field.field_label}
              {field.is_required_on_creation && <span className="text-red-500 ml-1">*</span>}
            </label>
            {field.field_description && (
              <p className="text-xs text-gray-500 mb-2">{field.field_description}</p>
            )}
            <UserPicker
              users={users}
              value={(value as string) || undefined}
              onChange={(userId) => onChange(field.work_item_field_id, userId || '')}
              placeholder={`Select ${field.field_label.toLowerCase()}`}
              required={field.is_required_on_creation}
              error={error}
              allowClear={!field.is_required_on_creation}
            />
          </div>
        );

      case 'attachment':
        if (!workItemId) {
          return (
            <div key={field.work_item_field_id} className="text-sm text-gray-500">
              Attachment fields are only available after the work item is created.
            </div>
          );
        }
        return (
          <div key={field.work_item_field_id}>
            <AttachmentFieldRenderer
              field={field}
              workItemId={workItemId}
              value={value as { attachment_ids?: string[] } | undefined}
              onChange={(val) => onChange(field.work_item_field_id, val)}
              error={error}
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (sortedFields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Custom Fields
        </h3>
        <div className="space-y-4">{sortedFields.map(renderField)}</div>
      </div>
    </div>
  );
}
