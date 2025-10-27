/**
 * Custom Fields Validation
 * Validates custom field requirements based on is_required_on_creation and is_required_to_complete
 */

import type { WorkItem } from '@/lib/hooks/use-work-items';
import type { WorkItemField } from '@/lib/types/work-item-fields';

export interface ValidationContext {
  workItem: WorkItem;
  changes: Partial<WorkItem>;
  customFields: WorkItemField[];
  isNewItem: boolean; // Reserved for future use, currently not used in validation
  newStatusCategory?: string | undefined; // Status category if status is being changed
}

export interface ValidationErrors {
  customFieldErrors: Record<string, string>; // fieldId -> error message
  generalErrors: string[];
}

/**
 * Custom error class for validation failures
 * Used to differentiate validation errors from other errors
 */
export class ValidationError extends Error {
  public readonly validationErrors: Record<string, string>;

  constructor(validationErrors: Record<string, string>, message?: string) {
    super(message || 'Validation failed');
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Validates custom fields based on creation and completion requirements
 */
export function validateCustomFields(context: ValidationContext): ValidationErrors {
  const { workItem, changes, customFields, newStatusCategory } = context;
  const errors: Record<string, string> = {};
  const generalErrors: string[] = [];

  // Merge current values with changes to get the full picture
  const currentCustomFields = workItem.custom_fields ?? {};
  const changedCustomFields = changes.custom_fields ?? {};
  const mergedCustomFields = { ...currentCustomFields, ...changedCustomFields };

  for (const field of customFields) {
    const fieldId = field.work_item_field_id;
    const fieldValue = mergedCustomFields[fieldId];
    const hasValue = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';

    // Validation Rule 1: Required on creation (ALWAYS required, not just when new)
    if (field.is_required_on_creation && !hasValue) {
      errors[fieldId] = `${field.field_label} is required`;
    }

    // Validation Rule 2: Required to complete (only when status changes to completed)
    // Note: This check is skipped if field is already required_on_creation
    if (
      !field.is_required_on_creation &&
      newStatusCategory === 'completed' &&
      field.is_required_to_complete &&
      !hasValue
    ) {
      errors[fieldId] = `${field.field_label} is required to complete this work item`;
    }
  }

  return {
    customFieldErrors: errors,
    generalErrors,
  };
}

/**
 * Checks if there are any validation errors
 */
export function hasValidationErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors.customFieldErrors).length > 0 || errors.generalErrors.length > 0;
}

/**
 * Formats validation errors for display in a toast message
 */
export function formatValidationErrorsForToast(errors: ValidationErrors): string {
  const messages: string[] = [];

  if (errors.generalErrors.length > 0) {
    messages.push(...errors.generalErrors);
  }

  const fieldErrorCount = Object.keys(errors.customFieldErrors).length;
  if (fieldErrorCount > 0) {
    messages.push(`${fieldErrorCount} required field${fieldErrorCount > 1 ? 's' : ''} must be filled`);
  }

  return messages.join('. ');
}
