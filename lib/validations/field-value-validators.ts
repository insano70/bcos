import { z } from 'zod';

/**
 * Format-Specific Field Value Validators
 * Provides validation for specialized field types (URL, email, phone, currency, percentage)
 */

/**
 * URL validation
 * Validates URLs with proper protocol and structure
 */
export const urlFieldValueSchema = z
  .string()
  .url('Invalid URL format')
  .max(2000, 'URL must not exceed 2000 characters');

/**
 * Email validation
 * Validates email addresses using standard format
 */
export const emailFieldValueSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email must not exceed 255 characters');

/**
 * Phone validation
 * Validates phone numbers (international format supported)
 * Accepts: +1234567890, (123) 456-7890, 123-456-7890, etc.
 */
export const phoneFieldValueSchema = z
  .string()
  .regex(
    /^[\d\s()+.-]+$/,
    'Phone number can only contain digits, spaces, parentheses, plus signs, and hyphens'
  )
  .min(7, 'Phone number must be at least 7 characters')
  .max(20, 'Phone number must not exceed 20 characters');

/**
 * Currency validation
 * Validates currency amounts (supports up to 2 decimal places)
 */
export const currencyFieldValueSchema = z
  .number()
  .finite('Currency value must be a valid number')
  .safe('Currency value is too large')
  .refine((val) => {
    const decimalPlaces = (val.toString().split('.')[1] || '').length;
    return decimalPlaces <= 2;
  }, 'Currency value must have at most 2 decimal places');

/**
 * Percentage validation
 * Validates percentage values (0-100 with up to 2 decimal places)
 */
export const percentageFieldValueSchema = z
  .number()
  .min(0, 'Percentage must be at least 0')
  .max(100, 'Percentage must not exceed 100')
  .refine((val) => {
    const decimalPlaces = (val.toString().split('.')[1] || '').length;
    return decimalPlaces <= 2;
  }, 'Percentage must have at most 2 decimal places');

/**
 * Rich text validation
 * Validates rich text content (HTML)
 * Note: Sanitization happens on the backend, this just validates length
 */
export const richTextFieldValueSchema = z
  .string()
  .max(50000, 'Rich text content must not exceed 50000 characters');

/**
 * Multi-select validation
 * Validates multi-select values (array of strings)
 */
export const multiSelectFieldValueSchema = z
  .array(z.string().max(255, 'Option value must not exceed 255 characters'))
  .min(1, 'At least one option must be selected')
  .max(100, 'Cannot select more than 100 options');

/**
 * Attachment field validation
 * Validates attachment field values (object with attachment_ids array)
 */
export const attachmentFieldValueSchema = z.object({
  attachment_ids: z
    .array(z.string().uuid('Invalid attachment ID'))
    .min(0, 'Attachment IDs must be a valid array')
    .max(100, 'Cannot have more than 100 attachments per field'),
});

/**
 * Field value validator factory
 * Returns the appropriate validator for a given field type
 */
export function getFieldValueValidator(fieldType: string): z.ZodType<unknown> {
  switch (fieldType) {
    case 'url':
      return urlFieldValueSchema;
    case 'email':
      return emailFieldValueSchema;
    case 'phone':
      return phoneFieldValueSchema;
    case 'currency':
      return currencyFieldValueSchema;
    case 'percentage':
      return percentageFieldValueSchema;
    case 'rich_text':
      return richTextFieldValueSchema;
    case 'multi_select':
      return multiSelectFieldValueSchema;
    case 'attachment':
      return attachmentFieldValueSchema;
    case 'text':
      return z.string().max(5000, 'Text must not exceed 5000 characters');
    case 'number':
      return z.number().finite('Number must be valid').safe('Number is too large');
    case 'date':
      return z.string().datetime('Invalid date format');
    case 'datetime':
      return z.string().datetime('Invalid datetime format');
    case 'checkbox':
      return z.boolean();
    case 'dropdown':
      return z.string().max(255, 'Dropdown value must not exceed 255 characters');
    case 'user_picker':
      return z.string().uuid('Invalid user ID');
    default:
      return z.unknown();
  }
}

/**
 * Validate field value
 * Validates a field value against the appropriate schema for its field type
 */
export function validateFieldValue(fieldType: string, value: unknown): boolean {
  try {
    const validator = getFieldValueValidator(fieldType);
    validator.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get field value validation error
 * Returns validation error message or null if valid
 */
export function getFieldValueValidationError(fieldType: string, value: unknown): string | null {
  try {
    const validator = getFieldValueValidator(fieldType);
    validator.parse(value);
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.issues[0]?.message ?? 'Validation failed';
    }
    return 'Validation failed';
  }
}
