/**
 * Template Interpolation Utility
 * Phase 6: Type relationships with auto-creation
 *
 * Handles template string interpolation for auto-created work items
 * Supports:
 * - {parent.field_name} - Standard work item fields
 * - {parent.custom.field_name} - Custom field values
 */

export interface WorkItemForInterpolation {
  work_item_id: string;
  work_item_type_id: string;
  organization_id: string;
  subject: string;
  description: string | null;
  status_id: string;
  priority: string;
  assigned_to: string | null;
  due_date: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  parent_work_item_id: string | null;
  root_work_item_id: string | null;
  depth: number;
  path: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  // Allow additional fields for type safety
  [key: string]: string | number | Date | boolean | null | undefined;
}

/**
 * Interpolate a template string with parent work item data
 *
 * @param template - Template string with {parent.field_name} or {parent.custom.field_name} tokens
 * @param parentWorkItem - Parent work item data
 * @param customFields - Optional custom field values from parent
 * @returns Interpolated string with tokens replaced by actual values
 *
 * @example
 * interpolateTemplate(
 *   "Patient Record for {parent.subject}",
 *   { subject: "John Doe" },
 *   {}
 * )
 * // Returns: "Patient Record for John Doe"
 *
 * @example
 * interpolateTemplate(
 *   "Visit for {parent.custom.patient_name}",
 *   parentWorkItem,
 *   { patient_name: "Jane Smith" }
 * )
 * // Returns: "Visit for Jane Smith"
 */
export function interpolateTemplate(
  template: string,
  parentWorkItem: WorkItemForInterpolation,
  customFields?: Record<string, unknown>
): string {
  let result = template;

  // Replace {parent.field_name} tokens with standard fields
  result = result.replace(/\{parent\.(\w+)\}/g, (match: string, fieldName: string): string => {
    // Check if field exists in parent work item
    if (fieldName in parentWorkItem) {
      const value = parentWorkItem[fieldName];

      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }

      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString().split('T')[0] || ''; // YYYY-MM-DD format
      }

      // Convert to string
      return String(value);
    }

    // If field not found, return original token
    return match;
  });

  // Replace {parent.custom.field_name} tokens with custom fields
  if (customFields) {
    result = result.replace(
      /\{parent\.custom\.(\w+)\}/g,
      (match: string, fieldName: string): string => {
        if (fieldName in customFields) {
          const value = customFields[fieldName];

          // Handle null/undefined
          if (value === null || value === undefined) {
            return '';
          }

          // Handle objects/arrays (stringify them)
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }

          // Convert to string
          return String(value);
        }

        // If field not found, return original token
        return match;
      }
    );
  }

  return result;
}

/**
 * Interpolate field values object with parent work item data
 *
 * @param fieldValues - Object mapping field names to template strings
 * @param parentWorkItem - Parent work item data
 * @param customFields - Optional custom field values from parent
 * @returns Object with interpolated values
 *
 * @example
 * interpolateFieldValues(
 *   {
 *     patient_id: "{parent.custom.patient_id}",
 *     facility: "{parent.custom.facility}"
 *   },
 *   parentWorkItem,
 *   { patient_id: "P12345", facility: "Main Campus" }
 * )
 * // Returns: { patient_id: "P12345", facility: "Main Campus" }
 */
export function interpolateFieldValues(
  fieldValues: Record<string, string>,
  parentWorkItem: WorkItemForInterpolation,
  customFields?: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [fieldName, template] of Object.entries(fieldValues)) {
    result[fieldName] = interpolateTemplate(template, parentWorkItem, customFields);
  }

  return result;
}

/**
 * Extract inherit fields from parent work item
 *
 * @param inheritFields - Array of field names to inherit
 * @param parentWorkItem - Parent work item data
 * @param customFields - Optional custom field values from parent
 * @returns Object with inherited field values
 *
 * @example
 * extractInheritFields(
 *   ["assigned_to", "due_date"],
 *   { assigned_to: "user-123", due_date: new Date("2025-12-31") },
 *   {}
 * )
 * // Returns: { assigned_to: "user-123", due_date: "2025-12-31" }
 */
export function extractInheritFields(
  inheritFields: string[],
  parentWorkItem: WorkItemForInterpolation,
  customFields?: Record<string, unknown>
): Record<string, string | Date | null> {
  const result: Record<string, string | Date | null> = {};

  for (const fieldName of inheritFields) {
    // Check standard fields first
    if (fieldName in parentWorkItem) {
      const value = parentWorkItem[fieldName];

      // Only inherit non-null values
      if (value !== null && value !== undefined) {
        result[fieldName] = value as string | Date | null;
      }
    }
    // Check custom fields
    else if (customFields && fieldName in customFields) {
      const value = customFields[fieldName];

      // Only inherit non-null values
      if (value !== null && value !== undefined) {
        // Convert to appropriate type
        if (value instanceof Date) {
          result[fieldName] = value;
        } else {
          result[fieldName] = String(value);
        }
      }
    }
  }

  return result;
}

/**
 * Validate template string for syntax errors
 * Checks for unclosed braces and invalid token formats
 *
 * @param template - Template string to validate
 * @returns Validation result with errors if any
 *
 * @example
 * validateTemplate("{parent.subject}")
 * // Returns: { valid: true, errors: [] }
 *
 * @example
 * validateTemplate("{parent.subject")
 * // Returns: { valid: false, errors: ["Unclosed brace in template"] }
 */
export function validateTemplate(template: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for unclosed braces
  const openBraces = (template.match(/\{/g) || []).length;
  const closeBraces = (template.match(/\}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push('Unclosed brace in template');
  }

  // Check for invalid token patterns
  const invalidTokens = template.match(/\{(?!parent\.(\w+|custom\.\w+)\})[^}]*\}/g);
  if (invalidTokens && invalidTokens.length > 0) {
    errors.push(
      `Invalid token format: ${invalidTokens.join(', ')}. Use {parent.field_name} or {parent.custom.field_name}`
    );
  }

  // Check for nested braces
  if (/\{[^}]*\{/.test(template)) {
    errors.push('Nested braces are not supported');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
