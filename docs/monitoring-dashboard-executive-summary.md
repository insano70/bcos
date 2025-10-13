# Admin Command Center - Executive Summary

**Project:** Application Status, Performance & Caching Monitoring Dashboard  
**Status:** Design & Investigation Complete  
**Date:** 2025-10-13  
**Prepared By:** Development Team  

---

## Executive Overview

We propose building a unified **Admin Command Center** dashboard that consolidates application monitoring, performance tracking, security event detection, cache management, and at-risk user identification into a single, real-time interface.

### The Problem

Currently, application monitoring is fragmented:
- **Logging:** Exists in CloudWatch but requires manual query writing
- **Performance:** Tracked in logs but not visualized
- **Cache:** No admin tools or visibility into Redis operations
- **Security:** Events logged but no proactive monitoring dashboard
- **At-Risk Users:** Data exists but no UI for review

### The Solution

A comprehensive monitoring dashboard that provides:
1. **Real-Time System Health** - Single health score (0-100) with component breakdown
2. **Performance Metrics** - API response times, slow queries, error rates with trending
3. **Security Monitoring** - Live feed of security events and failed login attempts
4. **At-Risk User Detection** - Proactive identification of suspicious accounts
5. **Redis Cache Management** - Full admin tools for cache inspection and purging
6. **Historical Analysis** - Integration with CloudWatch for long-term trending

---

## Key Findings from Codebase Investigation

### ✅ Strong Foundations Already in Place

Your application already has **exceptional instrumentation** that we can leverage:

#### 1. Universal Logging System (100% Complete)
- **Location:** `lib/logger/`
- Structured JSON logging with automatic context capture
- Correlation ID tracking across requests
- HIPAA-compliant PII sanitization
- All 88 API routes fully instrumented
- **Quality:** Production-ready, zero console.log statements

#### 2. Security Event Tracking (Comprehensive)
- **Database Tables:**
  - `account_security` - Failed logins, lockouts, suspicious activity
  - `login_attempts` - Detailed attempt records with IP/user agent
  - `csrf_failure_events` - CSRF attack tracking
  - `audit_logs` - 7-year compliance audit trail
- **Instrumentation:**
  - Progressive lockout (3, 5, 10, 30 failed attempts)
  - Rate limiting with Redis (logs violations)
  - CSRF monitoring with severity levels

#### 3. Performance Tracking (Pervasive)
- **Every API route logs:**
  - Response time with slow detection (>1000ms)
  - Operation type and status code
  - Record counts and filter context
- **Database queries log:**
  - Query duration with slow detection (>500ms)
  - Table, operation type, row count
- **Thresholds defined:**
  - `SLOW_THRESHOLDS.DB_QUERY = 500ms`
  - `SLOW_THRESHOLDS.API_OPERATION = 1000ms`
  - `SLOW_THRESHOLDS.AUTH_OPERATION = 2000ms`

#### 4. Redis Infrastructure (Production-Ready)
- **Location:** `lib/redis.ts`, `lib/cache/`
- Singleton client with automatic reconnection
- Environment-based key prefixing
- Graceful degradation (falls back to database)
- Cache services: ChartDataCache, RateLimitCache

#### 5. CloudWatch Monitoring (Infrastructure Level)
- **Location:** `infrastructure/lib/constructs/monitoring.ts`
- Metric filters already configured:
  - ErrorCount, SecurityEvents, AuthenticationFailures
  - DatabaseErrors, PermissionDenials, HealthCheckFailures
- Alarms with SNS notifications
- Log group integration with ECS

### ❌ What's Missing (What We'll Build)

1. **No Centralized Metrics Aggregation**
   - Logs exist but no real-time metrics API
   - Need in-memory metrics collector for dashboard

2. **No Redis Admin Tools**
   - Cache data invisible to admins
   - No purging, inspection, or key management

3. **No At-Risk Users Dashboard**
   - Security data exists but no UI
   - No proactive alerting or bulk management

4. **No Real-Time Monitoring**
   - All metrics are post-hoc (CloudWatch queries)
   - Need live updates for critical metrics

5. **No Performance Visualization**
   - Slow queries logged but not aggregated
   - No trending or comparison charts

---

## Proposed Dashboard Layout

```
╔════════════════════════════════════════════════════════════════════╗
║  ADMIN COMMAND CENTER                    [🔄 Auto-refresh: 30s]  ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  ┌──────────┬──────────┬──────────┬──────────┬──────────────────┐ ║
║  │ ●● 94%   │  142     │  0.3%    │  234ms   │  ✓ OK            │ ║
║  │ HEALTH   │  USERS   │  ERRORS  │  LATENCY │  SECURITY        │ ║
║  │ ▲Healthy │  ▲ +12   │  ▼ -0.1% │  ▼ -50ms │  0 Threats       │ ║
║  └──────────┴──────────┴──────────┴──────────┴──────────────────┘ ║
║                                                                    ║
║  ┌──────────────────────────┬──────────────────────────┐         ║
║  │  API RESPONSE TIMES       │  ERROR RATE TRENDING     │         ║
║  │  [Line Chart: p50/p95/p99]│  [Line Chart: errors/min]│         ║
║  │  Shows 1-hour trending    │  Shows error patterns    │         ║
║  └──────────────────────────┴──────────────────────────┘         ║
║                                                                    ║
║  ┌──────────────────────────┬──────────────────────────┐         ║
║  │  REDIS CACHE STATS        │  SLOW QUERIES            │         ║
║  │  Hit Rate: 89.4% ▲        │  ┌────────────────────┐ │         ║
║  │  Memory: 245MB/512MB      │  │ Query │ Table │ ms │ │         ║
║  │  Keys: 4,231              │  │ SEL.. │ users │847 │ │         ║
║  │  Ops/sec: 156             │  └────────────────────┘ │         ║
║  │  [View Details] [Purge]   │  [View All →]           │         ║
║  └──────────────────────────┴──────────────────────────┘         ║
║                                                                    ║
║  ┌──────────────────────────┬──────────────────────────┐         ║
║  │  SECURITY EVENTS FEED     │  AT-RISK USERS           │         ║
║  │  🔴 14:32 Rate limit: ... │  ┌────────────────────┐ │         ║
║  │  🟡 14:30 Failed login    │  │ User │ Risk │ Stat │ │         ║
║  │  🟢 14:28 MFA success     │  │ j.d. │  85  │🔒Lock│ │         ║
║  │  🔴 14:25 CSRF blocked    │  │ smit │  62  │ ⚠️Risk│ │         ║
║  │  [View All →]             │  └────────────────────┘ │         ║
║  └──────────────────────────┴──────────────────────────┘         ║
║                                                                    ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │  REDIS ADMIN TOOLS                                         │  ║
║  │  [TAB: Overview] [TAB: Keys] [TAB: Operations]            │  ║
║  │  Search: [bcos:prod:*________] [Search] [Purge]           │  ║
║  │  • chart:data:* (1,234 keys, 45MB)                        │  ║
║  │  • ratelimit:* (892 keys, 2MB)                            │  ║
║  └────────────────────────────────────────────────────────────┘  ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## System Health Score Algorithm

The dashboard displays a single **System Health Score (0-100)** calculated from:

```typescript
function calculateHealthScore(metrics: Metrics): number {
  let score = 100;
  
  // Error Rate (25 points max deduction)
  if (metrics.errorRate > 5%) score -= 25;
  else if (metrics.errorRate > 2%) score -= 15;
  else if (metrics.errorRate > 1%) score -= 10;
  else if (metrics.errorRate > 0.5%) score -= 5;
  
  // Response Time p95 (25 points max deduction)
  if (metrics.responseTimeP95 > 2000ms) score -= 25;
  else if (metrics.responseTimeP95 > 1000ms) score -= 15;
  else if (metrics.responseTimeP95 > 500ms) score -= 10;
  else if (metrics.responseTimeP95 > 300ms) score -= 5;
  
  // Cache Hit Rate (20 points max deduction)
  if (metrics.cacheHitRate < 70%) score -= 20;
  else if (metrics.cacheHitRate < 80%) score -= 10;
  else if (metrics.cacheHitRate < 90%) score -= 5;
  
  // Database Latency p95 (15 points max deduction)
  if (metrics.dbLatencyP95 > 1000ms) score -= 15;
  else if (metrics.dbLatencyP95 > 500ms) score -= 10;
  else if (metrics.dbLatencyP95 > 300ms) score -= 5;
  
  // Security Incidents (15 points max deduction)
  if (metrics.securityIncidents > 10) score -= 15;
  else if (metrics.securityIncidents > 5) score -= 10;
  else if (metrics.securityIncidents > 0) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}
```

**Score Interpretation:**
- **90-100:** ●● Healthy (Green)
- **70-89:** ●● Degraded (Yellow)
- **< 70:** ●● Unhealthy (Red)

---

## At-Risk User Detection Algorithm

Users are assigned a **Risk Score (0-100)** based on:

```typescript
function calculateRiskScore(user: AtRiskUser): number {
  let score = 0;
  
  // Failed Login Attempts (30 points max)
  if (user.failedAttempts >= 10) score += 30;
  else if (user.failedAttempts >= 5) score += 20;
  else if (user.failedAttempts >= 3) score += 10;
  
  // Account Currently Locked (25 points)
  if (user.lockedUntil && user.lockedUntil > now) {
    score += 25;
  }
  
  // Suspicious Activity Flag (20 points)
  if (user.suspiciousActivity) score += 20;
  
  // Multiple IP Addresses (15 points max)
  if (user.uniqueIPs7d >= 10) score += 15;
  else if (user.uniqueIPs7d >= 5) score += 10;
  else if (user.uniqueIPs7d >= 3) score += 5;
  
  // Recent Attempt Frequency (10 points max)
  if (user.recentAttempts24h >= 20) score += 10;
  else if (user.recentAttempts24h >= 10) score += 7;
  else if (user.recentAttempts24h >= 5) score += 5;
  
  return Math.min(100, score);
}
```

**Risk Categories:**
- **80-100:** Critical Risk (Red badge, immediate review)
- **50-79:** High Risk (Amber badge, monitor closely)
- **20-49:** Medium Risk (Yellow badge, watch list)
- **0-19:** Low Risk (Gray badge, logging only)

---

## API Endpoints Summary

### Monitoring APIs
```
GET  /api/admin/monitoring/metrics
     → Real-time metrics from in-memory collector
     → System health, performance, cache, security stats

GET  /api/admin/monitoring/security-events
     → Recent security events from CloudWatch
     → Filtered by severity, time range

GET  /api/admin/monitoring/at-risk-users
     → Users with failed logins or suspicious activity
     → Risk scores, factors, recent attempt history

GET  /api/admin/monitoring/slow-queries
     → Database queries exceeding SLOW_THRESHOLDS
     → From CloudWatch Logs Insights

GET  /api/admin/monitoring/errors
     → Recent errors grouped by endpoint/type
     → Error rates and trending
```

### Redis Admin APIs
```
GET  /api/admin/redis/stats
     → Redis INFO statistics (memory, keys, ops/sec)
     → Hit rate, command statistics

GET  /api/admin/redis/keys?pattern=*
     → Search keys by pattern
     → Returns key type, TTL, size

GET  /api/admin/redis/inspect?key=...
     → View key details and value
     → Type-specific formatting

POST /api/admin/redis/purge
     → Delete keys by pattern
     → Requires confirmation, logs to audit

POST /api/admin/redis/ttl
     → Update TTL for keys by pattern
     → Bulk TTL extension
```

**All endpoints protected with:**
- RBAC: `settings:read:all` or `settings:write:all`
- Rate Limiting: 10 requests/minute per user
- Audit Logging: All write operations logged

---

## Data Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  APPLICATION (API Routes)                                        │
│  - Every request logs via log.api()                              │
│  - Every DB query logs via log.db()                              │
│  - Every security event logs via log.security()                  │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  UNIVERSAL LOGGER (lib/logger/)                                  │
│  - Structured JSON with correlation IDs                          │
│  - Automatic context capture (file, line, function)              │
│  - PII sanitization                                              │
└────────┬───────────────────────────────┬─────────────────────────┘
         │                               │
         ▼                               ▼
┌──────────────────────────┐    ┌────────────────────────────────┐
│  CloudWatch Logs          │    │  MetricsCollector (NEW)        │
│  - Persistent storage     │    │  - In-memory counters          │
│  - Log groups by env      │    │  - 5-minute rolling window     │
│  - Retention: 7 years     │    │  - Request counts by endpoint  │
│  - Metric filters & alarms│    │  - Response time arrays (p95)  │
└────────┬─────────────────┘    │  - Error counts                │
         │                       │  - Cache hit/miss tracking     │
         │                       └────────┬───────────────────────┘
         │                                │
         ▼                                ▼
┌──────────────────────────┐    ┌────────────────────────────────┐
│  CloudWatch Logs Insights │    │  Monitoring API Endpoints      │
│  - SQL-like queries       │    │  - /metrics (real-time)        │
│  - Aggregations           │    │  - /security-events (CW)       │
│  - Filtering              │    │  - /at-risk-users (DB)         │
│  - Historical data (7d+)  │    │  - /slow-queries (CW)          │
└────────┬─────────────────┘    └────────┬───────────────────────┘
         │                                │
         └────────────┬───────────────────┘
                      ▼
         ┌─────────────────────────────┐
         │  Admin Command Center        │
         │  Dashboard (React/Next.js)   │
         │  - Real-time updates (30s)   │
         │  - Chart.js visualizations   │
         │  - Interactive tables        │
         │  - Redis admin tools         │
         └─────────────────────────────┘
```

### Data Flow Details

**Real-Time Metrics (< 5 minutes):**
- Source: MetricsCollector (in-memory)
- Update Frequency: Every 30 seconds (dashboard polling)
- Retention: 5-minute rolling window
- Use Cases: System health score, active users, current error rate

**Recent Historical (1h - 24h):**
- Source: CloudWatch Logs Insights
- Query Time: 2-5 seconds
- Retention: 7 years
- Use Cases: Security events, slow queries, error trending

**Database Queries:**
- Source: PostgreSQL (direct)
- Query Time: < 100ms
- Use Cases: At-risk users, account security, login attempts

**Redis Stats:**
- Source: Redis INFO command
- Query Time: < 50ms
- Use Cases: Cache statistics, key counts, memory usage

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14 (existing)
- **UI Components:** React with Tailwind CSS (existing)
- **Charts:** Chart.js with existing chartjs-config.tsx
- **State Management:** React hooks + React Query
- **Theme:** Existing dark mode support with brand color #00AEEF

### Backend
- **API Routes:** Next.js API routes with RBAC (existing)
- **Database:** PostgreSQL with Drizzle ORM (existing)
- **Cache:** Redis/Valkey with ioredis (existing)
- **Logging:** Universal logger with CloudWatch (existing)
- **Monitoring:** CloudWatch Logs Insights (existing)

### New Components
- **MetricsCollector:** In-memory metrics aggregation service
- **CloudWatch Query Helper:** Simplified CloudWatch Logs Insights interface
- **Redis Admin Service:** Cache management operations

---

## Implementation Timeline

### Phase 1: Foundation (Week 1)
**Goal:** Basic dashboard with real-time metrics

**Tasks:**
- [ ] Create `lib/monitoring/metrics-collector.ts`
  - In-memory metrics tracking
  - Request/error/duration recording
  - Snapshot generation with reset
- [ ] Create `app/api/admin/monitoring/metrics/route.ts`
  - Integrate MetricsCollector
  - Calculate system health score
  - Fetch basic Redis stats
- [ ] Create dashboard page `app/(default)/admin/command-center/page.tsx`
- [ ] Build KPI cards component (health, users, errors, latency)
- [ ] Integrate with existing RBAC and theme

**Deliverable:** Dashboard showing real-time health score and basic metrics

---

### Phase 2: Security Monitoring (Week 2)
**Goal:** Security events and at-risk users

**Tasks:**
- [ ] Create `lib/monitoring/cloudwatch-queries.ts`
  - Helper functions for CloudWatch Logs Insights
  - Query templating for security events
- [ ] Create `app/api/admin/monitoring/security-events/route.ts`
  - Query CloudWatch for security events
  - Filter by severity, time range
- [ ] Create `app/api/admin/monitoring/at-risk-users/route.ts`
  - Query account_security and login_attempts tables
  - Calculate risk scores
  - Enrich with recent activity stats
- [ ] Build SecurityEventsFeed component
- [ ] Build AtRiskUsersPanel component
- [ ] Add severity icons and risk badges

**Deliverable:** Security monitoring tab with live events and at-risk user list

---

### Phase 3: Redis Management (Week 3)
**Goal:** Full Redis cache admin tools

**Tasks:**
- [ ] Create `lib/monitoring/redis-admin.ts`
  - Key search and filtering
  - Bulk operations (purge by pattern)
  - Key inspection utilities
- [ ] Create `app/api/admin/redis/stats/route.ts`
  - Parse Redis INFO
  - Calculate hit rates and memory usage
- [ ] Create `app/api/admin/redis/keys/route.ts`
  - Pattern-based key search
  - Pagination support
- [ ] Create `app/api/admin/redis/purge/route.ts`
  - Preview mode (count only)
  - Confirmed purge with audit logging
- [ ] Build RedisCacheStats component
- [ ] Build RedisAdminTools component with tabs
- [ ] Add confirmation modals for dangerous operations

**Deliverable:** Redis cache management interface with purge/inspect tools

---

### Phase 4: Performance Visualization (Week 4)
**Goal:** Charts and slow query tracking

**Tasks:**
- [ ] Create `app/api/admin/monitoring/slow-queries/route.ts`
  - Query CloudWatch for slow DB queries
  - Aggregate by table and operation
- [ ] Create `app/api/admin/monitoring/errors/route.ts`
  - Query CloudWatch for errors
  - Group by endpoint and error type
- [ ] Build PerformanceCharts component
  - Line charts for response times (p50/p95/p99)
  - Line charts for error rate trending
  - Use existing Chart.js configuration
- [ ] Build SlowQueriesPanel component
  - Sortable table of slow queries
  - Link to CloudWatch for full context
- [ ] Add chart tooltips and annotations (slow thresholds)

**Deliverable:** Performance visualization with trending and slow query identification

---

### Phase 5: Polish & Launch (Week 5)
**Goal:** Production-ready dashboard

**Tasks:**
- [ ] Add auto-refresh controls (5s, 30s, 1m, off)
- [ ] Add time range selector (1h, 6h, 24h, 7d, custom)
- [ ] Add export functionality (CSV, JSON)
- [ ] Add filtering and search to all tables
- [ ] Performance optimization:
  - [ ] Cache dashboard data (30s TTL)
  - [ ] Implement query result caching
  - [ ] Optimize CloudWatch query patterns
- [ ] Comprehensive testing:
  - [ ] Unit tests for risk score calculations
  - [ ] Integration tests for API endpoints
  - [ ] E2E tests for dashboard interactions
- [ ] Documentation:
  - [ ] Admin user guide
  - [ ] API documentation
  - [ ] Runbook for common operations
- [ ] Security audit:
  - [ ] Verify RBAC on all endpoints
  - [ ] Test PII redaction
  - [ ] Audit log coverage

**Deliverable:** Production-ready Admin Command Center

---

## Resource Requirements

### Development Time
- **Total:** 5 weeks (1 developer full-time)
- **Phase 1:** 1 week (foundation)
- **Phase 2:** 1 week (security monitoring)
- **Phase 3:** 1 week (Redis management)
- **Phase 4:** 1 week (performance visualization)
- **Phase 5:** 1 week (polish & testing)

### Infrastructure
- **No new infrastructure required**
- Leverages existing:
  - CloudWatch Logs (already configured)
  - Redis/Valkey (already deployed)
  - PostgreSQL (existing tables)
  - Next.js application (existing platform)

### Ongoing Costs
- **Minimal additional cost**
- CloudWatch Logs Insights queries: ~$0.005 per GB scanned
- Expected usage: < $10/month for admin queries
- Redis memory: No increase (viewing existing data)

---

## Success Metrics

### Operational Efficiency
- **Reduce MTTD (Mean Time to Detect)** issues by 50%
  - Current: Manual CloudWatch query discovery (10-30 minutes)
  - Target: Real-time dashboard alerts (< 1 minute)
- **Reduce MTTR (Mean Time to Resolve)** by 40%
  - Current: Debugging without context (30-60 minutes)
  - Target: Full context in dashboard (10-20 minutes)
- **Proactive User Protection**
  - Identify at-risk users before account compromise
  - Block suspicious activity within 5 minutes

### System Health
- **Maintain 95%+ health score** during normal operations
- **Keep p95 response times < 500ms** for all critical endpoints
- **Maintain cache hit rate > 90%** for frequently accessed data
- **Zero undetected security incidents**

### Admin Productivity
- **Reduce time spent on cache management** from 15 min to 2 min
- **Eliminate manual CloudWatch queries** for common operations
- **Enable non-technical admins** to perform basic monitoring

---

## Risk Mitigation

### Technical Risks

**Risk: CloudWatch query performance**
- *Mitigation:* Cache query results for 30 seconds, limit time ranges
- *Fallback:* In-memory metrics for real-time data

**Risk: In-memory metrics loss on restart**
- *Mitigation:* 5-minute window acceptable for loss
- *Fallback:* Immediately rebuild from CloudWatch on startup

**Risk: Redis admin operations impact production**
- *Mitigation:* Require confirmation for dangerous operations
- *Fallback:* Rate limit admin endpoints, audit all operations

### Security Risks

**Risk: Exposing sensitive data in dashboard**
- *Mitigation:* PII redaction in all displayed data
- *Fallback:* Strict RBAC, audit log access

**Risk: Unauthorized cache purging**
- *Mitigation:* Require `settings:write:all` permission
- *Fallback:* Audit log, implement undo mechanism

---

## Next Steps

### Immediate Actions
1. **Review this design document** with stakeholders
2. **Prioritize features** if timeline needs compression
3. **Approve Phase 1 implementation** to begin development
4. **Set up project tracking** (GitHub project board)

### Open Questions
1. Do we need real-time streaming (SSE/WebSocket) or is 30s polling acceptable?
2. Should we implement undo/rollback for cache purge operations?
3. Do we need alerting integration (email/Slack) for critical health scores?
4. Should we add user behavior analytics (most active users, feature adoption)?

---

## Appendix: Related Documentation

**Design Documents:**
1. `docs/monitoring-dashboard-design.md` - Full technical specification Part 1
2. `docs/monitoring-dashboard-design-part2.md` - Component specifications
3. `docs/monitoring-dashboard-design-part3.md` - API endpoints and Redis admin

**Existing System Documentation:**
1. `docs/logging_strategy.md` - Universal logging system
2. `docs/redis_plan.md` - Redis caching architecture
3. `infrastructure/lib/constructs/monitoring.ts` - CloudWatch configuration
4. `CLAUDE.md` - Development guidelines and logging patterns

**Database Schema:**
1. `lib/db/refresh-token-schema.ts` - account_security, login_attempts
2. `lib/db/csrf-schema.ts` - csrf_failure_events
3. `lib/db/audit-schema.ts` - audit_logs

**Code References:**
1. `lib/logger/` - Universal logger implementation
2. `lib/redis.ts` - Redis client singleton
3. `lib/cache/` - Cache services (ChartDataCache, RateLimitCache)
4. `lib/auth/security.ts` - Security functions (recordFailedAttempt, isAccountLocked)
5. `components/charts/chartjs-config.tsx` - Chart.js theme configuration

---

**End of Executive Summary**

