/**
 * Cache TTL Constants
 *
 * Centralized TTL (Time-To-Live) configuration for all Redis cache services.
 * Follows best practices: no magic numbers, maintainable configuration.
 *
 * TTL STRATEGY:
 * - Short (< 5 min): Frequently changing data, session-related
 * - Medium (5-60 min): User context, dashboard lists, query results
 * - Long (1-24 hours): Configuration, measure definitions, computed results
 * - Very Long (> 24 hours): Static data, role permissions, analytics data
 */

/**
 * Time duration constants in seconds
 */
export const TIME = {
  MINUTE: 60,
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  HOUR: 3600,
  SIX_HOURS: 21600,
  DAY: 86400,
  TWO_DAYS: 172800,
  THIRTY_DAYS: 30 * 86400,
} as const;

/**
 * Authentication and Session TTLs
 */
export const AUTH_TTL = {
  /** Default auth cache TTL (5 minutes) */
  DEFAULT: TIME.FIVE_MINUTES,
  /** User data cache TTL (5 minutes) */
  USER_DATA: TIME.FIVE_MINUTES,
  /** Blacklist check TTL (1 minute) - frequent checks */
  BLACKLIST_CHECK: TIME.MINUTE,
  /** Blacklist confirmed TTL (1 hour) - after confirming blacklisted */
  BLACKLIST_CONFIRMED: TIME.HOUR,
} as const;

/**
 * RBAC Cache TTLs
 */
export const RBAC_TTL = {
  /** Default RBAC cache TTL (5 minutes) */
  DEFAULT: TIME.FIVE_MINUTES,
  /** User context cache TTL (5 minutes) */
  USER_CONTEXT: TIME.FIVE_MINUTES,
  /** Role permissions cache TTL (24 hours) - rarely changes */
  ROLE_PERMISSIONS: TIME.DAY,
  /** Organization hierarchy TTL (30 days) - self-refreshing, safety net */
  ORGANIZATION_HIERARCHY: TIME.THIRTY_DAYS,
} as const;

/**
 * Analytics Cache TTLs
 */
export const ANALYTICS_TTL = {
  /** Default analytics cache TTL (1 hour) */
  DEFAULT: TIME.HOUR,
  /** Data source columns TTL (1 hour) */
  DATASOURCE_COLUMNS: TIME.HOUR,
  /** Dashboard list TTL (15 minutes) */
  DASHBOARD_LIST: TIME.FIFTEEN_MINUTES,
  /** Chart definition TTL (1 hour) */
  CHART_DEFINITION: TIME.HOUR,
  /** Chart config TTL (24 hours) */
  CHART_CONFIG: TIME.DAY,
  /** Indexed analytics data TTL (48 hours) - expensive to compute */
  INDEXED_DATA: TIME.TWO_DAYS,
  /** Data explorer query results (15 minutes) */
  DATA_EXPLORER: TIME.FIFTEEN_MINUTES,
} as const;

/**
 * Report Card Cache TTLs
 */
export const REPORT_CARD_TTL = {
  /** Default report card cache TTL (1 hour) */
  DEFAULT: TIME.HOUR,
  /** Organization report card TTL (1 hour) */
  ORG_REPORT_CARD: TIME.HOUR,
  /** Peer comparison stats TTL (6 hours) - aggregate data, less volatile */
  PEER_STATS: TIME.SIX_HOURS,
  /** Measure config TTL (1 hour) */
  MEASURES: TIME.HOUR,
  /** Annual review TTL (6 hours) - expensive to compute */
  ANNUAL_REVIEW: TIME.SIX_HOURS,
} as const;

/**
 * Job and Lock TTLs
 */
export const JOB_TTL = {
  /** Active job TTL (1 hour) */
  ACTIVE_JOB: TIME.HOUR,
  /** Recent jobs history TTL (24 hours) */
  RECENT_JOBS: TIME.DAY,
  /** Distributed lock TTL (5 minutes) */
  LOCK: TIME.FIVE_MINUTES,
  /** Temporary key TTL for set operations (10 seconds) */
  TEMP_KEY: 10,
} as const;





