# CSRF Security Monitoring - Database-Backed Implementation

## Overview

The CSRF Security Monitoring system has been refactored from a static class with in-memory state to a database-backed, instance-based implementation. This change provides better scalability, persistence, and reliability for production environments.

## Architecture

### Before (Static Class)

```typescript
// OLD: In-memory state with static methods
export class CSRFSecurityMonitor {
  private static failures = new Map<string, CSRFFailureEvent[]>();
  private static lastCleanup = 0;

  static recordFailure(request, reason, severity, userId?) { /* ... */ }
  static getFailureStats() { /* ... */ }
}
```

**Problems:**
- ❌ Memory leaks - no guaranteed cleanup
- ❌ Lost on server restart
- ❌ Won't work in serverless/distributed environments
- ❌ Race conditions with concurrent access
- ❌ Limited analytics capabilities

### After (Database-Backed)

```typescript
// NEW: Database persistence with dependency injection
export class CSRFSecurityMonitor {
  constructor(private db: typeof import('@/lib/db').db) {}

  async recordFailure(request, reason, severity, userId?) { /* ... */ }
  async getFailureStats(): Promise<FailureStats> { /* ... */ }
  async cleanupOldEvents(retentionHours = 24): Promise<number> { /* ... */ }
}
```

**Benefits:**
- ✅ Persistent across restarts
- ✅ Horizontally scalable
- ✅ Works in serverless environments
- ✅ Database handles concurrency
- ✅ Rich analytics with SQL queries
- ✅ Configurable retention policies

## Database Schema

### Table: `csrf_failure_events`

```sql
CREATE TABLE csrf_failure_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT NOT NULL,
  pathname VARCHAR(500) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

```sql
-- Primary lookup pattern: recent failures by IP
CREATE INDEX idx_csrf_failures_ip_timestamp ON csrf_failure_events(ip_address, timestamp DESC);

-- Cleanup old events
CREATE INDEX idx_csrf_failures_timestamp ON csrf_failure_events(timestamp DESC);

-- Endpoint pattern analysis
CREATE INDEX idx_csrf_failures_pathname_timestamp ON csrf_failure_events(pathname, timestamp DESC);

-- High-severity filtering
CREATE INDEX idx_csrf_failures_severity_timestamp ON csrf_failure_events(severity, timestamp DESC);

-- User-specific failures
CREATE INDEX idx_csrf_failures_user_id ON csrf_failure_events(user_id, timestamp DESC) WHERE user_id IS NOT NULL;

-- Threat detection queries
CREATE INDEX idx_csrf_failures_alert_detection ON csrf_failure_events(ip_address, severity, timestamp DESC);
```

## Usage

### Singleton Pattern

```typescript
// lib/security/csrf-monitoring-instance.ts
import { db } from '@/lib/db';
import { CSRFSecurityMonitor } from './csrf-monitoring';

export const csrfMonitor = new CSRFSecurityMonitor(db);
export function getCSRFMonitor() { return csrfMonitor; }
```

### Recording Failures

```typescript
import { csrfMonitor } from '@/lib/security/csrf-monitoring-instance';

// In CSRF validation code
await csrfMonitor.recordFailure(
  request,
  'missing_header_token',
  'medium',  // severity
  userId     // optional
);
```

### Getting Statistics

```typescript
const stats = await csrfMonitor.getFailureStats();
console.log({
  totalIPs: stats.totalIPs,
  totalEvents: stats.totalEvents,
  recentEvents: stats.recentEvents, // last hour
  topIPs: stats.topIPs.slice(0, 5)
});
```

### Cleanup Job

```typescript
// Run periodically (e.g., cron job, scheduled task)
const deletedCount = await csrfMonitor.cleanupOldEvents(24); // 24 hour retention
console.log(`Cleaned up ${deletedCount} old CSRF events`);
```

## Alert Detection

The monitor automatically checks for suspicious patterns:

### Alert Conditions

1. **High Frequency Attack** (Critical)
   - ≥10 failures from same IP in 1 minute

2. **Sustained Attack** (High)
   - ≥20 failures from same IP in 5 minutes

3. **Low-Level Probing** (Medium)
   - ≥50 failures from same IP in 1 hour

4. **Endpoint Scanning** (High)
   - Failures across ≥5 endpoints from same IP in 5 minutes

5. **Anomalous Patterns** (Medium)
   - Mixed anonymous/authenticated token failures

### Alert Delivery

Alerts are sent via:
- Enhanced security logging (always)
- Console output (development)
- Webhook integration (production, if configured)

```typescript
// Configure webhook in environment
SECURITY_ALERT_WEBHOOK_URL=https://your-monitoring-service.com/alerts
```

## Testing

### Unit Tests

Tests use a mock implementation to avoid database dependencies:

```typescript
import { getMockCSRFMonitor } from '../helpers/csrf-monitor-mock';

vi.mock('@/lib/security/csrf-monitoring-instance', () => ({
  csrfMonitor: getMockCSRFMonitor(),
  getCSRFMonitor: getMockCSRFMonitor,
}));
```

### Integration Tests

All 17 CSRF lifecycle tests pass with the new implementation:
- ✅ Anonymous token lifecycle
- ✅ Authenticated token lifecycle
- ✅ Cross-time-window scenarios
- ✅ Security monitoring integration
- ✅ End-to-end token flows

## Migration Notes

### Files Changed

**New Files:**
- `lib/security/csrf-monitoring-refactored.ts` - New implementation
- `lib/security/csrf-monitoring-instance.ts` - Singleton factory
- `lib/db/csrf-schema.ts` - Database schema
- `lib/db/migrations/0017_csrf_failure_events.sql` - Migration
- `tests/helpers/csrf-monitor-mock.ts` - Test helper

**Modified Files:**
- `lib/security/csrf-unified.ts` - Updated to use singleton
- `tests/integration/csrf-lifecycle.test.ts` - Updated to use mock

**Deprecated Files:**
- `lib/security/csrf-monitoring.ts.deprecated` - Old implementation

### Breaking Changes

None! The refactoring maintains API compatibility:

```typescript
// OLD
CSRFSecurityMonitor.recordFailure(request, reason, severity);

// NEW (compatible)
await csrfMonitor.recordFailure(request, reason, severity);
```

Only difference: methods are now async and must be awaited.

## Performance Considerations

### Database Impact

- **Writes**: Low volume (only on CSRF failures)
- **Reads**: Minimal (statistics endpoints, cleanup jobs)
- **Storage**: ~500 bytes per event, auto-cleanup after 24 hours
- **Indexes**: 6 indexes optimize common query patterns

### Estimated Load

- 1,000 failures/day = ~500 KB storage
- 10,000 failures/day = ~5 MB storage
- Cleanup removes events >24h old automatically

### Query Performance

All queries use indexed columns for fast lookups:
- IP-based lookups: `O(log n)` with `idx_csrf_failures_ip_timestamp`
- Time-range queries: `O(log n)` with `idx_csrf_failures_timestamp`
- Aggregations: Optimized with composite indexes

## Monitoring

### Health Checks

Monitor these metrics:
- Event insertion rate
- Failed insertions (indicates DB issues)
- Alert frequency
- Cleanup job execution

### Logs

Look for these log entries:
- `CSRF events cleanup completed` - Successful cleanup
- `Failed to record CSRF failure` - Database write failures
- `Alert condition check failed` - Monitoring errors
- `csrf_security_alert` - Security alerts triggered

### Alerts

Watch for:
- High `csrf_failure_threshold` alerts (sustained attacks)
- `csrf_attack_pattern` alerts (active scanning)
- Database connection failures in monitoring code

## Security Considerations

### Data Retention

- Default: 24 hour retention
- Configurable via `cleanupOldEvents(retentionHours)`
- Consider privacy regulations (GDPR, etc.)

### PII Protection

Events store:
- IP addresses (potentially PII)
- User agents (device fingerprints)
- User IDs (when authenticated)

Ensure compliance with:
- Data retention policies
- User deletion requests
- Privacy regulations

### Access Control

Database access should be restricted:
- Read: Security teams, monitoring systems
- Write: Application only
- Delete: Automated cleanup jobs only

## Future Enhancements

Potential improvements:
1. Real-time alerting (WebSocket, SNS, etc.)
2. Machine learning for anomaly detection
3. IP reputation integration
4. Automated IP blocking
5. Dashboard for visualization
6. Export to SIEM systems

## References

- Database Schema: `lib/db/csrf-schema.ts`
- Migration: `lib/db/migrations/0017_csrf_failure_events.sql`
- Implementation: `lib/security/csrf-monitoring-refactored.ts`
- Tests: `tests/integration/csrf-lifecycle.test.ts`
