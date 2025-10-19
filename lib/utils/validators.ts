/**
 * Validation Utilities
 *
 * Centralized validation helpers for input validation across the application.
 * Provides type-safe validation with clear error messages.
 */

import { ValidationError } from '@/lib/api/responses/error';

/**
 * UUID v4 regex pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 *
 * @param id - String to validate
 * @returns True if valid UUID, false otherwise
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Validate UUID and throw error if invalid
 *
 * @param id - String to validate
 * @param fieldName - Name of field for error message (e.g., "work item ID", "organization ID")
 * @throws ValidationError if not a valid UUID
 */
export function validateUUID(id: string, fieldName: string): void {
  if (!isValidUUID(id)) {
    throw ValidationError(null, `Invalid ${fieldName}: must be a valid UUID`);
  }
}

/**
 * Sanitize search string for SQL LIKE queries
 *
 * Escapes special LIKE wildcards (%, _) to prevent unexpected behavior.
 * This prevents users from injecting wildcards that could cause performance
 * issues or unintended search results.
 *
 * @param search - Search string to sanitize
 * @returns Sanitized search string safe for LIKE queries
 */
export function sanitizeSearchString(search: string): string {
  return search
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/%/g, '\\%') // Escape percent signs
    .replace(/_/g, '\\_'); // Escape underscores
}

/**
 * Validate and sanitize search query string
 *
 * Enforces maximum length and sanitizes special characters.
 *
 * @param search - Search query string
 * @param maxLength - Maximum allowed length (default 1000)
 * @returns Sanitized search string
 * @throws ValidationError if search string exceeds max length
 */
export function validateAndSanitizeSearch(search: string, maxLength = 1000): string {
  if (search.length > maxLength) {
    throw ValidationError(null, `Search query too long (maximum ${maxLength} characters)`);
  }

  return sanitizeSearchString(search);
}

/**
 * Validate pagination parameters
 *
 * Ensures limit and offset are within safe bounds.
 *
 * @param limit - Number of items per page
 * @param offset - Number of items to skip
 * @param maxLimit - Maximum allowed limit
 * @returns Validated and clamped pagination parameters
 */
export function validatePagination(
  limit: number | undefined,
  offset: number | undefined,
  maxLimit: number,
  defaultLimit: number
): { limit: number; offset: number } {
  const safeLimit = Math.min(limit || defaultLimit, maxLimit);
  const safeOffset = Math.max(offset || 0, 0); // No negative offsets

  return { limit: safeLimit, offset: safeOffset };
}
