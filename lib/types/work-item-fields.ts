/**
 * Work Item Custom Fields Types
 * Type definitions for custom field configuration and values
 */

/**
 * Supported field types for custom fields
 */
export type FieldType = 'text' | 'number' | 'date' | 'datetime' | 'dropdown' | 'checkbox' | 'user_picker' | 'multi_select' | 'rich_text' | 'url' | 'email' | 'phone' | 'currency' | 'percentage';

/**
 * Field option for dropdown/multi_select fields
 */
export interface FieldOption {
  value: string;
  label: string;
}

/**
 * Conditional visibility rule for fields
 */
export interface ConditionalVisibilityRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}

/**
 * Field configuration (Phase 8)
 */
export interface FieldConfig {
  conditional_visibility?: ConditionalVisibilityRule[];
}

/**
 * Validation rules for custom fields
 */
export interface ValidationRules {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}

/**
 * Custom field definition
 */
export interface WorkItemField {
  work_item_field_id: string;
  work_item_type_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  field_description: string | null;
  field_options: FieldOption[] | null;
  field_config: FieldConfig | null;
  is_required: boolean;
  validation_rules: ValidationRules | null;
  default_value: string | null;
  display_order: number;
  is_visible: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Custom field value
 */
export interface WorkItemFieldValue {
  work_item_field_value_id: string;
  work_item_id: string;
  work_item_field_id: string;
  field_value: unknown; // Can be string, number, boolean, Date, etc.
  created_at: Date;
  updated_at: Date;
}

/**
 * Custom field with value (for display/edit)
 */
export interface WorkItemFieldWithValue extends WorkItemField {
  value?: unknown;
  value_id?: string;
}

/**
 * Create work item field data
 */
export interface CreateWorkItemFieldData {
  work_item_type_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  field_description?: string;
  field_options?: FieldOption[];
  field_config?: FieldConfig;
  is_required?: boolean;
  validation_rules?: ValidationRules;
  default_value?: string;
  display_order?: number;
  is_visible?: boolean;
}

/**
 * Update work item field data
 */
export interface UpdateWorkItemFieldData {
  field_label?: string;
  field_description?: string;
  field_options?: FieldOption[];
  field_config?: FieldConfig;
  is_required?: boolean;
  validation_rules?: ValidationRules;
  default_value?: string;
  display_order?: number;
  is_visible?: boolean;
}

/**
 * Work item with custom field values
 */
export interface WorkItemWithCustomFields {
  work_item_id: string;
  // ... other work item fields
  custom_fields: Record<string, unknown>; // fieldName -> value
}
