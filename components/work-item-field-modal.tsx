'use client';

import { z } from 'zod';
import { useState } from 'react';
import ConditionalVisibilityBuilder from '@/components/conditional-visibility-builder';
import CrudModal from './crud-modal';
import type { FieldConfig, CustomFieldProps } from './crud-modal/types';
import {
  useCreateWorkItemField,
  useUpdateWorkItemField,
} from '@/lib/hooks/use-work-item-fields';
import type {
  FieldOption,
  WorkItemField,
  ConditionalVisibilityRule,
} from '@/lib/types/work-item-fields';

// Field options manager custom component
function FieldOptionsManager({ value, onChange }: CustomFieldProps<WorkItemFieldFormData>) {
  const options = (value as FieldOption[]) || [];
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const addOption = () => {
    if (newOptionValue && newOptionLabel) {
      onChange([...options, { value: newOptionValue, label: newOptionLabel }]);
      setNewOptionValue('');
      setNewOptionLabel('');
    }
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Dropdown Options
      </label>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.value} className="flex items-center gap-2">
            <span className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
              {option.label} ({option.value})
            </span>
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="text-red-500 hover:text-red-700"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            type="text"
            className="form-input flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Option value"
            value={newOptionValue}
            onChange={(e) => setNewOptionValue(e.target.value)}
          />
          <input
            type="text"
            className="form-input flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Option label"
            value={newOptionLabel}
            onChange={(e) => setNewOptionLabel(e.target.value)}
          />
          <button
            type="button"
            onClick={addOption}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// Attachment config custom component
function AttachmentConfigField({ value, onChange }: CustomFieldProps<WorkItemFieldFormData>) {
  const config = value as { maxFiles: number | null; unlimited: boolean } | undefined;
  const maxFiles = config?.maxFiles ?? 1;
  const unlimited = config?.unlimited ?? false;

  const handleUnlimitedChange = (checked: boolean) => {
    onChange({
      maxFiles: checked ? null : 1,
      unlimited: checked,
    });
  };

  const handleMaxFilesChange = (files: number) => {
    onChange({
      maxFiles: files,
      unlimited: false,
    });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Attachment Settings
      </label>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={unlimited}
          onChange={(e) => handleUnlimitedChange(e.target.checked)}
          className="form-checkbox"
        />
        <label className="text-sm text-gray-700 dark:text-gray-300">Allow unlimited files</label>
      </div>

      {!unlimited && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Maximum Files
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            min="1"
            value={maxFiles ?? 1}
            onChange={(e) => handleMaxFilesChange(parseInt(e.target.value, 10))}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Maximum number of files that can be attached
          </p>
        </div>
      )}
    </div>
  );
}

// Conditional visibility custom component (edit mode only)
function ConditionalVisibilityField({
  value,
  onChange,
  formData,
}: CustomFieldProps<EditWorkItemFieldFormData> & {
  allFields?: WorkItemField[];
  currentFieldId?: string;
}) {
  const rules = (value as ConditionalVisibilityRule[]) || [];
  const allFields = (formData as { _allFields?: WorkItemField[] })?._allFields || [];
  const currentFieldId = (formData as { _currentFieldId?: string })?._currentFieldId || '';

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <ConditionalVisibilityBuilder
        rules={rules}
        onChange={(newRules) => onChange(newRules)}
        availableFields={allFields}
        currentFieldId={currentFieldId}
      />
    </div>
  );
}

// Create schema
const createWorkItemFieldSchema = z.object({
  field_label: z.string().min(1, 'Field label is required'),
  field_name: z
    .string()
    .min(1, 'Field name is required')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
    ),
  field_type: z.enum([
    'text',
    'number',
    'date',
    'datetime',
    'dropdown',
    'checkbox',
    'user_picker',
    'attachment',
  ] as const),
  field_description: z.string().optional(),
  display_order: z.number().optional(),
  is_required_on_creation: z.boolean().optional(),
  is_required_to_complete: z.boolean().optional(),
  is_visible: z.boolean().optional(),
  field_options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  attachment_config: z
    .object({
      maxFiles: z.number().nullable(),
      unlimited: z.boolean(),
    })
    .optional(),
});

// Edit schema (no field_name or field_type)
const editWorkItemFieldSchema = z.object({
  field_label: z.string().min(1, 'Field label is required'),
  field_description: z.string().optional(),
  display_order: z.number().optional(),
  is_required_on_creation: z.boolean().optional(),
  is_required_to_complete: z.boolean().optional(),
  is_visible: z.boolean().optional(),
  field_options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  attachment_config: z
    .object({
      maxFiles: z.number().nullable(),
      unlimited: z.boolean(),
    })
    .optional(),
  conditional_visibility: z
    .array(
      z.object({
        field_id: z.string(),
        operator: z.enum([
          'equals',
          'not_equals',
          'contains',
          'not_contains',
          'greater_than',
          'less_than',
          'is_empty',
          'is_not_empty',
        ]),
        value: z.unknown().optional(),
      })
    )
    .optional(),
  _allFields: z.array(z.custom<WorkItemField>()).optional(),
  _currentFieldId: z.string().optional(),
});

type CreateWorkItemFieldFormData = z.infer<typeof createWorkItemFieldSchema>;
type EditWorkItemFieldFormData = z.infer<typeof editWorkItemFieldSchema>;
type WorkItemFieldFormData = CreateWorkItemFieldFormData | EditWorkItemFieldFormData;

interface WorkItemFieldModalProps {
  mode: 'create' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workItemTypeId: string;
  field?: WorkItemField | null;
  allFields?: WorkItemField[];
}

export default function WorkItemFieldModal({
  mode,
  isOpen,
  onClose,
  onSuccess,
  workItemTypeId,
  field,
  allFields = [],
}: WorkItemFieldModalProps) {
  const createFieldMutation = useCreateWorkItemField();
  const updateFieldMutation = useUpdateWorkItemField();

  // Transform entity for edit mode
  const transformedEntity = field
    ? {
        ...field,
        field_options: field.field_options || [],
        attachment_config: field.field_type === 'attachment'
          ? {
              maxFiles: field.field_config?.attachment_config?.max_files ?? 1,
              unlimited: field.field_config?.attachment_config?.max_files === null,
            }
          : undefined,
        conditional_visibility: field.field_config?.conditional_visibility || [],
        _allFields: allFields,
        _currentFieldId: field.work_item_field_id,
      }
    : null;

  const fields: FieldConfig<WorkItemFieldFormData>[] = [
    {
      type: 'text',
      name: 'field_label' as never,
      label: 'Field Label',
      required: true,
      column: mode === 'create' ? 'left' : 'full',
    },
    {
      type: 'text',
      name: 'field_name' as never,
      label: 'Field Name',
      placeholder: 'e.g., patient_status, due_date',
      helpText: 'Must start with a lowercase letter, use only lowercase letters, numbers, and underscores',
      required: true,
      column: 'right',
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'select',
      name: 'field_type' as never,
      label: 'Field Type',
      required: true,
      column: mode === 'create' ? 'full' : 'left',
      options: [
        { value: 'text', label: 'Text' },
        { value: 'number', label: 'Number' },
        { value: 'date', label: 'Date' },
        { value: 'datetime', label: 'Date & Time' },
        { value: 'dropdown', label: 'Dropdown' },
        { value: 'checkbox', label: 'Checkbox' },
        { value: 'user_picker', label: 'User Picker' },
        { value: 'attachment', label: 'Attachment' },
      ],
      visible: (_formData) => mode === 'create',
    },
    {
      type: 'textarea',
      name: 'field_description' as never,
      label: 'Description',
      column: 'full',
      rows: 3,
    },
    {
      type: 'number',
      name: 'display_order' as never,
      label: 'Display Order',
      column: 'full',
    },
    {
      type: 'custom',
      name: 'field_options' as never,
      label: '',
      column: 'full',
      component: FieldOptionsManager,
      props: {},
      visible: (formData) => {
        const fieldType = mode === 'create'
          ? (formData as CreateWorkItemFieldFormData).field_type
          : field?.field_type;
        return fieldType === 'dropdown';
      },
    },
    {
      type: 'custom',
      name: 'attachment_config' as never,
      label: '',
      column: 'full',
      component: AttachmentConfigField,
      props: {},
      visible: (formData) => {
        const fieldType = mode === 'create'
          ? (formData as CreateWorkItemFieldFormData).field_type
          : field?.field_type;
        return fieldType === 'attachment';
      },
    },
    {
      type: 'custom',
      name: 'conditional_visibility' as never,
      label: '',
      column: 'full',
      component: ConditionalVisibilityField,
      props: {},
      visible: (_formData) => mode === 'edit',
    },
    {
      type: 'checkbox',
      name: 'is_required_on_creation' as never,
      label: 'Required on Creation',
      column: 'left',
    },
    {
      type: 'checkbox',
      name: 'is_required_to_complete' as never,
      label: 'Required to Complete',
      column: 'right',
    },
    {
      type: 'checkbox',
      name: 'is_visible' as never,
      label: 'Visible in forms',
      column: 'full',
    },
  ];

  const handleSubmit = async (data: WorkItemFieldFormData) => {
    if (mode === 'create') {
      const createData = data as CreateWorkItemFieldFormData;

      // Build field config
      let fieldConfig: {
        attachment_config?: { max_files: number | null };
      } | undefined;

      if (createData.field_type === 'attachment' && createData.attachment_config) {
        fieldConfig = {
          attachment_config: {
            max_files: createData.attachment_config.unlimited
              ? null
              : createData.attachment_config.maxFiles,
          },
        };
      }

      await createFieldMutation.mutateAsync({
        work_item_type_id: workItemTypeId,
        field_name: createData.field_name,
        field_label: createData.field_label,
        field_type: createData.field_type,
        field_description: createData.field_description || undefined,
        is_required_on_creation: createData.is_required_on_creation ?? false,
        is_required_to_complete: createData.is_required_to_complete ?? false,
        is_visible: createData.is_visible ?? true,
        display_order: createData.display_order ?? 0,
        field_options: createData.field_type === 'dropdown' ? createData.field_options : undefined,
        field_config: fieldConfig,
      } as never);
    } else if (field) {
      const editData = data as EditWorkItemFieldFormData;

      // Build field config
      let fieldConfig: {
        attachment_config?: { max_files: number | null };
        conditional_visibility?: ConditionalVisibilityRule[];
      } | undefined;

      if (field.field_type === 'attachment' && editData.attachment_config) {
        fieldConfig = {
          attachment_config: {
            max_files: editData.attachment_config.unlimited
              ? null
              : editData.attachment_config.maxFiles,
          },
        };
        if (editData.conditional_visibility && editData.conditional_visibility.length > 0) {
          fieldConfig.conditional_visibility = editData.conditional_visibility;
        }
      } else if (editData.conditional_visibility && editData.conditional_visibility.length > 0) {
        fieldConfig = {
          conditional_visibility: editData.conditional_visibility,
        };
      }

      await updateFieldMutation.mutateAsync({
        fieldId: field.work_item_field_id,
        data: {
          field_label: editData.field_label,
          field_description: editData.field_description || undefined,
          is_required_on_creation: editData.is_required_on_creation,
          is_required_to_complete: editData.is_required_to_complete,
          is_visible: editData.is_visible,
          display_order: editData.display_order,
          field_options: field.field_type === 'dropdown' ? editData.field_options : undefined,
          field_config: fieldConfig,
        } as never,
      });
    }
  };

  // Create read-only info display for edit mode
  const infoDisplay = field
    ? `${field.field_name} • ${field.field_type.replace('_', ' ')} • Field type and name cannot be changed`
    : undefined;

  return (
    <CrudModal
      mode={mode}
      entity={transformedEntity as never}
      title={mode === 'create' ? 'Add Custom Field' : 'Edit Custom Field'}
      resourceName="field"
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      schema={(mode === 'create' ? createWorkItemFieldSchema : editWorkItemFieldSchema) as never}
      defaultValues={
        {
          field_label: '',
          field_name: '',
          field_type: 'text',
          field_description: '',
          display_order: 0,
          is_required_on_creation: false,
          is_required_to_complete: false,
          is_visible: true,
          field_options: [],
          attachment_config: {
            maxFiles: 1,
            unlimited: false,
          },
          conditional_visibility: [],
        } as never
      }
      fields={fields}
      onSubmit={handleSubmit}
      size="4xl"
      successMessage={
        mode === 'create' ? 'Field created successfully!' : 'Field updated successfully!'
      }
      {...(mode === 'edit' && infoDisplay && { infoDisplay })}
    />
  );
}
