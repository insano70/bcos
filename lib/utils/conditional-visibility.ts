/**
 * Conditional Field Visibility Logic
 * Evaluates visibility rules to determine if a field should be shown
 */

export interface ConditionalVisibilityRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  value?: unknown;
}

export interface FieldConfig {
  conditional_visibility?: ConditionalVisibilityRule[];
}

export interface FieldValueMap {
  [field_id: string]: unknown;
}

/**
 * Evaluate a single conditional visibility rule
 */
function evaluateRule(rule: ConditionalVisibilityRule, fieldValues: FieldValueMap): boolean {
  const fieldValue = fieldValues[rule.field_id];

  switch (rule.operator) {
    case 'equals':
      return fieldValue === rule.value;

    case 'not_equals':
      return fieldValue !== rule.value;

    case 'contains':
      if (typeof fieldValue === 'string' && typeof rule.value === 'string') {
        return fieldValue.includes(rule.value);
      }
      if (Array.isArray(fieldValue) && rule.value !== undefined) {
        return fieldValue.includes(rule.value);
      }
      return false;

    case 'not_contains':
      if (typeof fieldValue === 'string' && typeof rule.value === 'string') {
        return !fieldValue.includes(rule.value);
      }
      if (Array.isArray(fieldValue) && rule.value !== undefined) {
        return !fieldValue.includes(rule.value);
      }
      return true;

    case 'greater_than':
      if (typeof fieldValue === 'number' && typeof rule.value === 'number') {
        return fieldValue > rule.value;
      }
      return false;

    case 'less_than':
      if (typeof fieldValue === 'number' && typeof rule.value === 'number') {
        return fieldValue < rule.value;
      }
      return false;

    case 'is_empty':
      if (fieldValue === null || fieldValue === undefined) {
        return true;
      }
      if (typeof fieldValue === 'string') {
        return fieldValue.trim() === '';
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.length === 0;
      }
      return false;

    case 'is_not_empty':
      if (fieldValue === null || fieldValue === undefined) {
        return false;
      }
      if (typeof fieldValue === 'string') {
        return fieldValue.trim() !== '';
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.length > 0;
      }
      return true;

    default:
      return true;
  }
}

/**
 * Evaluate conditional visibility for a field
 * Returns true if the field should be visible, false otherwise
 * All rules must pass (AND logic) for the field to be visible
 */
export function evaluateFieldVisibility(
  fieldConfig: FieldConfig | null | undefined,
  fieldValues: FieldValueMap
): boolean {
  // If no conditional visibility rules, field is visible
  if (!fieldConfig?.conditional_visibility || fieldConfig.conditional_visibility.length === 0) {
    return true;
  }

  // All rules must pass (AND logic)
  return fieldConfig.conditional_visibility.every((rule) => evaluateRule(rule, fieldValues));
}

/**
 * Get all visible fields from a list of fields based on current field values
 */
export function getVisibleFields<T extends { work_item_field_id: string; field_config?: FieldConfig | null }>(
  fields: T[],
  fieldValues: FieldValueMap
): T[] {
  return fields.filter((field) => evaluateFieldVisibility(field.field_config, fieldValues));
}

/**
 * Check if changing a field value affects visibility of other fields
 * Returns array of field IDs whose visibility may have changed
 */
export function getAffectedFields<T extends { work_item_field_id: string; field_config?: FieldConfig | null }>(
  changedFieldId: string,
  fields: T[]
): string[] {
  const affectedFieldIds: string[] = [];

  for (const field of fields) {
    if (!field.field_config?.conditional_visibility) {
      continue;
    }

    // Check if any rule references the changed field
    const hasReferenceToChangedField = field.field_config.conditional_visibility.some(
      (rule) => rule.field_id === changedFieldId
    );

    if (hasReferenceToChangedField) {
      affectedFieldIds.push(field.work_item_field_id);
    }
  }

  return affectedFieldIds;
}
