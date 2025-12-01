/**
 * Input Sanitization Utilities for Organizations Service
 *
 * Provides security helpers for user input validation and sanitization.
 * Prevents SQL injection, DoS attacks, and other security vulnerabilities.
 */

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum length for search terms to prevent DoS */
export const MAX_SEARCH_LENGTH = 200;

/** Maximum number of organization IDs in batch operations
 * NOTE: Set to 2500 to accommodate large deployments. For datasets exceeding this,
 * pagination should be implemented in the admin organizations list.
 */
export const MAX_BATCH_SIZE = 2500;

/** Maximum pagination limit to prevent memory exhaustion */
export const MAX_PAGINATION_LIMIT = 1000;

/** Maximum pagination offset before requiring cursor-based pagination */
export const MAX_PAGINATION_OFFSET = 100000;

/** Batch query CTE threshold - use CTE for larger datasets */
export const BATCH_QUERY_CTE_THRESHOLD = 50;

/** Maximum hierarchy traversal depth */
export const MAX_HIERARCHY_DEPTH = 10;

/** Maximum children per level in hierarchy traversal */
export const MAX_CHILDREN_PER_LEVEL = 1000;

/** UUID v4 validation pattern */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// SANITIZATION FUNCTIONS
// ============================================================

/**
 * Sanitize user input for SQL LIKE patterns
 *
 * Escapes special characters to prevent:
 * - Pattern injection attacks
 * - Performance degradation via wildcard abuse
 * - Information disclosure
 *
 * @param input - Raw user search input
 * @returns Sanitized string safe for LIKE patterns
 *
 * @example
 * ```typescript
 * const userInput = "test%_attack";
 * const safe = sanitizeLikePattern(userInput);
 * // safe = "test\\%\\_attack"
 * db.where(like(column, `%${safe}%`));
 * ```
 */
export function sanitizeLikePattern(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Limit length to prevent DoS
  const truncated = input.slice(0, MAX_SEARCH_LENGTH);

  // Escape special LIKE characters
  // Order matters: backslash must be escaped first
  return truncated
    .replace(/\\/g, '\\\\') // Escape backslash
    .replace(/%/g, '\\%') // Escape percent wildcard
    .replace(/_/g, '\\_'); // Escape underscore wildcard
}

/**
 * Validate and sanitize organization IDs array
 *
 * Ensures:
 * - Input is actually an array
 * - Array size is within limits
 * - Each ID is a valid UUID format
 *
 * @param organizationIds - Array of organization IDs to validate
 * @param maxSize - Maximum allowed array size (default: MAX_BATCH_SIZE)
 * @returns Validated array of organization IDs
 * @throws {Error} If validation fails
 *
 * @example
 * ```typescript
 * const ids = validateOrganizationIds(userInput);
 * // Safe to use in database queries
 * ```
 */
export function validateOrganizationIds(
  organizationIds: unknown,
  maxSize: number = MAX_BATCH_SIZE
): string[] {
  // Check if input is an array
  if (!Array.isArray(organizationIds)) {
    throw new Error('organizationIds must be an array');
  }

  // Check array size
  if (organizationIds.length === 0) {
    return [];
  }

  if (organizationIds.length > maxSize) {
    throw new Error(
      `Maximum ${maxSize} organization IDs allowed per request (received ${organizationIds.length})`
    );
  }

  // Validate each ID format
  for (const id of organizationIds) {
    if (typeof id !== 'string') {
      throw new Error(`Invalid organization ID type: expected string, got ${typeof id}`);
    }

    if (!UUID_PATTERN.test(id)) {
      throw new Error(`Invalid organization ID format: ${id}`);
    }
  }

  return organizationIds as string[];
}

/**
 * Validate and sanitize pagination parameters
 *
 * Ensures:
 * - Limit is within acceptable range
 * - Offset is not excessively large
 * - Values are positive integers
 *
 * @param limit - Requested page size
 * @param offset - Requested offset
 * @returns Sanitized pagination parameters
 *
 * @example
 * ```typescript
 * const { limit, offset } = validatePagination(
 *   userInput.limit,
 *   userInput.offset
 * );
 * ```
 */
export function validatePagination(
  limit?: number | null,
  offset?: number | null
): { limit: number; offset: number } {
  // Sanitize limit
  let sanitizedLimit = 100; // Default
  if (limit !== null && limit !== undefined) {
    const parsedLimit = Number(limit);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      throw new Error(`Invalid limit: must be a positive integer`);
    }
    sanitizedLimit = Math.min(parsedLimit, MAX_PAGINATION_LIMIT);
  }

  // Sanitize offset
  let sanitizedOffset = 0; // Default
  if (offset !== null && offset !== undefined) {
    const parsedOffset = Number(offset);
    if (Number.isNaN(parsedOffset) || parsedOffset < 0) {
      throw new Error(`Invalid offset: must be a non-negative integer`);
    }
    if (parsedOffset > MAX_PAGINATION_OFFSET) {
      throw new Error(
        `Offset ${parsedOffset} exceeds maximum ${MAX_PAGINATION_OFFSET}. Use cursor-based pagination for large datasets.`
      );
    }
    sanitizedOffset = parsedOffset;
  }

  return {
    limit: sanitizedLimit,
    offset: sanitizedOffset,
  };
}
