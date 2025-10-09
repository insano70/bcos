'use client';

import { RichTextEditor } from './rich-text-editor';
import { MultiSelectField, type MultiSelectOption } from './multi-select-field';
import {
  URLField,
  EmailField,
  PhoneField,
  CurrencyField,
  PercentageField,
} from './format-specific-fields';

/**
 * Field Renderer Component
 * Dynamically renders the appropriate input component based on field type
 */

export interface FieldOption {
  value: string;
  label: string;
}

export interface WorkItemField {
  work_item_field_id: string;
  field_name: string;
  field_label: string;
  field_type: string;
  field_description?: string | null;
  field_options?: FieldOption[] | null;
  field_config?: {
    conditional_visibility?: Array<{
      field_id: string;
      operator: string;
      value?: unknown;
    }>;
  } | null;
  is_required: boolean | null;
  validation_rules?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
  } | null;
  default_value?: string | null;
}

interface FieldRendererProps {
  field: WorkItemField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: FieldRendererProps) {
  const isRequired = field.is_required ?? false;

  // Text field
  if (field.field_type === 'text') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          maxLength={field.validation_rules?.maxLength}
          className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Number field
  if (field.field_type === 'number') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <input
          type="number"
          value={(value as number) || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          required={isRequired}
          min={field.validation_rules?.min}
          max={field.validation_rules?.max}
          className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Date field
  if (field.field_type === 'date') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <input
          type="date"
          value={(value as string) || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Datetime field
  if (field.field_type === 'datetime') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <input
          type="datetime-local"
          value={(value as string) || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Checkbox field
  if (field.field_type === 'checkbox') {
    return (
      <div className="space-y-2">
        <div className="flex items-center">
          <input
            id={field.work_item_field_id}
            type="checkbox"
            checked={(value as boolean) || false}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
            disabled={disabled}
            className="form-checkbox"
          />
          <label
            htmlFor={field.work_item_field_id}
            className="text-sm font-medium ml-2"
          >
            {field.field_label}
            {isRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Dropdown field
  if (field.field_type === 'dropdown') {
    const options = (field.field_options ?? []) as FieldOption[];
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <select
          value={(value as string) || ''}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          className={`form-select w-full ${error ? 'border-red-500' : ''}`}
        >
          <option value="">Select an option</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Multi-select field
  if (field.field_type === 'multi_select') {
    const options = (field.field_options ?? []) as MultiSelectOption[];
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <MultiSelectField
          options={options}
          value={(value as string[]) || []}
          onChange={onChange}
          disabled={disabled}
          {...(error ? { error } : {})}
        />
      </div>
    );
  }

  // Rich text field
  if (field.field_type === 'rich_text') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <RichTextEditor
          value={(value as string) || ''}
          onChange={onChange}
          readOnly={disabled}
          maxLength={field.validation_rules?.maxLength ?? 50000}
          {...(error ? { error } : {})}
        />
      </div>
    );
  }

  // URL field
  if (field.field_type === 'url') {
    return (
      <URLField
        value={value as string || ''}
        onChange={onChange}
        label={field.field_label}
        disabled={disabled}
        required={isRequired}
        {...(error ? { error } : {})}
      />
    );
  }

  // Email field
  if (field.field_type === 'email') {
    return (
      <EmailField
        value={value as string || ''}
        onChange={onChange}
        label={field.field_label}
        disabled={disabled}
        required={isRequired}
        {...(error ? { error } : {})}
      />
    );
  }

  // Phone field
  if (field.field_type === 'phone') {
    return (
      <PhoneField
        value={value as string || ''}
        onChange={onChange}
        label={field.field_label}
        disabled={disabled}
        required={isRequired}
        {...(error ? { error } : {})}
      />
    );
  }

  // Currency field
  if (field.field_type === 'currency') {
    return (
      <CurrencyField
        value={value as number || 0}
        onChange={onChange}
        label={field.field_label}
        disabled={disabled}
        required={isRequired}
        {...(error ? { error } : {})}
      />
    );
  }

  // Percentage field
  if (field.field_type === 'percentage') {
    return (
      <PercentageField
        value={value as number || 0}
        onChange={onChange}
        label={field.field_label}
        disabled={disabled}
        required={isRequired}
        {...(error ? { error } : {})}
      />
    );
  }

  // User picker field (placeholder - would need user selection component)
  if (field.field_type === 'user_picker') {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium mb-1">
          {field.field_label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.field_description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{field.field_description}</p>
        )}
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          placeholder="User ID"
          className={`form-input w-full ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium mb-1">{field.field_label}</label>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Unsupported field type: {field.field_type}
      </p>
    </div>
  );
}
