/**
 * Shared TypeScript types for S3 services (public and private assets)
 * 
 * These types are used by both public and private asset systems to ensure
 * consistent behavior and developer experience across all S3 operations.
 */

/**
 * Options for generating S3 keys
 * 
 * Used by both public and private asset systems to control S3 key generation.
 * Provides consistent key generation behavior across all asset types.
 */
export interface GenerateKeyOptions {
  /**
   * Whether to add a unique ID to the filename
   * Uses nanoid to generate a collision-resistant identifier
   * @default true
   */
  addUniqueId?: boolean;

  /**
   * Whether to preserve the original filename exactly (no sanitization)
   * When true, only removes dangerous characters (minimal sanitization)
   * When false, applies full sanitization (lowercase, replace special chars)
   * @default false
   */
  preserveName?: boolean;

  /**
   * Whether to add a timestamp to the filename
   * Useful for versioning and cache-busting
   * @default false
   */
  addTimestamp?: boolean;

  /**
   * Length of the unique ID to generate
   * Longer IDs reduce collision probability but increase filename length
   * @default 10
   */
  uniqueIdLength?: number;
}

