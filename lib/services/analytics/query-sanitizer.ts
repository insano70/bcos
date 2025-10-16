/**
 * Query Sanitizer Module
 *
 * Provides sanitization and value validation for SQL query parameters.
 * Used by both cache and legacy query paths.
 *
 * SECURITY:
 * - Validates and sanitizes all filter values
 * - Prevents SQL injection via value sanitization
 * - Validates operator-specific value formats (arrays for IN, etc.)
 * - Safe string patterns allow common characters but block SQL injection
 *
 * KEY METHODS:
 * - sanitizeValue(): Main entry point for value sanitization
 * - sanitizeSingleValue(): Type-specific sanitization logic
 * - isSafeString(): Checks if string contains only safe characters
 * - isValidDateString(): Validates YYYY-MM-DD date format
 */

/**
 * Query sanitizer for SQL values
 * Shared by both cache and legacy query paths
 */
export class QuerySanitizer {
  /**
   * Sanitize and validate filter values
   * Handles arrays for IN/NOT IN and BETWEEN operators
   *
   * @param value - Value to sanitize
   * @param operator - SQL operator (in, not_in, between, etc.)
   * @returns Sanitized value
   * @throws Error if value format doesn't match operator requirements
   */
  sanitizeValue(value: unknown, operator: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle array values for IN/NOT IN operators
    if (operator === 'in' || operator === 'not_in') {
      if (!Array.isArray(value)) {
        throw new Error(`${operator} operator requires array value`);
      }
      return value.map((v) => this.sanitizeSingleValue(v));
    }

    // Handle BETWEEN operator
    if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error('BETWEEN operator requires array with exactly 2 values');
      }
      return value.map((v) => this.sanitizeSingleValue(v));
    }

    return this.sanitizeSingleValue(value);
  }

  /**
   * Sanitize individual values based on type
   * Handles strings, numbers, and dates
   *
   * SECURITY:
   * - For strings: validates safe characters or strips SQL injection chars
   * - For numbers: validates finite values
   * - For dates: converts to YYYY-MM-DD format
   *
   * @param value - Value to sanitize
   * @returns Sanitized value
   * @throws Error if number is not finite
   */
  private sanitizeSingleValue(value: unknown): unknown {
    if (typeof value === 'string') {
      // For date strings, validate format and return as-is if valid
      if (this.isValidDateString(value)) {
        return value;
      }

      // Check if the string contains only safe characters
      if (this.isSafeString(value)) {
        return value; // Return as-is if safe
      }

      // For potentially unsafe strings, only remove truly dangerous SQL injection characters
      // Be much more conservative - only remove actual SQL injection threats
      return value.replace(/[';\\x00\\n\\r\\x1a"\\]/g, '');
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Invalid number value');
      }
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    }

    return value;
  }

  /**
   * Check if value is a safe string (contains only safe characters)
   * Allows alphanumeric, spaces, hyphens, underscores, and common punctuation
   *
   * @param value - String to check
   * @returns true if string is safe
   */
  private isSafeString(value: string): boolean {
    // Allow alphanumeric characters, spaces, hyphens, underscores, and common punctuation
    // This is much more permissive than blocking approach
    const safePattern = /^[a-zA-Z0-9\s\-_.,()&]+$/;
    return safePattern.test(value);
  }

  /**
   * Validate if a string is a valid date format (YYYY-MM-DD)
   *
   * @param dateString - String to validate
   * @returns true if valid YYYY-MM-DD format
   */
  private isValidDateString(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const date = new Date(dateString);
    return (
      date instanceof Date &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().split('T')[0] === dateString
    );
  }
}

// Export singleton instance
export const querySanitizer = new QuerySanitizer();
