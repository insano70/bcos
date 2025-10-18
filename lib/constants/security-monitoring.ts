/**
 * Security Monitoring Constants
 *
 * Centralized configuration for security monitoring operations.
 * Used across security monitoring services and routes.
 */

/**
 * Query and pagination limits for security monitoring endpoints
 */
export const SECURITY_MONITORING_LIMITS = {
  /** Default page size for queries */
  DEFAULT_PAGE_SIZE: 50,

  /** Maximum page size to prevent excessive resource usage */
  MAX_PAGE_SIZE: 500,

  /** Maximum risk score value (0-100) */
  MAX_RISK_SCORE: 100,
} as const;

/**
 * Time constants for security monitoring queries
 */
export const SECURITY_MONITORING_TIME = {
  /** Milliseconds in one hour */
  MS_PER_HOUR: 60 * 60 * 1000,

  /** Milliseconds in one day */
  MS_PER_DAY: 24 * 60 * 60 * 1000,

  /** Milliseconds in one week */
  MS_PER_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * UUID validation regex (RFC 4122 compliant)
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fallback monitoring metrics for degraded state
 * Used when metrics collection fails to ensure dashboard remains responsive
 */
export const FALLBACK_MONITORING_METRICS = {
  timestamp: '', // Will be set at runtime
  timeRange: '5m',
  systemHealth: {
    status: 'degraded',
    score: 50,
    factors: {
      uptime: 'degraded',
      errorRate: 'degraded',
      responseTime: 'degraded',
      cachePerformance: 'degraded',
      databaseLatency: 'degraded',
    },
  },
  performance: {
    requests: { total: 0, perSecond: 0, byEndpoint: {} },
    responseTime: {
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
      count: 0,
      byEndpoint: {},
    },
    errors: { total: 0, rate: 0, byEndpoint: {}, byType: {} },
    slowRequests: { count: 0, threshold: 1000, endpoints: [] },
  },
  analytics: {
    requests: { total: 0, byEndpoint: {} },
    responseTime: {
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
      min: 0,
      max: 0,
      count: 0,
    },
    errors: { total: 0, rate: 0, byEndpoint: {} },
    slowRequests: { count: 0, threshold: 5000, endpoints: [] },
  },
  cache: { hitRate: 0, hits: 0, misses: 0, opsPerSec: 0 },
  security: {
    failedLogins: 0,
    rateLimitBlocks: 0,
    csrfBlocks: 0,
    suspiciousUsers: 0,
    lockedAccounts: 0,
  },
  activeUsers: { current: 0 },
};
