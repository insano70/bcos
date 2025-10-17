/**
 * Endpoint Categorization for Metrics Tracking
 *
 * Categorizes API endpoints to track performance metrics separately.
 * This prevents slow analytics queries from skewing standard API metrics.
 *
 * CATEGORIES:
 * - analytics: Dashboard queries, chart data, complex aggregations (expected to be slow)
 * - standard: CRUD operations, user management, practice management (should be fast)
 * - monitoring: Monitoring dashboard itself (separate tracking)
 * - health: Health check endpoints (excluded from health score)
 *
 * THRESHOLDS:
 * - Analytics: 5000ms (complex queries acceptable)
 * - Standard: 1000ms (user experience critical)
 * - Monitoring: 2000ms (CloudWatch queries)
 * - Health: 500ms (should be very fast)
 */

/**
 * Endpoint category for metrics tracking
 */
export type EndpointCategory = 'analytics' | 'standard' | 'monitoring' | 'health';

/**
 * Categorize an API endpoint for metrics tracking
 *
 * @param path - Request path (e.g., '/api/admin/analytics/chart-data')
 * @returns Category for metrics tracking
 */
export function categorizeEndpoint(path: string): EndpointCategory {
  // Monitoring dashboard itself (should not affect health score)
  if (path.startsWith('/api/admin/monitoring/')) {
    return 'monitoring';
  }

  // Redis admin tools (should not affect health score)
  if (path.startsWith('/api/admin/redis/')) {
    return 'monitoring';
  }

  // Health check endpoints (should not affect health score)
  if (path.startsWith('/api/health')) {
    return 'health';
  }

  // Analytics and dashboard queries (complex, expected to be slow)
  if (path.startsWith('/api/admin/analytics/')) {
    return 'analytics';
  }

  // Data source queries (complex SQL, expected to be slow)
  if (path.includes('/api/admin/data-sources/')) {
    // Query, introspect, and test operations are analytics
    if (path.includes('/query') || path.includes('/introspect') || path.includes('/test')) {
      return 'analytics';
    }
    // Data source CRUD is standard
    return 'standard';
  }

  // Everything else is standard API (CRUD operations)
  return 'standard';
}

/**
 * Get slow threshold for endpoint category (milliseconds)
 *
 * @param category - Endpoint category
 * @returns Slow threshold in milliseconds
 */
export function getSlowThreshold(category: EndpointCategory): number {
  switch (category) {
    case 'analytics':
      return 5000; // 5 seconds for analytics queries
    case 'standard':
      return 1000; // 1 second for standard API
    case 'monitoring':
      return 2000; // 2 seconds for monitoring queries
    case 'health':
      return 500; // 500ms for health checks
  }
}

/**
 * Check if response time is slow for the endpoint category
 *
 * @param category - Endpoint category
 * @param duration - Response time in milliseconds
 * @returns True if response is slow for the category
 */
export function isSlowResponse(category: EndpointCategory, duration: number): boolean {
  return duration > getSlowThreshold(category);
}

/**
 * Get human-readable category name
 *
 * @param category - Endpoint category
 * @returns Display name for category
 */
export function getCategoryDisplayName(category: EndpointCategory): string {
  switch (category) {
    case 'analytics':
      return 'Analytics & Dashboards';
    case 'standard':
      return 'Standard API';
    case 'monitoring':
      return 'Monitoring Tools';
    case 'health':
      return 'Health Checks';
  }
}
