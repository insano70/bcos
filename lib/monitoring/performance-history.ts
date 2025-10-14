/**
 * Performance History Tracker
 *
 * Tracks performance metrics over time for trending charts.
 * Stores snapshots from MetricsCollector to build time-series data.
 *
 * FEATURES:
 * - Stores last hour of metrics (60 data points)
 * - Separates standard vs analytics metrics
 * - Provides data for Chart.js time-series visualization
 * - Automatic cleanup of old data points
 *
 * USAGE:
 * ```typescript
 * import { performanceHistory } from '@/lib/monitoring/performance-history';
 *
 * // Add snapshot (called automatically every minute)
 * performanceHistory.addDataPoint(snapshot);
 *
 * // Get data for charts
 * const data = performanceHistory.getDataPoints('1h', 'standard');
 * ```
 */

import type { MetricsSnapshot, PerformanceDataPoint } from './types';

/**
 * Performance History Tracker
 * Maintains time-series metrics for charting
 */
class PerformanceHistoryTracker {
  // Standard API data points
  private standardDataPoints: PerformanceDataPoint[] = [];

  // Analytics API data points
  private analyticsDataPoints: PerformanceDataPoint[] = [];

  // Maximum data points to keep (1 hour at 1-minute intervals)
  private readonly maxDataPoints = 60;

  /**
   * Add a new data point from MetricsCollector snapshot
   *
   * @param snapshot - Metrics snapshot from MetricsCollector
   */
  addDataPoint(snapshot: MetricsSnapshot): void {
    // Create standard API data point
    const standardPoint: PerformanceDataPoint = {
      timestamp: snapshot.timestamp,
      responseTime: {
        p50: snapshot.responseTime.p50,
        p95: snapshot.responseTime.p95,
        p99: snapshot.responseTime.p99,
        avg: snapshot.responseTime.avg,
      },
      requestCount: snapshot.requests.total,
      errorCount: snapshot.errors.total,
      errorRate: snapshot.errors.rate,
    };

    this.standardDataPoints.push(standardPoint);

    // Trim if exceeds max
    if (this.standardDataPoints.length > this.maxDataPoints) {
      this.standardDataPoints.shift();
    }

    // Create analytics API data point
    const analyticsPoint: PerformanceDataPoint = {
      timestamp: snapshot.timestamp,
      responseTime: {
        p50: snapshot.analytics.responseTime.p50,
        p95: snapshot.analytics.responseTime.p95,
        p99: snapshot.analytics.responseTime.p99,
        avg: snapshot.analytics.responseTime.avg,
      },
      requestCount: snapshot.analytics.requests.total,
      errorCount: snapshot.analytics.errors.total,
      errorRate: snapshot.analytics.errors.rate,
    };

    this.analyticsDataPoints.push(analyticsPoint);

    // Trim if exceeds max
    if (this.analyticsDataPoints.length > this.maxDataPoints) {
      this.analyticsDataPoints.shift();
    }
  }

  /**
   * Get data points for charting
   *
   * @param timeRange - Time range ('15m', '1h', '6h', '24h')
   * @param category - Metric category ('standard' or 'analytics')
   * @returns Array of data points within time range
   */
  getDataPoints(
    timeRange: string = '1h',
    category: 'standard' | 'analytics' = 'standard'
  ): PerformanceDataPoint[] {
    const dataPoints = category === 'standard' ? this.standardDataPoints : this.analyticsDataPoints;

    if (dataPoints.length === 0) {
      return [];
    }

    // Calculate time cutoff
    const now = Date.now();
    const ranges: Record<string, number> = {
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };

    const cutoff = now - (ranges[timeRange] ?? ranges['1h'] ?? 3600000);

    // Filter data points within time range
    return dataPoints.filter((point) => new Date(point.timestamp).getTime() > cutoff);
  }

  /**
   * Get interval based on time range
   *
   * @param timeRange - Time range
   * @returns Interval string for display
   */
  getInterval(timeRange?: string): string {
    switch (timeRange) {
      case '15m':
      case '1h':
        return '1m';
      case '6h':
        return '5m';
      case '24h':
        return '15m';
      default:
        return '1m';
    }
  }

  /**
   * Clear all stored data points
   * Used for testing or manual reset
   */
  clear(): void {
    this.standardDataPoints = [];
    this.analyticsDataPoints = [];
  }
}

// Extend globalThis to include our history tracker
declare global {
  // eslint-disable-next-line no-var
  var __performanceHistory: PerformanceHistoryTracker | undefined;
}

// Use globalThis to ensure single instance across hot reloads
const performanceHistory = globalThis.__performanceHistory ?? new PerformanceHistoryTracker();

// Store on globalThis in development to prevent multiple instances during hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.__performanceHistory = performanceHistory;
}

/**
 * Singleton instance of PerformanceHistoryTracker
 */
export { performanceHistory };

/**
 * Initialize performance history tracking
 * Call this once at application startup to begin collecting data
 *
 * Note: In production, this should be called from a server startup script
 * In development, it will be called on first hot reload
 */
export function initializePerformanceTracking(): void {
  // Only initialize in server-side context
  if (typeof window !== 'undefined') {
    return;
  }

  // Set up interval to collect snapshots every minute
  const COLLECTION_INTERVAL = 60000; // 1 minute

  setInterval(async () => {
    try {
      // Dynamic import to avoid circular dependencies
      const { metricsCollector } = await import('./metrics-collector');
      const snapshot = metricsCollector.getSnapshot();
      performanceHistory.addDataPoint(snapshot);
    } catch (error) {
      // Silently fail - don't break the app if tracking fails
      console.error('Performance history tracking failed:', error);
    }
  }, COLLECTION_INTERVAL);
}

// Auto-initialize on module load (server-side only)
if (typeof window === 'undefined') {
  initializePerformanceTracking();
}

