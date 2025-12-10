/**
 * Work Items Constants
 *
 * Centralized constants for the work items system.
 * Eliminates magic strings and numbers throughout the codebase.
 */

// ============================================================
// PERMISSIONS
// ============================================================

/**
 * Work item permission strings
 * Use these constants instead of hardcoded strings
 */
export const WORK_ITEM_PERMISSIONS = {
  // Read permissions
  READ_ALL: 'work-items:read:all',
  READ_ORGANIZATION: 'work-items:read:organization',
  READ_OWN: 'work-items:read:own',

  // Create permissions
  CREATE_ORGANIZATION: 'work-items:create:organization',
  CREATE_OWN: 'work-items:create:own',

  // Update permissions
  UPDATE_ALL: 'work-items:update:all',
  UPDATE_ORGANIZATION: 'work-items:update:organization',
  UPDATE_OWN: 'work-items:update:own',

  // Delete permissions
  DELETE_ALL: 'work-items:delete:all',
  DELETE_ORGANIZATION: 'work-items:delete:organization',
  DELETE_OWN: 'work-items:delete:own',

  // Manage permissions (for types, statuses, etc.)
  MANAGE_ALL: 'work-items:manage:all',
  MANAGE_ORGANIZATION: 'work-items:manage:organization',
} as const;

/**
 * Permission arrays for common use cases
 */
export const WORK_ITEM_PERMISSION_SETS = {
  READ: [
    WORK_ITEM_PERMISSIONS.READ_OWN,
    WORK_ITEM_PERMISSIONS.READ_ORGANIZATION,
    WORK_ITEM_PERMISSIONS.READ_ALL,
  ],
  CREATE: [
    WORK_ITEM_PERMISSIONS.CREATE_OWN,
    WORK_ITEM_PERMISSIONS.CREATE_ORGANIZATION,
  ],
  UPDATE: [
    WORK_ITEM_PERMISSIONS.UPDATE_OWN,
    WORK_ITEM_PERMISSIONS.UPDATE_ORGANIZATION,
    WORK_ITEM_PERMISSIONS.UPDATE_ALL,
  ],
  DELETE: [
    WORK_ITEM_PERMISSIONS.DELETE_OWN,
    WORK_ITEM_PERMISSIONS.DELETE_ORGANIZATION,
    WORK_ITEM_PERMISSIONS.DELETE_ALL,
  ],
  MANAGE: [
    WORK_ITEM_PERMISSIONS.MANAGE_ORGANIZATION,
    WORK_ITEM_PERMISSIONS.MANAGE_ALL,
  ],
} as const;

// ============================================================
// CACHE TIMES
// ============================================================

/**
 * React Query cache configuration (in milliseconds)
 */
export const WORK_ITEM_CACHE_TIMES = {
  /** Time before data is considered stale - 5 minutes */
  STALE_TIME: 5 * 60 * 1000,
  /** Time before garbage collection - 10 minutes */
  GC_TIME: 10 * 60 * 1000,
  /** Comments stale time - 2 minutes (changes frequently) */
  COMMENTS_STALE_TIME: 2 * 60 * 1000,
  /** Comments GC time - 5 minutes */
  COMMENTS_GC_TIME: 5 * 60 * 1000,
  /** Activity stale time - 1 minute (frequently updated) */
  ACTIVITY_STALE_TIME: 1 * 60 * 1000,
  /** Activity GC time - 5 minutes */
  ACTIVITY_GC_TIME: 5 * 60 * 1000,
} as const;

// ============================================================
// PAGINATION
// ============================================================

/**
 * Pagination defaults
 */
export const WORK_ITEM_PAGINATION = {
  /** Default page size */
  DEFAULT_LIMIT: 50,
  /** Maximum allowed page size */
  MAX_LIMIT: 1000,
  /** Default offset */
  DEFAULT_OFFSET: 0,
} as const;

// ============================================================
// PRIORITY
// ============================================================

/**
 * Work item priority levels
 */
export const WORK_ITEM_PRIORITIES = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[keyof typeof WORK_ITEM_PRIORITIES];

// ============================================================
// STATUS CATEGORIES
// ============================================================

/**
 * Work item status categories
 */
export const WORK_ITEM_STATUS_CATEGORIES = {
  BACKLOG: 'backlog',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type WorkItemStatusCategory =
  (typeof WORK_ITEM_STATUS_CATEGORIES)[keyof typeof WORK_ITEM_STATUS_CATEGORIES];

// ============================================================
// HIERARCHY
// ============================================================

/**
 * Hierarchy constraints
 */
export const WORK_ITEM_HIERARCHY = {
  /** Maximum nesting depth for work items */
  MAX_DEPTH: 10,
} as const;

