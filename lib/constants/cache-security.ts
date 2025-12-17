/**
 * Cache Security Constants
 *
 * Centralized security configuration for the caching system.
 * All schema whitelists and validation patterns are defined here
 * to ensure consistency across all cache warming services.
 *
 * SECURITY: Changes to this file should be reviewed carefully
 * as they affect SQL injection protection.
 */

/**
 * Allowed schemas for analytics data sources
 *
 * These schemas are whitelisted for cache warming queries.
 * Any schema not in this list will be rejected.
 *
 * - 'ih': Main analytics schema (Intelligence Hub)
 * - 'public': Standard PostgreSQL public schema (for table-based sources)
 */
export const ALLOWED_ANALYTICS_SCHEMAS = ['ih', 'public'] as const;

/**
 * Type for allowed schema names
 */
export type AllowedAnalyticsSchema = (typeof ALLOWED_ANALYTICS_SCHEMAS)[number];

/**
 * Validate if a schema name is allowed
 *
 * @param schemaName - Schema name to validate
 * @returns true if schema is in the whitelist
 */
export function isSchemaAllowed(schemaName: string): schemaName is AllowedAnalyticsSchema {
  return (ALLOWED_ANALYTICS_SCHEMAS as readonly string[]).includes(schemaName);
}

/**
 * Table name validation pattern
 *
 * Matches valid PostgreSQL identifier names:
 * - Must start with a letter (a-z, A-Z) or underscore
 * - Can contain letters, digits, and underscores
 * - Case-insensitive matching
 *
 * This pattern prevents SQL injection by ensuring table names
 * contain only safe characters that can't break out of quoted identifiers.
 */
export const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate if a table name is safe for use in SQL
 *
 * @param tableName - Table name to validate
 * @returns true if table name matches the safe pattern
 */
export function isTableNameValid(tableName: string): boolean {
  return TABLE_NAME_PATTERN.test(tableName);
}

/**
 * Build a safe SQL identifier for schema.table
 *
 * ALWAYS uses quoted identifiers to prevent SQL injection.
 * This is the ONLY way to construct schema.table references
 * in cache warming queries.
 *
 * @param schemaName - Validated schema name
 * @param tableName - Validated table name
 * @returns Quoted identifier string like "schema"."table"
 * @throws Error if schema or table name is invalid
 */
export function buildSafeTableReference(schemaName: string, tableName: string): string {
  if (!isSchemaAllowed(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Allowed schemas: ${ALLOWED_ANALYTICS_SCHEMAS.join(', ')}`
    );
  }

  if (!isTableNameValid(tableName)) {
    throw new Error(
      `Invalid table name format: ${tableName}. Must match pattern: ${TABLE_NAME_PATTERN.source}`
    );
  }

  // Always use quoted identifiers for safety
  return `"${schemaName}"."${tableName}"`;
}

/**
 * Cache warming lock key patterns
 *
 * Standardized lock key format for distributed locking.
 * Uses Redis hash tags {ds:id} for cluster compatibility.
 */
export const LOCK_KEY_PREFIX = 'lock:cache:warm';

/**
 * Build a standardized lock key for cache warming
 *
 * @param datasourceId - Data source ID
 * @returns Lock key in format: lock:cache:warm:{ds:id}
 */
export function buildWarmingLockKey(datasourceId: number): string {
  return `${LOCK_KEY_PREFIX}:{ds:${datasourceId}}`;
}




