import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { work_item_fields, work_item_field_values } from '@/lib/db/schema';

export interface FieldCompletionError {
  field_id: string;
  field_name: string;
  field_label: string;
  reason: 'missing' | 'empty';
}

export interface FieldCompletionValidationResult {
  isValid: boolean;
  missingFields: FieldCompletionError[];
  errorMessage?: string;
}

/**
 * Checks if a field value is considered empty based on its type
 */
function isValueEmpty(value: unknown, fieldType: string): boolean {
  // For string-like fields
  if (fieldType === 'text' || fieldType === 'dropdown' || fieldType === 'user_picker') {
    return typeof value === 'string' && value.trim() === '';
  }

  // For date fields
  if (fieldType === 'date' || fieldType === 'datetime') {
    return !value || (typeof value === 'string' && value.trim() === '');
  }

  // For number fields
  if (fieldType === 'number') {
    return value === null || value === undefined || value === '';
  }

  // For checkbox fields, false is a valid value
  if (fieldType === 'checkbox') {
    return false; // Checkboxes are never "empty" - false is valid
  }

  // Default: null or undefined is empty
  return value === null || value === undefined;
}

/**
 * Validates if a work item has all required-to-complete fields filled
 * before allowing transition to 'completed' status category
 *
 * @param workItemId - The work item ID to validate
 * @param workItemTypeId - The work item type ID
 * @returns Validation result with missing fields if any
 */
export async function validateForCompletion(
  workItemId: string,
  workItemTypeId: string
): Promise<FieldCompletionValidationResult> {
  // Get all fields that are required to complete for this work item type
  const requiredFields = await db
    .select({
      work_item_field_id: work_item_fields.work_item_field_id,
      field_name: work_item_fields.field_name,
      field_label: work_item_fields.field_label,
      field_type: work_item_fields.field_type,
    })
    .from(work_item_fields)
    .where(
      and(
        eq(work_item_fields.work_item_type_id, workItemTypeId),
        eq(work_item_fields.is_required_to_complete, true),
        eq(work_item_fields.is_visible, true),
        isNull(work_item_fields.deleted_at)
      )
    );

  // If no required fields, validation passes
  if (requiredFields.length === 0) {
    return {
      isValid: true,
      missingFields: [],
    };
  }

  // Get all field values for this work item
  const fieldValues = await db
    .select({
      work_item_field_id: work_item_field_values.work_item_field_id,
      field_value: work_item_field_values.field_value,
    })
    .from(work_item_field_values)
    .where(eq(work_item_field_values.work_item_id, workItemId));

  const fieldValueMap = new Map(
    fieldValues.map((fv) => [fv.work_item_field_id, fv.field_value])
  );

  // Check each required field
  const missingFields: FieldCompletionError[] = [];

  for (const field of requiredFields) {
    const value = fieldValueMap.get(field.work_item_field_id);

    // Check if field is missing or empty
    if (value === undefined || value === null) {
      missingFields.push({
        field_id: field.work_item_field_id,
        field_name: field.field_name,
        field_label: field.field_label,
        reason: 'missing',
      });
    } else if (isValueEmpty(value, field.field_type)) {
      missingFields.push({
        field_id: field.work_item_field_id,
        field_name: field.field_name,
        field_label: field.field_label,
        reason: 'empty',
      });
    }
  }

  if (missingFields.length > 0) {
    const fieldList = missingFields.map((f) => `"${f.field_label}"`).join(', ');
    return {
      isValid: false,
      missingFields,
      errorMessage: `Cannot complete work item: the following required fields must be filled: ${fieldList}`,
    };
  }

  return {
    isValid: true,
    missingFields: [],
  };
}
