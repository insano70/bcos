/**
 * Monitoring Types
 *
 * TypeScript interfaces and types for the monitoring and metrics system.
 */

/**
 * Response time percentile statistics
 */
export interface PercentileStats {
  p50: number; // Median response time (ms)
  p95: number; // 95th percentile (ms)
  p99: number; // 99th percentile (ms)
  avg: number; // Average response time (ms)
  min: number; // Minimum response time (ms)
  max: number; // Maximum response time (ms)
  count: number; // Number of samples
}

/**
 * Metrics snapshot from MetricsCollector
 * Represents current state of application metrics
 * Separates standard API metrics from analytics to prevent skewing
 */
export interface MetricsSnapshot {
  timestamp: string;
  collectionDurationMs: number;
  timeSinceLastSnapshot: number;

  // Standard API metrics (CRUD operations, user-facing)
  requests: {
    total: number;
    perSecond: number;
    byEndpoint: Record<string, number>;
  };

  errors: {
    total: number;
    rate: number; // Percentage (0-100)
    byEndpoint: Record<string, number>;
    byType: Record<string, number>;
  };

  responseTime: PercentileStats; // For standard API only

  slowRequests: {
    count: number;
    threshold: number; // 1000ms for standard
    byEndpoint: Record<string, number>;
  };

  // Analytics API metrics (dashboards, charts, complex queries)
  analytics: {
    requests: {
      total: number;
      byEndpoint: Record<string, number>;
    };
    responseTime: PercentileStats;
    errors: {
      total: number;
      rate: number; // Percentage (0-100)
      byEndpoint: Record<string, number>;
    };
    slowRequests: {
      count: number;
      threshold: number; // 5000ms for analytics
      byEndpoint: Record<string, number>;
    };
  };

  cache: {
    hits: number;
    misses: number;
    hitRate: number; // Percentage (0-100)
    total: number;
  };

  security: {
    events: Record<string, number>;
    totalEvents: number;
    rateLimitBlocks: number;
    failedLogins: number;
  };

  activeUsers: {
    count: number;
    since: string;
  };

  topEndpoints: Array<{ endpoint: string; count: number }>;
  topErrorEndpoints: Array<{ endpoint: string; errors: number }>;
  slowestEndpoints: Array<{ endpoint: string; avgDuration: number; count: number }>;
}

/**
 * System health score factors
 */
export interface HealthFactors {
  uptime: 'healthy' | 'degraded' | 'unhealthy';
  errorRate: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: 'healthy' | 'degraded' | 'unhealthy';
  cachePerformance: 'healthy' | 'degraded' | 'unhealthy';
  databaseLatency: 'healthy' | 'degraded' | 'unhealthy';
}

/**
 * System health score calculation result
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number; // 0-100
  factors: HealthFactors;
}

/**
 * Complete monitoring metrics for API response
 * Includes system health, performance metrics, and Redis stats
 * Separates standard API from analytics to prevent skewing
 */
export interface MonitoringMetrics {
  timestamp: string;
  timeRange: string;

  systemHealth: SystemHealth;

  // Standard API performance (CRUD, user-facing operations)
  performance: {
    requests: {
      total: number;
      perSecond: number;
      byEndpoint: Record<string, number>;
    };
    responseTime: PercentileStats & {
      byEndpoint: Record<string, PercentileStats>;
    };
    errors: {
      total: number;
      rate: number;
      byEndpoint: Record<string, number>;
      byType: Record<string, number>;
    };
    slowRequests: {
      count: number;
      threshold: number; // 1000ms
      endpoints: string[];
    };
  };

  // Analytics performance (dashboards, charts, complex queries)
  analytics: {
    requests: {
      total: number;
      byEndpoint: Record<string, number>;
    };
    responseTime: PercentileStats;
    errors: {
      total: number;
      rate: number;
      byEndpoint: Record<string, number>;
    };
    slowRequests: {
      count: number;
      threshold: number; // 5000ms
      endpoints: string[];
    };
  };

  cache: {
    hitRate: number;
    hits: number;
    misses: number;
    opsPerSec: number;
  };

  security: {
    failedLogins: number;
    rateLimitBlocks: number;
    csrfBlocks: number;
    suspiciousUsers: number;
    lockedAccounts: number;
  };

  activeUsers: {
    current: number;
    peak?: number;
    peakTime?: string;
  };
}

/**
 * Redis cache statistics
 */
export interface RedisStats {
  connected: boolean;
  uptime: number; // seconds
  memory: {
    used: number; // MB
    total: number; // MB
    peak: number; // MB
    percentage: number;
    fragmentation: number;
  };
  keys: {
    total: number;
    byPattern: Record<string, number>;
  };
  stats: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    opsPerSec: number;
    connectedClients: number;
    evictedKeys: number;
    expiredKeys: number;
    totalCommands: number;
  };
  commandStats: Record<string, number>;
}

/**
 * Redis key information
 */
export interface RedisKeyInfo {
  key: string;
  type: string;
  ttl: number; // seconds, -1 = no expiry
  size: number; // bytes
}

/**
 * Redis key details with value
 */
export interface RedisKeyDetails extends RedisKeyInfo {
  value: unknown;
  encoding?: string;
}

/**
 * Redis keys search response
 */
export interface RedisKeysResponse {
  keys: RedisKeyInfo[];
  totalCount: number;
  page: number;
  limit: number;
  pattern: string;
}

/**
 * Redis purge operation result
 */
export interface RedisPurgeResult {
  success: boolean;
  keysDeleted: number;
  pattern: string;
  preview: boolean;
  keys?: string[] | undefined;
}

/**
 * Redis TTL update result
 */
export interface RedisTTLUpdateResult {
  success: boolean;
  keysUpdated: number;
  pattern: string;
  ttl: number;
}

/**
 * At-risk user information
 */
export interface AtRiskUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  failedAttempts: number;
  lastFailedAttempt: string | null;
  lockedUntil: string | null;
  suspiciousActivity: boolean;
  lockoutReason: string | null;
  riskScore: number; // 0-100
  riskFactors: string[];
  recentAttempts24h: number;
  uniqueIPs7d: number;
}

/**
 * Security event
 */
export interface SecurityEvent {
  id: string;
  timestamp: string;
  event: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  threat?: string;
  blocked: boolean;
  details: Record<string, unknown>;
  message: string;
}

/**
 * Slow query information
 */
export interface SlowQuery {
  timestamp: string;
  operation: string;
  table: string;
  duration: number;
  recordCount: number;
  correlationId?: string;
  userId?: string;
}

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  timestamp: string;
  level: string;
  message: string;
  operation: string;
  endpoint: string;
  statusCode: number;
  userId?: string;
  correlationId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Security events API response
 */
export interface SecurityEventsResponse {
  events: SecurityEvent[];
  totalCount: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  timeRange: string;
}

/**
 * At-risk users API response
 */
export interface AtRiskUsersResponse {
  users: AtRiskUser[];
  totalCount: number;
  summary: {
    locked: number;
    suspicious: number;
    monitoring: number;
  };
}

/**
 * Login attempt record
 */
export interface LoginAttempt {
  attemptId: string;
  email: string;
  userId?: string | undefined;
  ipAddress: string;
  userAgent?: string | undefined;
  deviceFingerprint?: string | undefined;
  success: boolean;
  failureReason?: string | undefined;
  rememberMeRequested: boolean;
  sessionId?: string | undefined;
  attemptedAt: string;
}

/**
 * Login history API response
 */
export interface LoginHistoryResponse {
  userId: string;
  attempts: LoginAttempt[];
  totalCount: number;
  summary: {
    totalAttempts: number;
    successfulLogins: number;
    failedAttempts: number;
    uniqueIPs: number;
    mostRecentSuccess?: string | undefined;
    mostRecentFailure?: string | undefined;
  };
}

/**
 * Performance data point for time-series charts
 */
export interface PerformanceDataPoint {
  timestamp: string;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  requestCount: number;
  errorCount: number;
  errorRate: number;
}

/**
 * Performance history response
 */
export interface PerformanceHistoryResponse {
  dataPoints: PerformanceDataPoint[];
  interval: string;
  category: 'standard' | 'analytics';
  timeRange: string;
}

/**
 * Slow queries API response
 */
export interface SlowQueriesResponse {
  queries: SlowQuery[];
  totalCount: number;
  avgDuration: number;
  slowThreshold: number;
  summary: {
    byTable: Record<string, { count: number; avgDuration: number }>;
    byOperation: Record<string, number>;
  };
}

/**
 * Errors API response
 */
export interface ErrorsResponse {
  errors: ErrorLogEntry[];
  totalCount: number;
  summary: {
    byEndpoint: Record<string, number>;
    byType: Record<string, number>;
    byStatusCode: Record<number, number>;
  };
  timeRange: string;
}

