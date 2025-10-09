'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Input
          type="text"
          value={value as string || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          maxLength={field.validation_rules?.maxLength}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Number field
  if (field.field_type === 'number') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Input
          type="number"
          value={value as number || ''}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          required={isRequired}
          min={field.validation_rules?.min}
          max={field.validation_rules?.max}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Date field
  if (field.field_type === 'date') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Input
          type="date"
          value={value as string || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Datetime field
  if (field.field_type === 'datetime') {
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Input
          type="datetime-local"
          value={value as string || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Checkbox field
  if (field.field_type === 'checkbox') {
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          id={field.work_item_field_id}
          checked={value as boolean || false}
          onCheckedChange={(checked) => onChange(checked)}
          disabled={disabled}
        />
        <Label
          htmlFor={field.work_item_field_id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Dropdown field
  if (field.field_type === 'dropdown') {
    const options = (field.field_options ?? []) as FieldOption[];
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Select
          value={value as string || ''}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger className={error ? 'border-destructive' : ''}>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Multi-select field
  if (field.field_type === 'multi_select') {
    const options = (field.field_options ?? []) as MultiSelectOption[];
    return (
      <div className="space-y-2">
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
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
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <RichTextEditor
          value={value as string || ''}
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
        <Label>
          {field.field_label}
          {isRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        {field.field_description && (
          <p className="text-sm text-muted-foreground">{field.field_description}</p>
        )}
        <Input
          type="text"
          value={value as string || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={isRequired}
          placeholder="User ID"
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-2">
      <Label>{field.field_label}</Label>
      <p className="text-sm text-muted-foreground">
        Unsupported field type: {field.field_type}
      </p>
    </div>
  );
}
