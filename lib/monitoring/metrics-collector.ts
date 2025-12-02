/**
 * Metrics Collector
 *
 * In-memory metrics collection service for real-time monitoring dashboard.
 * Collects metrics from application logs and provides aggregated snapshots.
 *
 * FEATURES:
 * - Request counting by endpoint
 * - Error tracking by endpoint and type
 * - Response time tracking with percentile calculation
 * - Cache hit/miss tracking
 * - Security event counting
 * - 5-minute rolling window (configurable)
 *
 * USAGE:
 * ```typescript
 * import { metricsCollector } from '@/lib/monitoring/metrics-collector';
 *
 * // Record metrics (called automatically from logger)
 * metricsCollector.recordRequest('/api/users', 245, 200);
 * metricsCollector.recordCacheHit();
 * metricsCollector.recordSecurityEvent('rate_limit_exceeded');
 *
 * // Get snapshot for dashboard
 * const snapshot = metricsCollector.getSnapshot();
 * ```
 */

import type { EndpointCategory } from './endpoint-categorizer';
import type { MetricsSnapshot, PercentileStats } from './types';

/**
 * Maximum samples to keep per endpoint for response time calculation
 * Keeping 1000 samples per endpoint provides accurate p95/p99 without memory bloat
 */
const MAX_SAMPLES_PER_ENDPOINT = 1000;

/**
 * Rolling window duration in milliseconds (5 minutes)
 */
const ROLLING_WINDOW_MS = 5 * 60 * 1000;

/**
 * In-memory metrics collection service
 * Thread-safe (single-threaded Node.js environment)
 * Separates standard API from analytics to prevent skewing
 */
class MetricsCollector {
  // Standard API metrics (CRUD operations, user-facing)
  private requests = new Map<string, number>(); // endpoint -> count
  private requestTimestamps = new Map<string, number[]>(); // endpoint -> timestamps
  private errors = new Map<string, number>(); // endpoint -> error count
  private errorsByType = new Map<string, number>(); // error type -> count
  private durations = new Map<string, number[]>(); // endpoint -> duration array
  private slowRequests = new Map<string, number>(); // endpoint -> slow request count

  // Analytics API metrics (dashboards, charts, complex queries)
  private analyticsRequests = new Map<string, number>();
  private analyticsDurations = new Map<string, number[]>();
  private analyticsErrors = new Map<string, number>();
  private analyticsSlowRequests = new Map<string, number>();

  // Cache metrics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Security metrics
  private securityEvents = new Map<string, number>(); // event type -> count
  private rateLimitBlocks = 0;
  private failedLogins = 0;

  // Active users tracking (approximate)
  private activeUserIds = new Set<string>();
  private lastActiveUserReset = Date.now();
  private peakActiveUsers = 0;
  private peakActiveUsersTime = Date.now();

  // Database latency tracking
  private dbDurations: number[] = [];

  // Metadata
  private collectionStartTime = Date.now();
  private lastSnapshotTime = Date.now();

  /**
   * Record an API request with categorization
   *
   * @param endpoint - API endpoint path
   * @param duration - Request duration in milliseconds
   * @param statusCode - HTTP status code
   * @param userId - Optional user ID for active user tracking
   * @param category - Endpoint category (standard, analytics, monitoring, health)
   */
  recordRequest(
    endpoint: string,
    duration: number,
    statusCode: number,
    userId?: string,
    category: EndpointCategory = 'standard'
  ): void {
    const now = Date.now();

    // Route to appropriate tracking bucket based on category
    if (category === 'analytics') {
      this.recordAnalyticsRequest(endpoint, duration, statusCode);
    } else if (category === 'standard') {
      this.recordStandardRequest(endpoint, duration, statusCode, now);
    }
    // Skip tracking for 'monitoring' and 'health' categories to avoid noise

    // Track active users (regardless of category)
    if (userId) {
      if (now - this.lastActiveUserReset > ROLLING_WINDOW_MS) {
        this.activeUserIds.clear();
        this.lastActiveUserReset = now;
      }
      this.activeUserIds.add(userId);
      
      // Track peak active users
      if (this.activeUserIds.size > this.peakActiveUsers) {
        this.peakActiveUsers = this.activeUserIds.size;
        this.peakActiveUsersTime = now;
      }
    }
  }

  /**
   * Record a standard API request (CRUD operations)
   */
  private recordStandardRequest(
    endpoint: string,
    duration: number,
    statusCode: number,
    now: number
  ): void {
    // Increment request count
    this.requests.set(endpoint, (this.requests.get(endpoint) || 0) + 1);

    // Track request timestamp for rate calculation
    const timestamps = this.requestTimestamps.get(endpoint) || [];
    timestamps.push(now);
    // Keep only last 5 minutes of timestamps
    const fiveMinutesAgo = now - ROLLING_WINDOW_MS;
    const recentTimestamps = timestamps.filter((ts) => ts > fiveMinutesAgo);
    this.requestTimestamps.set(endpoint, recentTimestamps);

    // Track errors (4xx and 5xx)
    if (statusCode >= 400) {
      this.errors.set(endpoint, (this.errors.get(endpoint) || 0) + 1);

      // Categorize error type
      const errorType = this.categorizeErrorStatus(statusCode);
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);
    }

    // Track response times
    const durations = this.durations.get(endpoint) || [];
    durations.push(duration);
    // Keep only last N samples to prevent memory growth
    if (durations.length > MAX_SAMPLES_PER_ENDPOINT) {
      durations.shift();
    }
    this.durations.set(endpoint, durations);

    // Track slow requests (>1000ms for standard API)
    if (duration > 1000) {
      this.slowRequests.set(endpoint, (this.slowRequests.get(endpoint) || 0) + 1);
    }
  }

  /**
   * Record an analytics API request (dashboards, charts)
   */
  private recordAnalyticsRequest(endpoint: string, duration: number, statusCode: number): void {
    // Increment analytics request count
    this.analyticsRequests.set(endpoint, (this.analyticsRequests.get(endpoint) || 0) + 1);

    // Track errors
    if (statusCode >= 400) {
      this.analyticsErrors.set(endpoint, (this.analyticsErrors.get(endpoint) || 0) + 1);
    }

    // Track response times
    const durations = this.analyticsDurations.get(endpoint) || [];
    durations.push(duration);
    // Keep only last N samples to prevent memory growth
    if (durations.length > MAX_SAMPLES_PER_ENDPOINT) {
      durations.shift();
    }
    this.analyticsDurations.set(endpoint, durations);

    // Track slow requests (>5000ms for analytics)
    if (duration > 5000) {
      this.analyticsSlowRequests.set(endpoint, (this.analyticsSlowRequests.get(endpoint) || 0) + 1);
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Record a security event
   *
   * @param eventType - Type of security event
   */
  recordSecurityEvent(eventType: string): void {
    this.securityEvents.set(eventType, (this.securityEvents.get(eventType) || 0) + 1);
  }

  /**
   * Record a rate limit block
   */
  recordRateLimitBlock(): void {
    this.rateLimitBlocks++;
  }

  /**
   * Record a failed login attempt
   */
  recordFailedLogin(): void {
    this.failedLogins++;
  }

  /**
   * Record a database operation duration
   * 
   * @param duration - Query duration in milliseconds
   */
  recordDbOperation(duration: number): void {
    this.dbDurations.push(duration);
    // Keep only last N samples to prevent memory growth
    if (this.dbDurations.length > MAX_SAMPLES_PER_ENDPOINT) {
      this.dbDurations.shift();
    }
  }

  /**
   * Get database latency P95
   * 
   * @returns P95 database latency in milliseconds, or 0 if no data
   */
  getDbLatencyP95(): number {
    if (this.dbDurations.length === 0) {
      return 0;
    }
    const sorted = [...this.dbDurations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    return sorted[p95Index] || 0;
  }

  /**
   * Get per-endpoint response time percentiles for standard API
   * 
   * @returns Map of endpoint to percentile stats
   */
  getPerEndpointPercentiles(): Record<string, PercentileStats> {
    const result: Record<string, PercentileStats> = {};
    
    for (const [endpoint, durations] of Array.from(this.durations.entries())) {
      if (durations.length === 0) continue;
      
      const sorted = [...durations].sort((a, b) => a - b);
      const count = sorted.length;
      const sum = sorted.reduce((acc, val) => acc + val, 0);
      
      result[endpoint] = {
        p50: sorted[Math.floor(count * 0.5)] || 0,
        p95: sorted[Math.floor(count * 0.95)] || 0,
        p99: sorted[Math.floor(count * 0.99)] || 0,
        avg: Math.round(sum / count),
        min: sorted[0] || 0,
        max: sorted[count - 1] || 0,
        count,
      };
    }
    
    return result;
  }

  /**
   * Get peak active users info
   * 
   * @returns Peak users count and timestamp
   */
  getPeakActiveUsers(): { count: number; time: string } {
    return {
      count: this.peakActiveUsers,
      time: new Date(this.peakActiveUsersTime).toISOString(),
    };
  }

  /**
   * Get current metrics snapshot
   * This method does NOT reset counters - use for dashboard display
   *
   * @returns Current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const now = Date.now();
    const collectionDurationMs = now - this.collectionStartTime;

    // Calculate standard API metrics
    const totalRequests = Array.from(this.requests.values()).reduce((sum, count) => sum + count, 0);
    const totalErrors = Array.from(this.errors.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const requestsPerSecond = this.calculateRequestsPerSecond();
    const responseTime = this.calculateResponseTimePercentiles(this.durations);

    // Calculate analytics metrics
    const totalAnalyticsRequests = Array.from(this.analyticsRequests.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalAnalyticsErrors = Array.from(this.analyticsErrors.values()).reduce(
      (sum, count) => sum + count,
      0
    );
    const analyticsErrorRate =
      totalAnalyticsRequests > 0 ? (totalAnalyticsErrors / totalAnalyticsRequests) * 100 : 0;
    const analyticsResponseTime = this.calculateResponseTimePercentiles(this.analyticsDurations);

    // Calculate cache hit rate
    const cacheTotal = this.cacheHits + this.cacheMisses;
    const cacheHitRate = cacheTotal > 0 ? (this.cacheHits / cacheTotal) * 100 : 0;

    // Get top endpoints by request count
    const topEndpoints = this.getTopEndpoints(10);

    // Get top endpoints by error count
    const topErrorEndpoints = this.getTopErrorEndpoints(10);

    // Get slowest endpoints
    const slowestEndpoints = this.getSlowestEndpoints(10);

    return {
      timestamp: new Date().toISOString(),
      collectionDurationMs,
      timeSinceLastSnapshot: now - this.lastSnapshotTime,

      // Standard API metrics
      requests: {
        total: totalRequests,
        perSecond: requestsPerSecond,
        byEndpoint: Object.fromEntries(this.requests),
      },

      errors: {
        total: totalErrors,
        rate: errorRate,
        byEndpoint: Object.fromEntries(this.errors),
        byType: Object.fromEntries(this.errorsByType),
      },

      responseTime,

      slowRequests: {
        count: Array.from(this.slowRequests.values()).reduce((sum, count) => sum + count, 0),
        threshold: 1000,
        byEndpoint: Object.fromEntries(this.slowRequests),
      },

      // Analytics metrics (separate to prevent skewing)
      analytics: {
        requests: {
          total: totalAnalyticsRequests,
          byEndpoint: Object.fromEntries(this.analyticsRequests),
        },
        responseTime: analyticsResponseTime,
        errors: {
          total: totalAnalyticsErrors,
          rate: analyticsErrorRate,
          byEndpoint: Object.fromEntries(this.analyticsErrors),
        },
        slowRequests: {
          count: Array.from(this.analyticsSlowRequests.values()).reduce(
            (sum, count) => sum + count,
            0
          ),
          threshold: 5000,
          byEndpoint: Object.fromEntries(this.analyticsSlowRequests),
        },
      },

      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: cacheHitRate,
        total: cacheTotal,
      },

      security: {
        events: Object.fromEntries(this.securityEvents),
        totalEvents: Array.from(this.securityEvents.values()).reduce(
          (sum, count) => sum + count,
          0
        ),
        rateLimitBlocks: this.rateLimitBlocks,
        failedLogins: this.failedLogins,
      },

      activeUsers: {
        count: this.activeUserIds.size,
        since: new Date(this.lastActiveUserReset).toISOString(),
      },

      topEndpoints,
      topErrorEndpoints,
      slowestEndpoints,
    };
  }

  /**
   * Get snapshot and reset all counters
   * Use this for periodic metrics collection (e.g., every 5 minutes)
   *
   * @returns Metrics snapshot before reset
   */
  getSnapshotAndReset(): MetricsSnapshot {
    const snapshot = this.getSnapshot();
    this.reset();
    return snapshot;
  }

  /**
   * Reset all metrics counters
   * Called after snapshot to start fresh collection period
   */
  private reset(): void {
    // Reset standard API metrics
    this.requests.clear();
    this.requestTimestamps.clear();
    this.errors.clear();
    this.errorsByType.clear();
    this.durations.clear();
    this.slowRequests.clear();

    // Reset analytics metrics
    this.analyticsRequests.clear();
    this.analyticsDurations.clear();
    this.analyticsErrors.clear();
    this.analyticsSlowRequests.clear();

    // Reset cache metrics
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Reset security metrics
    this.securityEvents.clear();
    this.rateLimitBlocks = 0;
    this.failedLogins = 0;

    // Reset database metrics
    this.dbDurations = [];

    // Reset peak users tracking
    this.peakActiveUsers = this.activeUserIds.size;
    this.peakActiveUsersTime = Date.now();

    // Don't reset activeUserIds - it has its own 5-minute window
    this.collectionStartTime = Date.now();
    this.lastSnapshotTime = Date.now();
  }

  /**
   * Calculate requests per second across all endpoints
   * Based on last 5 minutes of timestamps
   */
  private calculateRequestsPerSecond(): number {
    const now = Date.now();
    const fiveMinutesAgo = now - ROLLING_WINDOW_MS;

    let totalRecentRequests = 0;
    for (const timestamps of Array.from(this.requestTimestamps.values())) {
      totalRecentRequests += timestamps.filter((ts: number) => ts > fiveMinutesAgo).length;
    }

    const windowSeconds = ROLLING_WINDOW_MS / 1000;
    return totalRecentRequests / windowSeconds;
  }

  /**
   * Calculate response time percentiles for a duration map
   *
   * @param durationsMap - Map of endpoint to duration arrays
   * @returns Percentile statistics
   */
  private calculateResponseTimePercentiles(durationsMap: Map<string, number[]>): PercentileStats {
    // Collect all durations from all endpoints
    const allDurations: number[] = [];
    for (const durations of Array.from(durationsMap.values())) {
      allDurations.push(...durations);
    }

    if (allDurations.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0,
        min: 0,
        max: 0,
        count: 0,
      };
    }

    // Sort for percentile calculation
    const sorted = allDurations.sort((a, b) => a - b);
    const count = sorted.length;

    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    const sum = sorted.reduce((acc: number, val: number) => acc + val, 0);
    const avg = sum / count;

    return {
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
      avg: Math.round(avg),
      min: sorted[0] || 0,
      max: sorted[count - 1] || 0,
      count,
    };
  }

  /**
   * Get top N endpoints by request count
   */
  private getTopEndpoints(limit: number): Array<{ endpoint: string; count: number }> {
    return Array.from(this.requests.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top N endpoints by error count
   */
  private getTopErrorEndpoints(limit: number): Array<{ endpoint: string; errors: number }> {
    return Array.from(this.errors.entries())
      .map(([endpoint, errors]) => ({ endpoint, errors }))
      .sort((a, b) => b.errors - a.errors)
      .slice(0, limit);
  }

  /**
   * Get slowest N endpoints by average response time
   */
  private getSlowestEndpoints(
    limit: number
  ): Array<{ endpoint: string; avgDuration: number; count: number }> {
    const endpointAvgs: Array<{ endpoint: string; avgDuration: number; count: number }> = [];

    for (const [endpoint, durations] of Array.from(this.durations.entries())) {
      if (durations.length === 0) continue;

      const sum = durations.reduce((acc: number, val: number) => acc + val, 0);
      const avg = sum / durations.length;

      endpointAvgs.push({
        endpoint,
        avgDuration: Math.round(avg),
        count: durations.length,
      });
    }

    return endpointAvgs.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, limit);
  }

  /**
   * Categorize HTTP status code into error type
   */
  private categorizeErrorStatus(statusCode: number): string {
    if (statusCode >= 500) return '5xx_server_error';
    if (statusCode === 429) return '429_rate_limit';
    if (statusCode === 403) return '403_forbidden';
    if (statusCode === 401) return '401_unauthorized';
    if (statusCode === 404) return '404_not_found';
    if (statusCode >= 400) return '4xx_client_error';
    return 'unknown_error';
  }
}

// Extend globalThis to include our metrics collector
declare global {
  // eslint-disable-next-line no-var
  var __metricsCollector: MetricsCollector | undefined;
}

// Use globalThis to ensure single instance across hot reloads in development
// In production, this works the same as a regular singleton
const metricsCollector = globalThis.__metricsCollector ?? new MetricsCollector();

// Store on globalThis in development to prevent multiple instances during hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.__metricsCollector = metricsCollector;
}

/**
 * Singleton instance of MetricsCollector
 * Use this for all metrics collection throughout the application
 */
export { metricsCollector };
