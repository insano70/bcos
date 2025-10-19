/**
 * Work Items Service Constants
 *
 * Centralized constants for work items services to avoid magic numbers
 * and ensure consistency across the codebase.
 */

/**
 * Work item constraints and limits
 */
export const WORK_ITEM_CONSTRAINTS = {
  /**
   * Maximum hierarchy depth for parent-child relationships
   * Prevents infinite nesting and maintains query performance
   */
  MAX_HIERARCHY_DEPTH: 10,

  /**
   * Default number of items to return per page
   */
  DEFAULT_PAGE_LIMIT: 50,

  /**
   * Maximum number of items allowed per page
   * Prevents excessive database load and memory usage
   */
  MAX_PAGE_LIMIT: 500,

  /**
   * Maximum length for search queries
   * Prevents abuse and ensures reasonable query performance
   */
  MAX_SEARCH_LENGTH: 1000,
} as const;
