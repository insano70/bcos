import type { WorkItem } from '@/lib/hooks/use-work-items';
import { log } from '@/lib/logger';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Custom rule operator type
 */
export type RuleOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';

/**
 * Custom rule interface
 */
export interface CustomRule {
  field: string;
  operator: RuleOperator;
  value: string;
  message?: string;
}

/**
 * Validation config interface
 */
export interface ValidationConfig {
  required_fields?: string[];
  custom_rules?: CustomRule[];
}

/**
 * Status transition interface
 */
export interface StatusTransition {
  work_item_status_transition_id: string;
  from_status_id: string;
  to_status_id: string;
  is_allowed: boolean;
  validation_config: ValidationConfig | null;
  action_config: Record<string, unknown> | null;
}

/**
 * Validate transition conditions
 *
 * Checks:
 * 1. Required fields are present
 * 2. Custom rules pass
 *
 * @param workItem - The work item being transitioned
 * @param transition - The transition configuration
 * @returns ValidationResult with valid flag and error messages
 */
export function validateTransitionConditions(
  workItem: WorkItem,
  transition: StatusTransition
): ValidationResult {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    log.info('Validating transition conditions', {
      work_item_id: workItem.id,
      transition_id: transition.work_item_status_transition_id,
      from_status_id: transition.from_status_id,
      to_status_id: transition.to_status_id,
    });

    const validationConfig = transition.validation_config;

    // If no validation config, transition is valid
    if (!validationConfig) {
      log.info('No validation config - transition valid', {
        work_item_id: workItem.id,
        duration: Date.now() - startTime,
      });
      return { valid: true, errors: [] };
    }

    // Check required fields
    if (validationConfig.required_fields && validationConfig.required_fields.length > 0) {
      const missingFields = checkRequiredFields(workItem, validationConfig.required_fields);
      if (missingFields.length > 0) {
        errors.push(
          `Missing required fields: ${missingFields.join(', ')}. Please fill in these fields before transitioning.`
        );
      }
    }

    // Check custom rules
    if (validationConfig.custom_rules && validationConfig.custom_rules.length > 0) {
      const ruleErrors = checkCustomRules(workItem, validationConfig.custom_rules);
      errors.push(...ruleErrors);
    }

    const valid = errors.length === 0;
    const duration = Date.now() - startTime;

    log.info('Transition validation completed', {
      work_item_id: workItem.id,
      valid,
      errorCount: errors.length,
      duration,
    });

    return { valid, errors };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to validate transition conditions', error, {
      work_item_id: workItem.id,
      transition_id: transition.work_item_status_transition_id,
      duration,
    });

    // Return invalid with generic error message
    return {
      valid: false,
      errors: ['Failed to validate transition conditions. Please try again.'],
    };
  }
}

/**
 * Check if required fields are present and non-empty
 *
 * @param workItem - The work item to check
 * @param requiredFields - Array of field names that are required
 * @returns Array of missing field names
 */
function checkRequiredFields(workItem: WorkItem, requiredFields: string[]): string[] {
  const missingFields: string[] = [];

  for (const fieldName of requiredFields) {
    const value = getWorkItemFieldValue(workItem, fieldName);

    if (value === null || value === undefined || value === '') {
      missingFields.push(fieldName);
    }
  }

  return missingFields;
}

/**
 * Check custom validation rules
 *
 * @param workItem - The work item to check
 * @param rules - Array of custom rules to evaluate
 * @returns Array of error messages for failed rules
 */
function checkCustomRules(workItem: WorkItem, rules: CustomRule[]): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    const fieldValue = getWorkItemFieldValue(workItem, rule.field);
    const ruleValue = rule.value;
    const passed = evaluateRule(fieldValue, rule.operator, ruleValue);

    if (!passed) {
      const errorMessage =
        rule.message || `Validation failed: ${rule.field} ${rule.operator} ${rule.value}`;
      errors.push(errorMessage);
    }
  }

  return errors;
}

/**
 * Get field value from work item
 *
 * Supports:
 * - Standard fields (subject, description, priority, assigned_to, due_date, etc.)
 * - Custom fields (via custom_fields object)
 *
 * @param workItem - The work item
 * @param fieldName - The field name to retrieve
 * @returns The field value or null if not found
 */
function getWorkItemFieldValue(
  workItem: WorkItem,
  fieldName: string
): string | number | boolean | null {
  // Check standard fields with explicit type-safe access
  // This approach validates against the WorkItem interface at compile time
  const standardFields: Record<keyof WorkItem, unknown> = {
    id: workItem.id,
    work_item_type_id: workItem.work_item_type_id,
    work_item_type_name: workItem.work_item_type_name,
    organization_id: workItem.organization_id,
    organization_name: workItem.organization_name,
    subject: workItem.subject,
    description: workItem.description,
    status_id: workItem.status_id,
    status_name: workItem.status_name,
    status_category: workItem.status_category,
    priority: workItem.priority,
    assigned_to: workItem.assigned_to,
    assigned_to_name: workItem.assigned_to_name,
    due_date: workItem.due_date,
    started_at: workItem.started_at,
    completed_at: workItem.completed_at,
    created_by: workItem.created_by,
    created_by_name: workItem.created_by_name,
    created_at: workItem.created_at,
    updated_at: workItem.updated_at,
    custom_fields: workItem.custom_fields,
  };

  // Check if field exists in standard fields
  if (fieldName in standardFields) {
    const value = standardFields[fieldName as keyof WorkItem];
    if (value !== undefined && value !== null) {
      // Preserve Date objects as ISO strings for consistent comparison
      if (value instanceof Date) {
        return value.toISOString();
      }
      // Preserve numbers and booleans in their original type for validation
      if (typeof value === 'number') {
        return value;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      return String(value);
    }
  }

  // Check custom fields
  // Use Object.hasOwn to prevent prototype pollution attacks
  if (
    workItem.custom_fields &&
    typeof workItem.custom_fields === 'object' &&
    Object.hasOwn(workItem.custom_fields, fieldName)
  ) {
    const customFieldValue = workItem.custom_fields[fieldName];
    if (customFieldValue !== undefined && customFieldValue !== null) {
      // Apply same type preservation for custom fields
      if (customFieldValue instanceof Date) {
        return customFieldValue.toISOString();
      }
      if (typeof customFieldValue === 'number') {
        return customFieldValue;
      }
      if (typeof customFieldValue === 'boolean') {
        return customFieldValue;
      }
      return String(customFieldValue);
    }
  }

  return null;
}

/**
 * Evaluate a validation rule
 *
 * @param fieldValue - The actual field value from the work item
 * @param operator - The operator to use for comparison
 * @param ruleValue - The expected value from the rule
 * @returns True if the rule passes, false otherwise
 */
function evaluateRule(
  fieldValue: string | number | boolean | null,
  operator: RuleOperator,
  ruleValue: string
): boolean {
  // Handle null/undefined field values
  if (fieldValue === null || fieldValue === undefined) {
    return operator === 'not_equals'; // Only pass if checking for not_equals
  }

  const fieldValueStr = String(fieldValue).toLowerCase();
  const ruleValueStr = ruleValue.toLowerCase();

  switch (operator) {
    case 'equals':
      return fieldValueStr === ruleValueStr;

    case 'not_equals':
      return fieldValueStr !== ruleValueStr;

    case 'greater_than': {
      const fieldNum = Number.parseFloat(fieldValueStr);
      const ruleNum = Number.parseFloat(ruleValueStr);
      if (Number.isNaN(fieldNum) || Number.isNaN(ruleNum)) {
        return false;
      }
      return fieldNum > ruleNum;
    }

    case 'less_than': {
      const fieldNum = Number.parseFloat(fieldValueStr);
      const ruleNum = Number.parseFloat(ruleValueStr);
      if (Number.isNaN(fieldNum) || Number.isNaN(ruleNum)) {
        return false;
      }
      return fieldNum < ruleNum;
    }

    case 'contains':
      return fieldValueStr.includes(ruleValueStr);

    default:
      log.warn('Unknown rule operator', { operator });
      return false;
  }
}
