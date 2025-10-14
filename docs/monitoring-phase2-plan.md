# Phase 2: Security Monitoring - Implementation Plan

**Status:** Ready for Implementation  
**Created:** 2025-10-14  
**Duration:** 1 week (estimated)  
**Dependencies:** Phase 1 (Complete ✅)

---

## Table of Contents

1. [Overview](#overview)
2. [Data Sources](#data-sources)
3. [API Endpoints](#api-endpoints)
4. [UI Components](#ui-components)
5. [Risk Score Algorithm](#risk-score-algorithm)
6. [Implementation Tasks](#implementation-tasks)
7. [Testing Strategy](#testing-strategy)

---

## Overview

### Goals

Phase 2 adds comprehensive security monitoring capabilities:
- **Security Events Feed** - Real-time view of security incidents from CloudWatch
- **At-Risk Users Panel** - Proactive identification of suspicious accounts
- **CSRF Attack Tracking** - Monitor cross-site request forgery attempts
- **Login History** - Detailed view of login attempts per user
- **User Security Actions** - Unlock accounts, clear failed attempts

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Security Events Feed                At-Risk Users Panel         │
│  ┌─────────────────────┐            ┌─────────────────────┐     │
│  │ 🔴 14:32 Rate limit │            │ User │ Risk │ Status │     │
│  │ 🟡 14:30 Failed login│           │ j.d. │  85  │ 🔒Lock │     │
│  │ 🟢 14:28 MFA success │            │ smith│  62  │ ⚠️ Risk │     │
│  │ 🔴 14:25 CSRF blocked│            └─────────────────────┘     │
│  │                      │            [Review] [Export]            │
│  │ [View All →]         │                                        │
│  └─────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### 1. CloudWatch Logs (Security Events)

**Source:** Structured logs from Universal Logger

**Query Pattern:**
```sql
fields @timestamp, event, severity, action, threat, blocked, message, ipAddress, userId, userAgent
| filter component = "security" OR severity in ["high", "critical"]
| filter @timestamp > ago(1h)
| sort @timestamp desc
| limit 50
```

**Event Types Tracked:**
- `rate_limit_exceeded` - Rate limiting blocks
- `csrf_validation_failed` - CSRF attack attempts
- `rbac_permission_denied` - Unauthorized access attempts
- `login_failed` - Failed authentication (from auth component)
- `mfa_verification_failed` - MFA failures
- `suspicious_activity_detected` - Flagged by security algorithms

### 2. Database (At-Risk Users)

**Tables Used:**

**account_security:**
```sql
SELECT 
  user_id,
  failed_login_attempts,
  last_failed_attempt,
  locked_until,
  suspicious_activity_detected,
  lockout_reason
FROM account_security
WHERE 
  failed_login_attempts > 0
  OR locked_until > NOW()
  OR suspicious_activity_detected = true;
```

**login_attempts:**
```sql
SELECT 
  user_id,
  COUNT(*) FILTER (WHERE success = false AND attempted_at > NOW() - INTERVAL '24 hours') as failed_24h,
  COUNT(DISTINCT ip_address) FILTER (WHERE attempted_at > NOW() - INTERVAL '7 days') as unique_ips_7d,
  MAX(attempted_at) as last_attempt
FROM login_attempts
GROUP BY user_id;
```

**csrf_failure_events:**
```sql
SELECT 
  COUNT(*) as csrf_blocks,
  COUNT(DISTINCT ip_address) as unique_attack_ips
FROM csrf_failure_events
WHERE timestamp > NOW() - INTERVAL '1 hour';
```

---

## API Endpoints

### 1. Security Events API

**Endpoint:** `GET /api/admin/monitoring/security-events`

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  limit?: number,        // Default: 50, Max: 500
  severity?: string[],   // ['critical', 'high', 'medium', 'low']
  timeRange?: string,    // '1h', '6h', '24h', '7d' (default: '1h')
  eventType?: string[],  // Filter by specific event types
}
```

**Response:**
```typescript
{
  events: [
    {
      id: string,                                    // evt_{pointer}
      timestamp: string,                             // ISO 8601
      event: string,                                 // 'rate_limit_exceeded', 'csrf_validation_failed', etc.
      severity: 'critical' | 'high' | 'medium' | 'low',
      action: string,                                // 'rate_limit_block', 'csrf_block', etc.
      threat?: string,                               // 'dos_attempt', 'csrf_attack', etc.
      blocked: boolean,                              // Whether the threat was blocked
      details: {
        ipAddress?: string,
        userId?: string,
        userAgent?: string,
        pathname?: string,
        reason?: string,
        // ... other event-specific details
      },
      message: string,                               // Human-readable message
    }
  ],
  totalCount: number,
  summary: {
    critical: number,
    high: number,
    medium: number,
    low: number,
  },
  timeRange: string,
}
```

**Implementation Notes:**
- Query CloudWatch Logs Insights asynchronously
- Parse CloudWatch results into typed SecurityEvent objects
- Filter by severity and event type
- Sort by timestamp descending (most recent first)
- Cache results for 30 seconds to reduce CloudWatch costs

---

### 2. At-Risk Users API

**Endpoint:** `GET /api/admin/monitoring/at-risk-users`

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  limit?: number,           // Default: 50, Max: 500
  minRiskScore?: number,    // Filter by minimum risk score (0-100)
  status?: string[],        // ['locked', 'suspicious', 'monitoring']
  sortBy?: string,          // 'riskScore', 'failedAttempts', 'lastFailedAttempt'
  sortOrder?: string,       // 'asc', 'desc' (default: 'desc')
}
```

**Response:**
```typescript
{
  users: [
    {
      userId: string,
      email: string,
      firstName: string,
      lastName: string,
      failedAttempts: number,
      lastFailedAttempt: string | null,
      lockedUntil: string | null,
      suspiciousActivity: boolean,
      lockoutReason: string | null,
      riskScore: number,              // 0-100 calculated score
      riskFactors: string[],          // Human-readable risk factors
      recentAttempts24h: number,
      uniqueIPs7d: number,
      lastLoginIP?: string,
      lastLoginAt?: string,
    }
  ],
  totalCount: number,
  summary: {
    locked: number,
    suspicious: number,
    monitoring: number,
  },
}
```

---

### 3. Login History API

**Endpoint:** `GET /api/admin/monitoring/login-history`

**RBAC:** `settings:read:all` (Super Admin only)

**Query Parameters:**
```typescript
{
  userId?: string,          // Required: User ID to get history for
  limit?: number,           // Default: 50, Max: 500
  successOnly?: boolean,    // Filter to successful logins only
  failureOnly?: boolean,    // Filter to failed logins only
}
```

**Response:**
```typescript
{
  userId: string,
  attempts: [
    {
      attemptId: string,
      email: string,
      ipAddress: string,
      userAgent: string,
      deviceFingerprint?: string,
      success: boolean,
      failureReason?: string,
      rememberMeRequested: boolean,
      sessionId?: string,
      attemptedAt: string,
      location?: string,      // Derived from IP (future)
    }
  ],
  totalCount: number,
  summary: {
    totalAttempts: number,
    successfulLogins: number,
    failedAttempts: number,
    uniqueIPs: number,
    mostRecentSuccess?: string,
    mostRecentFailure?: string,
  },
}
```

---

### 4. User Security Actions APIs

**A. Unlock Account**

**Endpoint:** `POST /api/admin/monitoring/users/[userId]/unlock`

**RBAC:** `settings:write:all` (Super Admin only)

**Request Body:**
```typescript
{
  reason: string,  // Required: Reason for unlocking
}
```

**Response:**
```typescript
{
  success: boolean,
  userId: string,
  previousStatus: {
    failedAttempts: number,
    lockedUntil: string | null,
  },
  message: string,
}
```

**Implementation:**
- Clear `failed_login_attempts`
- Set `locked_until` to NULL
- Set `suspicious_activity_detected` to false
- Log to audit_logs with admin user ID and reason

**B. Clear Failed Attempts**

**Endpoint:** `POST /api/admin/monitoring/users/[userId]/clear-attempts`

**RBAC:** `settings:write:all` (Super Admin only)

**Implementation:**
- Set `failed_login_attempts` to 0
- Keep `locked_until` unchanged
- Log to audit_logs

**C. Flag/Unflag User**

**Endpoint:** `POST /api/admin/monitoring/users/[userId]/flag`

**Request Body:**
```typescript
{
  flag: boolean,      // true to flag, false to unflag
  reason: string,     // Required reason
}
```

**Implementation:**
- Update `suspicious_activity_detected` boolean
- Log to audit_logs with reason

---

## UI Components

### 1. SecurityEventsFeed Component

**File:** `app/(default)/admin/command-center/components/security-events-feed.tsx`

**Features:**
- Live scrolling feed (max height with overflow)
- Color-coded severity indicators (🔴 critical/high, 🟡 medium, 🟢 low)
- Click to expand event details
- Filter by severity
- Auto-refresh every 30 seconds
- "View All" link to dedicated security events page (future)

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold">Security Events</h3>
    <div className="flex items-center gap-2">
      {/* Severity Filter */}
      <select className="text-sm border rounded px-2 py-1">
        <option>All Severities</option>
        <option>Critical</option>
        <option>High</option>
        <option>Medium</option>
        <option>Low</option>
      </select>
      <button onClick={refresh}>🔄</button>
    </div>
  </div>
  
  {/* Live Feed */}
  <div className="space-y-3 max-h-96 overflow-y-auto">
    {events.map((event) => (
      <SecurityEventItem key={event.id} event={event} />
    ))}
  </div>
  
  {/* Summary Footer */}
  <div className="mt-4 pt-4 border-t flex justify-between">
    <div className="text-sm text-gray-600">
      {totalCount} events (last {timeRange})
    </div>
    <Link href="/admin/security/events" className="text-sm text-violet-600">
      View all →
    </Link>
  </div>
</div>
```

---

### 2. AtRiskUsersPanel Component

**File:** `app/(default)/admin/command-center/components/at-risk-users-panel.tsx`

**Features:**
- Sortable table by risk score, failed attempts, last attempt
- Risk score badge with color coding (red >80, amber 50-79, yellow 20-49)
- Status badges (🔒 Locked, ⚠️ Suspicious, 👁 Monitoring)
- Click user to view detailed security profile
- Bulk actions (export, unlock multiple)
- Filter by status

**Visual Design:**
```tsx
<div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-semibold">At-Risk Users</h3>
    <div className="flex gap-2">
      <Badge variant="red">{summary.locked} Locked</Badge>
      <Badge variant="amber">{summary.suspicious} Suspicious</Badge>
    </div>
  </div>
  
  {/* Summary Cards */}
  <div className="grid grid-cols-3 gap-4 mb-6">
    <StatCard label="Locked" value={summary.locked} color="red" />
    <StatCard label="Suspicious" value={summary.suspicious} color="amber" />
    <StatCard label="Monitoring" value={summary.monitoring} color="gray" />
  </div>
  
  {/* Users Table */}
  <table className="min-w-full">
    <thead>
      <tr>
        <th>User</th>
        <th>Risk Score</th>
        <th>Failed Attempts</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {users.map((user) => (
        <AtRiskUserRow key={user.userId} user={user} />
      ))}
    </tbody>
  </table>
</div>
```

---

### 3. UserDetailModal Component

**File:** `app/(default)/admin/command-center/components/user-detail-modal.tsx`

**Features:**
- Full user security profile
- Login history (last 50 attempts)
- Geographic map of login locations (future)
- Risk factor breakdown
- Action buttons (unlock, clear attempts, flag)

**Sections:**
1. **User Info** - Name, email, current status
2. **Risk Assessment** - Score, factors, timeline
3. **Recent Activity** - Login attempts with success/failure
4. **IP Address Analysis** - Unique IPs, geographic distribution
5. **Device Analysis** - Device fingerprints, user agents
6. **Admin Actions** - Unlock, clear, flag buttons

---

## Risk Score Algorithm

### Calculation Logic

**File:** `lib/monitoring/risk-score.ts`

```typescript
export function calculateRiskScore(user: AtRiskUserData): number {
  let score = 0;
  
  // Failed Login Attempts (30 points max)
  if (user.failedAttempts >= 10) score += 30;
  else if (user.failedAttempts >= 5) score += 20;
  else if (user.failedAttempts >= 3) score += 10;
  
  // Account Currently Locked (25 points)
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    score += 25;
  }
  
  // Suspicious Activity Flag (20 points)
  // Set automatically at 3+ failed attempts
  if (user.suspiciousActivity) score += 20;
  
  // Multiple IP Addresses (15 points max)
  // Indicates potential account sharing or compromise
  if (user.uniqueIPs7d >= 10) score += 15;
  else if (user.uniqueIPs7d >= 5) score += 10;
  else if (user.uniqueIPs7d >= 3) score += 5;
  
  // Recent Attempt Frequency (10 points max)
  // High frequency indicates brute force or credential stuffing
  if (user.recentAttempts24h >= 20) score += 10;
  else if (user.recentAttempts24h >= 10) score += 7;
  else if (user.recentAttempts24h >= 5) score += 5;
  
  return Math.min(100, score);
}

export function getRiskCategory(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

export function getRiskFactors(user: AtRiskUserData): string[] {
  const factors: string[] = [];
  
  if (user.failedAttempts >= 5) {
    factors.push(`Multiple failed login attempts (${user.failedAttempts})`);
  }
  
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    factors.push('Account currently locked');
  }
  
  if (user.suspiciousActivity) {
    factors.push('Flagged for suspicious activity');
  }
  
  if (user.uniqueIPs7d >= 5) {
    factors.push(`Unusual IP addresses (${user.uniqueIPs7d} different IPs in 7 days)`);
  }
  
  if (user.recentAttempts24h >= 10) {
    factors.push(`High frequency attempts (${user.recentAttempts24h} attempts in 24 hours)`);
  }
  
  return factors;
}
```

### Risk Thresholds

| Risk Score | Category | Badge Color | Action Required |
|------------|----------|-------------|-----------------|
| 80-100 | Critical | Red | Immediate review, likely account compromise |
| 50-79 | High | Amber | Review within 24 hours, monitor closely |
| 20-49 | Medium | Yellow | Watch list, no immediate action |
| 0-19 | Low | Gray | Logging only, routine monitoring |

---

## CloudWatch Integration

### Helper Functions

**File:** `lib/monitoring/cloudwatch-queries.ts`

```typescript
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

/**
 * Query CloudWatch Logs Insights
 * 
 * @param query - CloudWatch Logs Insights query string
 * @param timeRange - Time range (e.g., '1h', '24h')
 * @returns Parsed query results
 */
export async function queryCloudWatchLogs(
  query: string,
  timeRange: string = '1h'
): Promise<Array<Record<string, any>>> {
  // Parse time range to start/end times
  const { startTime, endTime } = parseTimeRange(timeRange);
  
  // Get CloudWatch client
  const client = getCloudWatchLogsClient();
  
  // Start query
  const startCommand = new StartQueryCommand({
    logGroupName: getLogGroupName(),
    startTime,
    endTime,
    queryString: query,
  });
  
  const startResult = await client.send(startCommand);
  const queryId = startResult.queryId;
  
  if (!queryId) {
    throw new Error('Failed to start CloudWatch query');
  }
  
  // Poll for results (max 30 seconds)
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    const getCommand = new GetQueryResultsCommand({ queryId });
    const result = await client.send(getCommand);
    
    if (result.status === 'Complete') {
      return parseQueryResults(result.results || []);
    }
    
    if (result.status === 'Failed' || result.status === 'Cancelled') {
      throw new Error(`CloudWatch query ${result.status.toLowerCase()}`);
    }
    
    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('CloudWatch query timeout');
}

/**
 * Get CloudWatch Logs client
 */
function getCloudWatchLogsClient(): CloudWatchLogsClient {
  return new CloudWatchLogsClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

/**
 * Get log group name based on environment
 */
function getLogGroupName(): string {
  const environment = process.env.ENVIRONMENT || 'development';
  return `/aws/ecs/bcos-${environment}`;
}

/**
 * Parse time range to Unix timestamps
 */
function parseTimeRange(timeRange: string): { startTime: number; endTime: number } {
  const endTime = Math.floor(Date.now() / 1000);
  let startTime: number;
  
  switch (timeRange) {
    case '5m':
      startTime = endTime - 5 * 60;
      break;
    case '15m':
      startTime = endTime - 15 * 60;
      break;
    case '1h':
      startTime = endTime - 60 * 60;
      break;
    case '6h':
      startTime = endTime - 6 * 60 * 60;
      break;
    case '24h':
      startTime = endTime - 24 * 60 * 60;
      break;
    case '7d':
      startTime = endTime - 7 * 24 * 60 * 60;
      break;
    default:
      startTime = endTime - 60 * 60; // Default: 1 hour
  }
  
  return { startTime, endTime };
}

/**
 * Parse CloudWatch query results
 */
function parseQueryResults(results: any[]): Array<Record<string, any>> {
  return results.map((result) => {
    const parsed: Record<string, any> = {};
    
    for (const field of result) {
      if (field.field && field.value !== null && field.value !== undefined) {
        parsed[field.field] = field.value;
      }
    }
    
    return parsed;
  });
}
```

**Note:** CloudWatch SDK integration requires AWS credentials configured in environment.

---

## Implementation Tasks (20 Tasks)

### Backend (Tasks 1-4, 10-13)

**1. CloudWatch Helper** - `lib/monitoring/cloudwatch-queries.ts`
- CloudWatch Logs client setup
- Query execution with polling
- Result parsing
- Time range handling

**2. Risk Score Utility** - `lib/monitoring/risk-score.ts`
- Risk score calculation algorithm
- Risk factor generation
- Category determination
- Badge color helpers

**3. Security Events API** - `app/api/admin/monitoring/security-events/route.ts`
- CloudWatch query construction
- Event filtering and sorting
- Response transformation
- RBAC protection

**4. At-Risk Users API** - `app/api/admin/monitoring/at-risk-users/route.ts`
- Complex database query with joins
- Risk score calculation
- User enrichment with login stats
- Sorting and filtering

**10. Types Extensions** - `lib/monitoring/types.ts`
- SecurityEventsResponse interface
- AtRiskUsersResponse interface
- LoginHistoryResponse interface

**11. CSRF Blocks Tracking** - Update security metrics API
- Query `csrf_failure_events` table
- Add to security metrics count
- Include in SecurityStatusKPI

**12. Login History API** - `app/api/admin/monitoring/login-history/route.ts`
- Query `login_attempts` table
- Filter by user, success/failure
- Calculate summary stats

**13. User Security Actions** - Create action endpoints
- Unlock account endpoint
- Clear failed attempts endpoint
- Flag/unflag user endpoint
- All with audit logging

### Frontend (Tasks 5-9, 14-16)

**5. SecurityEventsFeed** - Main feed component
- Event list with severity icons
- Expandable details
- Filtering controls
- Auto-refresh

**6. AtRiskUsersPanel** - Users table component
- Risk score badges
- Status indicators
- Sortable columns
- Row actions

**7. UserDetailModal** - User security details
- Full profile view
- Login history
- Risk factor breakdown
- Action buttons

**8. SecurityStatusKPI Update** - Add interactivity
- Click to view security events
- Link to full security dashboard

**9. Dashboard Page Update** - Replace Row 4 placeholders
- Integrate SecurityEventsFeed
- Integrate AtRiskUsersPanel
- Wire up data fetching

**14. SecurityEventDetails** - Event detail view
- Full event context
- Stack traces for errors
- Related events (same IP/user)

**15. Filtering UI** - Add filters to panels
- Severity filter (security events)
- Status filter (at-risk users)
- Time range selector
- Search/filter controls

**16. Export Functionality** - CSV/JSON export
- Export security events
- Export at-risk users list
- Download with timestamp

### Testing & QA (Tasks 17-20)

**17. Test Security Events API**
- Mock CloudWatch responses
- Test filtering and sorting
- Verify RBAC protection

**18. Test At-Risk Users API**
- Test risk score calculation
- Verify database queries
- Test edge cases (no data, locked users)

**19. Test Dashboard Panels**
- Verify real-time updates
- Test user interactions
- Test error handling

**20. Quality Checks**
- pnpm tsc (TypeScript)
- pnpm lint (Biome)
- Fix all errors

---

## Dependencies

### NPM Packages (May Need to Install)

```json
{
  "@aws-sdk/client-cloudwatch-logs": "^3.x.x"
}
```

**Installation:**
```bash
pnpm add @aws-sdk/client-cloudwatch-logs
```

### Environment Variables

```bash
# Required for CloudWatch integration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx  # Or use IAM role in ECS
AWS_SECRET_ACCESS_KEY=xxx

# CloudWatch log group (auto-derived from ENVIRONMENT)
# Format: /aws/ecs/bcos-{environment}
ENVIRONMENT=development|staging|production
```

---

## Testing Strategy

### Unit Tests

**Risk Score Calculation:**
```typescript
describe('calculateRiskScore', () => {
  it('calculates critical risk for locked accounts with many failures', () => {
    const score = calculateRiskScore({
      failedAttempts: 10,
      lockedUntil: new Date(Date.now() + 3600000).toISOString(),
      suspiciousActivity: true,
      uniqueIPs7d: 8,
      recentAttempts24h: 15,
    });
    expect(score).toBeGreaterThan(80);
  });
  
  it('calculates low risk for clean accounts', () => {
    const score = calculateRiskScore({
      failedAttempts: 0,
      lockedUntil: null,
      suspiciousActivity: false,
      uniqueIPs7d: 1,
      recentAttempts24h: 0,
    });
    expect(score).toBe(0);
  });
});
```

### Integration Tests

**Security Events API:**
```typescript
describe('GET /api/admin/monitoring/security-events', () => {
  it('requires super admin permission', async () => {
    const response = await request(app)
      .get('/api/admin/monitoring/security-events')
      .set('Authorization', `Bearer ${normalUserToken}`);
    
    expect(response.status).toBe(403);
  });
  
  it('returns security events for super admin', async () => {
    const response = await request(app)
      .get('/api/admin/monitoring/security-events')
      .set('Authorization', `Bearer ${superAdminToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.events).toBeInstanceOf(Array);
    expect(response.body.summary).toBeDefined();
  });
});
```

### Manual Testing Checklist

- [ ] View security events feed with real data
- [ ] Filter events by severity
- [ ] Expand event details
- [ ] View at-risk users table
- [ ] Sort by risk score, failed attempts
- [ ] Click user to view security details
- [ ] View login history for user
- [ ] Unlock a locked account (test environment)
- [ ] Clear failed attempts
- [ ] Flag/unflag user
- [ ] Export security events to CSV
- [ ] Verify auto-refresh works
- [ ] Test with empty data (no events, no at-risk users)

---

## Success Criteria

### Functional Requirements

- ✅ Security events display in real-time (30s refresh)
- ✅ At-risk users identified and scored accurately
- ✅ Risk scores calculated based on documented algorithm
- ✅ User security actions work (unlock, clear, flag)
- ✅ Login history shows complete attempt records
- ✅ Filtering works for severity and status
- ✅ Export functionality produces valid CSV/JSON
- ✅ All endpoints protected with RBAC
- ✅ All write operations logged to audit_logs

### Performance Requirements

- ✅ Security events API responds in < 2 seconds
- ✅ At-risk users API responds in < 500ms
- ✅ CloudWatch queries complete in < 5 seconds
- ✅ Dashboard remains responsive during refresh

### Security Requirements

- ✅ All endpoints require `settings:read:all` or `settings:write:all`
- ✅ PII redacted in security events (partial email/IP masking)
- ✅ All admin actions logged to audit_logs
- ✅ User security actions include required reason field
- ✅ No sensitive data exposed in error messages

---

## Estimated Timeline

**Day 1: Backend Foundation (6 hours)**
- CloudWatch helper (2 hours)
- Risk score utility (1 hour)
- Security events API (2 hours)
- At-risk users API (1 hour)

**Day 2: User Actions & Types (4 hours)**
- Login history API (1 hour)
- User action endpoints (2 hours)
- Type definitions (1 hour)

**Day 3: UI Components (6 hours)**
- SecurityEventsFeed component (2 hours)
- AtRiskUsersPanel component (2 hours)
- UserDetailModal component (2 hours)

**Day 4: Integration & Polish (4 hours)**
- Dashboard integration (1 hour)
- Filtering and export (2 hours)
- SecurityEventDetails component (1 hour)

**Day 5: Testing & QA (4 hours)**
- Unit tests (1 hour)
- Integration tests (1 hour)
- Manual testing (1 hour)
- Bug fixes and polish (1 hour)

**Total: 24 hours (5 days)**

---

## Next Phase Preview

**Phase 3 will add:**
- Redis cache admin tools (key inspection, purging)
- Cache statistics visualization
- Memory usage charts
- Hot key identification

**Ready to begin Phase 2 implementation?**

