/**
 * User Formatting Utilities
 *
 * Shared utilities for formatting user-related data.
 * Eliminates duplication of name concatenation logic across services.
 */

/**
 * Format first and last name into a full name
 *
 * Returns null if either name is missing to maintain consistent null behavior.
 *
 * @param firstName - User's first name
 * @param lastName - User's last name
 * @returns Full name or null if incomplete
 *
 * @example
 * ```typescript
 * formatUserName('John', 'Doe') // => 'John Doe'
 * formatUserName('John', null) // => null
 * formatUserName(null, 'Doe') // => null
 * formatUserName(null, null) // => null
 * ```
 */
export function formatUserName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string | null {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  return null;
}

/**
 * Format first and last name into a full name, with fallback
 *
 * Returns the fallback value if either name is missing.
 *
 * @param firstName - User's first name
 * @param lastName - User's last name
 * @param fallback - Value to return if name is incomplete (default: '')
 * @returns Full name or fallback
 *
 * @example
 * ```typescript
 * formatUserNameWithFallback('John', 'Doe') // => 'John Doe'
 * formatUserNameWithFallback('John', null) // => ''
 * formatUserNameWithFallback('John', null, 'Unknown') // => 'Unknown'
 * ```
 */
export function formatUserNameWithFallback(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = ''
): string {
  return formatUserName(firstName, lastName) ?? fallback;
}


