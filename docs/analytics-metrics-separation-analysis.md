# Analytics Metrics Separation - Analysis & Implementation Plan

**Issue:** Analytics and dashboard query response times skew overall API performance metrics  
**Created:** 2025-10-14  
**Status:** Analysis Complete, Ready for Implementation  

---

## Problem Statement

### Current Behavior
All API requests are tracked together in a single metrics bucket, which means:
- ❌ Analytics queries (complex aggregations, large datasets) have response times of **2-10 seconds**
- ❌ Standard CRUD operations (simple queries) have response times of **50-500ms**
- ❌ Mixed together, this makes the **p95 response time misleading** (appears much slower than actual user experience)
- ❌ **System health score** is incorrectly penalized by slow analytics queries
- ❌ **Performance alerts** trigger unnecessarily due to analytics queries

### Expected Behavior
- ✅ **Standard API metrics** (CRUD operations) tracked separately
- ✅ **Analytics API metrics** (dashboards, charts, aggregations) tracked separately
- ✅ **Health score** calculated only from standard API performance
- ✅ **Dashboard shows both** metrics side-by-side for comparison
- ✅ **Alerts configured** with appropriate thresholds for each category

---

## Endpoint Categorization

### Analytics/Dashboard Endpoints (Slow, Expected)

**Pattern:** All endpoints under `/api/admin/analytics/*` and `/api/admin/data-sources/*/query`

**Complete List:**
```
POST /api/admin/analytics/chart-data                    # Chart data aggregation
POST /api/admin/analytics/chart-data/universal          # Universal chart data
GET  /api/admin/analytics/measures                      # Measure queries with filters
GET  /api/admin/analytics/dashboards                    # Dashboard listings
GET  /api/admin/analytics/dashboards/[id]               # Single dashboard
GET  /api/admin/analytics/dashboards/[id]/render        # Dashboard rendering (SLOW)
GET  /api/admin/analytics/charts                        # Chart listings
GET  /api/admin/analytics/charts/[id]                   # Single chart
GET  /api/admin/analytics/users                         # User analytics
GET  /api/admin/analytics/practices                     # Practice analytics
GET  /api/admin/analytics/system                        # System analytics
GET  /api/admin/analytics/explore                       # Data exploration
GET  /api/admin/analytics/schema                        # Schema introspection
GET  /api/admin/analytics/debug                         # Debug info
GET  /api/admin/analytics/favorites                     # User favorites
GET  /api/admin/analytics/categories                    # Chart categories
GET  /api/admin/analytics/data-sources                  # Data source configs
GET  /api/admin/analytics/config/data-sources           # Data source management
GET  /api/admin/data-sources/[id]/query                 # Direct data source query (SLOW)
GET  /api/admin/data-sources/[id]/introspect            # Schema introspection
GET  /api/admin/data-sources/[id]/test                  # Connection test
```

**Expected Performance:**
- **Simple listings** (dashboards, charts): 100-500ms
- **Single chart data**: 500-2000ms
- **Dashboard rendering** (multiple charts): 2-10 seconds
- **Complex aggregations**: 1-5 seconds

**Slow Threshold:** 5000ms (5 seconds) for analytics queries

### Standard API Endpoints (Fast, Critical for UX)

**Pattern:** All other `/api/*` endpoints excluding analytics

**Categories:**
```
# User Management
GET/POST   /api/users
GET/PUT    /api/users/[id]
GET        /api/auth/sessions

# Practice Management  
GET/POST   /api/practices
GET/PUT    /api/practices/[id]
GET/POST   /api/practices/[id]/attributes
GET/POST   /api/practices/[id]/staff

# Authentication
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
POST /api/auth/mfa/*

# System
GET  /api/health
GET  /api/health/db
GET  /api/health/services

# Admin Tools (non-analytics)
GET/POST /api/admin/monitoring/*      # NEW - Monitoring dashboard
GET/POST /api/admin/redis/*           # NEW - Redis admin tools
```

**Expected Performance:**
- **Simple reads**: 50-200ms
- **Complex reads** (with joins): 200-500ms
- **Writes** (with validation): 100-300ms
- **Auth operations**: 500-2000ms

**Slow Threshold:** 1000ms (1 second) for standard operations

---

## Proposed Solution

### 1. Endpoint Categorization Logic

**File:** `lib/monitoring/endpoint-categorizer.ts`

```typescript
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
  
  // Health check endpoints (should not affect health score)
  if (path.startsWith('/api/health')) {
    return 'health';
  }
  
  // Analytics and dashboard queries (complex, expected to be slow)
  if (path.startsWith('/api/admin/analytics/')) {
    return 'analytics';
  }
  
  // Data source queries (complex SQL, expected to be slow)
  if (path.includes('/api/admin/data-sources/') && path.includes('/query')) {
    return 'analytics';
  }
  
  // Everything else is standard API
  return 'standard';
}

/**
 * Get slow threshold for endpoint category (milliseconds)
 */
export function getSlowThreshold(category: EndpointCategory): number {
  switch (category) {
    case 'analytics':
      return 5000;  // 5 seconds for analytics
    case 'standard':
      return 1000;  // 1 second for standard API
    case 'monitoring':
      return 2000;  // 2 seconds for monitoring queries
    case 'health':
      return 500;   // 500ms for health checks
  }
}

/**
 * Check if response time is slow for the endpoint category
 */
export function isSlowResponse(category: EndpointCategory, duration: number): boolean {
  return duration > getSlowThreshold(category);
}
```

### 2. Enhanced MetricsCollector

**Updates to `lib/monitoring/metrics-collector.ts`:**

```typescript
class MetricsCollector {
  // Existing metrics (now for standard API only)
  private requests = new Map<string, number>();
  private durations = new Map<string, number[]>();
  private errors = new Map<string, number>();
  // ... existing fields ...

  // NEW: Analytics-specific metrics
  private analyticsRequests = new Map<string, number>();
  private analyticsDurations = new Map<string, number[]>();
  private analyticsErrors = new Map<string, number>();
  private analyticsSlowRequests = new Map<string, number>();

  // NEW: Monitoring-specific metrics (dashboard itself)
  private monitoringRequests = 0;
  private monitoringDurations: number[] = [];
  
  /**
   * Record an API request with category
   */
  recordRequest(
    endpoint: string,
    duration: number,
    statusCode: number,
    userId?: string,
    category: EndpointCategory = 'standard'  // NEW parameter
  ): void {
    // Route to appropriate tracking bucket based on category
    switch (category) {
      case 'analytics':
        this.recordAnalyticsRequest(endpoint, duration, statusCode);
        break;
      case 'monitoring':
        this.recordMonitoringRequest(duration);
        break;
      case 'health':
        // Don't track health checks in metrics (noise)
        break;
      case 'standard':
      default:
        this.recordStandardRequest(endpoint, duration, statusCode, userId);
        break;
    }
  }
  
  private recordStandardRequest(
    endpoint: string,
    duration: number,
    statusCode: number,
    userId?: string
  ): void {
    // Existing logic (unchanged)
    this.requests.set(endpoint, (this.requests.get(endpoint) || 0) + 1);
    // ... rest of existing logic ...
  }
  
  private recordAnalyticsRequest(
    endpoint: string,
    duration: number,
    statusCode: number
  ): void {
    // Track analytics requests separately
    this.analyticsRequests.set(endpoint, (this.analyticsRequests.get(endpoint) || 0) + 1);
    
    // Track errors
    if (statusCode >= 400) {
      this.analyticsErrors.set(endpoint, (this.analyticsErrors.get(endpoint) || 0) + 1);
    }
    
    // Track durations
    const durations = this.analyticsDurations.get(endpoint) || [];
    durations.push(duration);
    if (durations.length > MAX_SAMPLES_PER_ENDPOINT) {
      durations.shift();
    }
    this.analyticsDurations.set(endpoint, durations);
    
    // Track slow requests (>5000ms for analytics)
    if (duration > 5000) {
      this.analyticsSlowRequests.set(endpoint, (this.analyticsSlowRequests.get(endpoint) || 0) + 1);
    }
  }
  
  getSnapshot(): MetricsSnapshot {
    // ... existing logic for standard metrics ...
    
    // NEW: Add analytics metrics to snapshot
    const analyticsResponseTime = this.calculateAnalyticsPercentiles();
    
    return {
      // ... existing fields ...
      
      // NEW: Analytics-specific metrics
      analytics: {
        requests: {
          total: Array.from(this.analyticsRequests.values()).reduce((sum, count) => sum + count, 0),
          byEndpoint: Object.fromEntries(this.analyticsRequests),
        },
        responseTime: analyticsResponseTime,
        errors: {
          total: Array.from(this.analyticsErrors.values()).reduce((sum, count) => sum + count, 0),
          byEndpoint: Object.fromEntries(this.analyticsErrors),
        },
        slowRequests: {
          count: Array.from(this.analyticsSlowRequests.values()).reduce((sum, count) => sum + count, 0),
          threshold: 5000,
          byEndpoint: Object.fromEntries(this.analyticsSlowRequests),
        },
      },
    };
  }
}
```

### 3. Updated Types

**Updates to `lib/monitoring/types.ts`:**

```typescript
export interface MetricsSnapshot {
  // ... existing fields ...
  
  // Standard API metrics (CRUD operations)
  requests: {
    total: number;
    perSecond: number;
    byEndpoint: Record<string, number>;
  };
  responseTime: PercentileStats;  // For standard API only
  
  // NEW: Analytics-specific metrics
  analytics: {
    requests: {
      total: number;
      byEndpoint: Record<string, number>;
    };
    responseTime: PercentileStats;
    errors: {
      total: number;
      byEndpoint: Record<string, number>;
    };
    slowRequests: {
      count: number;
      threshold: number;  // 5000ms
      byEndpoint: Record<string, number>;
    };
  };
  
  // ... rest of existing fields ...
}
```

### 4. Updated Dashboard

**Changes to KPI cards:**

**Row 1 (Critical Metrics):**
```
┌────────────┬────────────┬────────────┬────────────┬──────────────────┐
│ SYSTEM     │ ACTIVE     │ ERROR      │ API p95    │ SECURITY         │
│ HEALTH     │ USERS      │ RATE       │ RESPONSE   │ STATUS           │
│ 94%        │ 142        │ 0.3%       │ 234ms      │ ✓ OK             │
└────────────┴────────────┴────────────┴────────────┴──────────────────┘
```

**Row 2 (Performance Details - NEW):**
```
┌──────────────────────────┬──────────────────────────┐
│ STANDARD API PERFORMANCE  │ ANALYTICS PERFORMANCE     │
│ p50: 145ms               │ p50: 1,234ms             │
│ p95: 234ms ✓             │ p95: 3,567ms ⚠️          │
│ p99: 456ms               │ p99: 8,901ms             │
│ Requests: 1,234          │ Requests: 45             │
│ Slow: 2 (0.2%)          │ Slow: 8 (17.8%)          │
└──────────────────────────┴──────────────────────────┘
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✓ (Completed)
- [x] MetricsCollector service created
- [x] Basic metrics tracking integrated at route handler level
- [x] Dashboard page and KPI components created

### Phase 2: Analytics Separation (NEW - This Task)
- [ ] Create endpoint categorization utility
- [ ] Update MetricsCollector with separate analytics tracking
- [ ] Update rbacRoute to categorize endpoints
- [ ] Update types to include analytics metrics
- [ ] Update health score to exclude analytics
- [ ] Create analytics performance KPI component
- [ ] Update dashboard to show both metrics
- [ ] Update API endpoint to return separated data
- [ ] Test with real analytics queries
- [ ] Verify health score accuracy

---

## Benefits

### Accurate Health Monitoring
- ✅ **System health score** reflects actual user-facing performance
- ✅ **Alerts** trigger only for genuine performance degradation
- ✅ **Response time KPI** shows realistic API performance

### Analytics Performance Insights
- ✅ **Separate tracking** for dashboard and chart query performance
- ✅ **Identify slow analytics queries** without noise from CRUD operations
- ✅ **Optimize analytics** based on dedicated metrics
- ✅ **Set appropriate thresholds** (5s for analytics vs 1s for standard API)

### Better Decision Making
- ✅ **Compare** analytics vs standard API performance
- ✅ **Understand** impact of dashboard usage on system load
- ✅ **Plan capacity** based on analytics query patterns
- ✅ **Identify** opportunities for caching or query optimization

---

## Detailed Endpoint Analysis

### Analytics Endpoints by Complexity

**Simple (100-500ms):**
- GET `/api/admin/analytics/dashboards` - List dashboards (DB query only)
- GET `/api/admin/analytics/charts` - List charts (DB query only)
- GET `/api/admin/analytics/favorites` - User favorites (DB query only)
- GET `/api/admin/analytics/categories` - Chart categories (DB query only)

**Medium (500-2000ms):**
- GET `/api/admin/analytics/measures` - Measure query with filters
- GET `/api/admin/analytics/users` - User analytics with aggregations
- GET `/api/admin/analytics/practices` - Practice analytics
- POST `/api/admin/analytics/chart-data` - Single chart data

**Complex (2-10 seconds):**
- GET `/api/admin/analytics/dashboards/[id]/render` - Full dashboard (multiple charts)
- POST `/api/admin/analytics/chart-data/universal` - Universal chart with period comparison
- GET `/api/admin/data-sources/[id]/query` - Raw SQL query execution

### Standard Endpoints by Complexity

**Fast (<100ms):**
- GET `/api/health` - Basic health check
- GET `/api/csrf` - CSRF token generation

**Normal (100-500ms):**
- GET `/api/users` - List users with pagination
- GET `/api/practices` - List practices
- GET `/api/users/[id]` - Single user details
- PUT `/api/users/[id]` - Update user
- POST `/api/practices` - Create practice

**Slower (500-2000ms):**
- POST `/api/auth/login` - Password hashing + context loading
- POST `/api/auth/refresh` - Token validation + refresh
- GET `/api/health/db` - Database health checks

---

## Implementation Details

### Endpoint Categorizer

```typescript
// lib/monitoring/endpoint-categorizer.ts

/**
 * Endpoint categories for metrics tracking
 */
export type EndpointCategory = 'analytics' | 'standard' | 'monitoring' | 'health';

/**
 * Categorize endpoint for metrics tracking
 */
export function categorizeEndpoint(path: string): EndpointCategory {
  // Monitoring dashboard itself
  if (path.startsWith('/api/admin/monitoring/')) {
    return 'monitoring';
  }
  
  // Health checks
  if (path.startsWith('/api/health')) {
    return 'health';
  }
  
  // Analytics queries
  if (path.startsWith('/api/admin/analytics/')) {
    return 'analytics';
  }
  
  // Data source queries
  if (path.includes('/api/admin/data-sources/') && 
      (path.includes('/query') || path.includes('/introspect') || path.includes('/test'))) {
    return 'analytics';
  }
  
  // Everything else
  return 'standard';
}

/**
 * Get slow threshold for category
 */
export function getSlowThreshold(category: EndpointCategory): number {
  switch (category) {
    case 'analytics': return 5000;   // 5 seconds
    case 'standard': return 1000;    // 1 second
    case 'monitoring': return 2000;  // 2 seconds
    case 'health': return 500;       // 500ms
  }
}
```

### Integration Point

**In `lib/api/rbac-route-handler.ts`:**

```typescript
// Before recording metrics
const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
const category = categorizeEndpoint(url.pathname);

metricsCollector.recordRequest(
  url.pathname,
  totalDuration,
  response.status,
  userContext.user_id,
  category  // NEW: Pass category
);
```

### Updated Dashboard

**New KPI Card: Analytics Performance**

```tsx
<AnalyticsPerformanceKPI 
  p95={metrics.analytics.responseTime.p95}
  requestCount={metrics.analytics.requests.total}
  slowCount={metrics.analytics.slowRequests.count}
/>
```

**Visual:**
```
┌────────────────────────────────────────┐
│ Analytics Performance (p95)             │
│                                         │
│ 3.2s                                    │
│ ⚠️ Within expected range                │
│                                         │
│ 45 queries • 8 slow (>5s)              │
│ Target: < 5s for complex queries       │
└────────────────────────────────────────┘
```

---

## Metrics Comparison Table

| Metric Category | Standard API | Analytics API |
|-----------------|--------------|---------------|
| **Slow Threshold** | 1000ms | 5000ms |
| **Excellent p95** | < 300ms | < 2000ms |
| **Good p95** | < 1000ms | < 5000ms |
| **Poor p95** | > 1000ms | > 5000ms |
| **Affects Health Score** | ✅ Yes | ❌ No |
| **Expected Volume** | High (90%) | Low (10%) |
| **Cache Benefit** | Medium | High |

---

## Health Score Impact

### Before (Incorrect)
```
Health Score Calculation:
- Response Time p95: 3,200ms → -25 points (WRONG - includes analytics)
- Error Rate: 0.3% → -5 points
- Cache Hit Rate: 89% → -5 points
TOTAL: 65/100 → "Degraded" (INCORRECT)
```

### After (Correct)
```
Health Score Calculation:
- Response Time p95 (standard only): 234ms → -0 points ✓
- Error Rate: 0.3% → -5 points
- Cache Hit Rate: 89% → -5 points
TOTAL: 90/100 → "Healthy" (CORRECT)
```

---

## Expected Query Patterns

Based on your documentation analysis, typical dashboard usage:

**User Activity Pattern:**
- **90% standard API** - Navigation, CRUD operations, authentication
- **10% analytics API** - Dashboard views, chart refreshes

**Performance Expectations:**
- **Standard p95**: 200-400ms (fast user experience)
- **Analytics p95**: 2-5 seconds (acceptable for complex data)

**Volume Distribution:**
- **Standard**: ~1,000-2,000 requests/hour
- **Analytics**: ~100-200 requests/hour

---

## Testing Strategy

### Validation Tests

**1. Endpoint Categorization:**
```typescript
describe('categorizeEndpoint', () => {
  it('categorizes analytics endpoints', () => {
    expect(categorizeEndpoint('/api/admin/analytics/chart-data')).toBe('analytics');
    expect(categorizeEndpoint('/api/admin/data-sources/123/query')).toBe('analytics');
  });
  
  it('categorizes standard endpoints', () => {
    expect(categorizeEndpoint('/api/users')).toBe('standard');
    expect(categorizeEndpoint('/api/practices/123')).toBe('standard');
  });
  
  it('categorizes monitoring endpoints', () => {
    expect(categorizeEndpoint('/api/admin/monitoring/metrics')).toBe('monitoring');
  });
});
```

**2. Metrics Separation:**
```typescript
describe('MetricsCollector categorization', () => {
  it('tracks standard and analytics separately', () => {
    metricsCollector.recordRequest('/api/users', 250, 200, 'user-1', 'standard');
    metricsCollector.recordRequest('/api/admin/analytics/chart-data', 3500, 200, 'user-1', 'analytics');
    
    const snapshot = metricsCollector.getSnapshot();
    
    expect(snapshot.responseTime.p95).toBe(250);  // Standard only
    expect(snapshot.analytics.responseTime.p95).toBe(3500);  // Analytics only
  });
});
```

**3. Health Score:**
```typescript
describe('Health score with analytics separation', () => {
  it('excludes analytics from health score', () => {
    const health = calculateHealthScore({
      errorRate: 0.5,
      responseTimeP95: 250,     // Standard API only
      cacheHitRate: 90,
      dbLatencyP95: 300,
      securityIncidents: 0,
    });
    
    expect(health.score).toBe(95);  // Excellent score
    expect(health.factors.responseTime).toBe('healthy');
  });
});
```

---

## Rollout Plan

### Step 1: Add Categorization (Day 1, 2 hours)
- Create `endpoint-categorizer.ts`
- Add unit tests
- Verify categorization logic

### Step 2: Update MetricsCollector (Day 1, 3 hours)
- Add analytics tracking fields
- Update `recordRequest()` signature
- Add `recordAnalyticsRequest()` method
- Update `getSnapshot()` to include analytics
- Add unit tests

### Step 3: Integrate with Route Handler (Day 1, 1 hour)
- Update `rbacRoute` to categorize endpoints
- Update `publicRoute` integration
- Update `legacySecureRoute` integration

### Step 4: Update Types & API (Day 2, 2 hours)
- Update `MetricsSnapshot` interface
- Update `MonitoringMetrics` interface
- Update `/api/admin/monitoring/metrics` response

### Step 5: Update Dashboard UI (Day 2, 3 hours)
- Create `AnalyticsPerformanceKPI` component
- Update dashboard layout
- Add comparison view
- Test with real data

### Step 6: Testing & Validation (Day 2, 2 hours)
- Unit tests for categorization
- Integration tests for separated metrics
- Manual testing with dashboard queries
- Verify health score accuracy

**Total Effort:** 2 days

---

## Risk Mitigation

**Risk 1: Categorization errors**
- *Mitigation:* Comprehensive unit tests, explicit pattern matching
- *Fallback:* Default to 'standard' if unsure

**Risk 2: Breaking existing metrics**
- *Mitigation:* Keep existing metrics unchanged, only add new fields
- *Fallback:* Feature flag to disable categorization

**Risk 3: Performance impact**
- *Mitigation:* Categorization is simple string matching (< 1ms)
- *Fallback:* Cache categorization results if needed

---

**Ready to implement?** This will give you accurate health scores and clear visibility into both standard API and analytics performance.

