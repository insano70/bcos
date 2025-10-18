# Logging Guidelines

**Purpose:** Create valuable, searchable, debuggable logs that help us understand what's happening in production.

**Philosophy:** Logs should tell a story. When investigating an issue, logs should answer: **Who** did **what**, **when**, **where**, **why**, and **how** (performance).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What to Log](#what-to-log)
3. [Message Templates](#message-templates)
4. [Before & After Examples](#before--after-examples)
5. [CloudWatch Query Examples](#cloudwatch-query-examples)
6. [Anti-Patterns (What NOT to Do)](#anti-patterns-what-not-to-do)
7. [Best Practices](#best-practices)

---

## Quick Start

### Basic Logging
```typescript
import { log } from '@/lib/logger';

// Info logging
log.info('User profile updated', {
  userId: user.id,
  organizationId: user.organization_id,
  fieldsChanged: ['name', 'email'],
});

// Error logging (ALWAYS include error object)
try {
  await dangerousOperation();
} catch (error) {
  log.error('Failed to process payment', error, {
    userId: user.id,
    amount: payment.amount,
    paymentId: payment.id,
  });
}
```

### Using Templates (Recommended)
```typescript
import { log, logTemplates } from '@/lib/logger';

// List operation with rich context
const template = logTemplates.crud.list('work_items', {
  userId: userContext.user_id,
  organizationId: userContext.current_organization_id,
  filters: { status: 'open', assignee: userId },
  results: { returned: items.length, total: count, page: 1 },
  duration: Date.now() - startTime,
});
log.info(template.message, template.context);
```

---

## What to Log

### The 6 W's Framework

Every significant log should answer as many of these as possible:

1. **WHO** - Which user/service performed the action?
   - `userId`, `email`, `organizationId`, `ipAddress`

2. **WHAT** - What operation was performed?
   - `operation`, `resourceType`, `resourceId`, `resourceName`

3. **WHEN** - When did it happen?
   - Automatic (`@timestamp`), plus `duration`, `sessionAge`

4. **WHERE** - Where in the system?
   - Automatic (`file`, `line`, `function`), plus `component`

5. **WHY** - Why did it happen (or fail)?
   - `reason`, `filters`, `changes`, `metadata`

6. **HOW** - How did it perform?
   - `duration`, `slow`, `rowCount`, `breakdown`

---

## Message Templates

We provide pre-built templates for common operations. **Use these whenever possible** for consistency.

### Available Templates

#### CRUD Operations
```typescript
import { logTemplates } from '@/lib/logger';

// List/Query
const template = logTemplates.crud.list('users', {
  userId: currentUser.id,
  organizationId: currentUser.org_id,
  filters: { role: 'admin', status: 'active' },
  results: { returned: 10, total: 45, page: 1, hasMore: true },
  duration: 245,
});
log.info(template.message, template.context);

// Read/Get
const template = logTemplates.crud.read('organization', {
  resourceId: org.id,
  resourceName: org.name,
  userId: currentUser.id,
  duration: 120,
  found: true,
});
log.info(template.message, template.context);

// Create
const template = logTemplates.crud.create('work_item', {
  resourceId: newItem.id,
  resourceName: newItem.subject,
  userId: currentUser.id,
  organizationId: currentUser.org_id,
  duration: 450,
  metadata: { type: newItem.type, priority: newItem.priority },
});
log.info(template.message, template.context);

// Update (with change tracking)
const template = logTemplates.crud.update('organization', {
  resourceId: org.id,
  resourceName: org.name,
  userId: currentUser.id,
  changes: {
    name: { from: 'Old Name', to: 'New Name' },
    is_active: { from: true, to: false },
  },
  duration: 380,
});
log.info(template.message, template.context);

// Delete
const template = logTemplates.crud.delete('user', {
  resourceId: user.id,
  resourceName: user.email,
  userId: currentUser.id,
  organizationId: user.org_id,
  soft: true, // Soft delete (deactivation)
  duration: 210,
});
log.info(template.message, template.context);
```

#### Auth Operations
```typescript
// Login attempt
const template = logTemplates.auth.loginAttempt(true, {
  email: user.email,
  userId: user.id,
  method: 'oidc',
  provider: 'okta',
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
  sessionDuration: 86400, // 24 hours in seconds
});
log.info(template.message, template.context);

// Token refresh
const template = logTemplates.auth.tokenRefresh(false, {
  userId: payload.userId,
  email: payload.email,
  reason: 'expired_refresh_token',
  sessionAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
});
log.warn(template.message, template.context);

// MFA verification
const template = logTemplates.auth.mfaVerification(true, {
  userId: user.id,
  email: user.email,
  method: 'webauthn',
  credentialId: credential.id,
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
});
log.info(template.message, template.context);
```

#### Security Events
```typescript
// Permission denied
const template = logTemplates.security.permissionDenied({
  userId: user.id,
  email: user.email,
  requiredPermission: ['work-items:delete:all'],
  resource: 'work_item',
  resourceId: item.id,
  organizationId: item.organization_id,
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
});
log.warn(template.message, template.context);

// Suspicious activity
const template = logTemplates.security.suspiciousActivity('rate_limit_exceeded', {
  userId: user.id,
  email: user.email,
  reason: '100+ login attempts in 5 minutes',
  blocked: true,
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
});
log.warn(template.message, template.context);
```

### Helper Functions

#### Calculate Changes (for updates)
```typescript
import { calculateChanges } from '@/lib/logger';

const before = { name: 'Old Name', status: 'active', description: 'Test' };
const after = { name: 'New Name', status: 'active', description: 'Updated' };

// Calculate all changes
const changes = calculateChanges(before, after);
// Result: { name: { from: 'Old Name', to: 'New Name' }, description: { from: 'Test', to: 'Updated' } }

// Calculate specific fields only
const changes = calculateChanges(before, after, ['name', 'status']);
// Result: { name: { from: 'Old Name', to: 'New Name' } }
```

---

## Before & After Examples

### Example 1: Work Items List (app/api/work-items/route.ts)

#### ❌ BEFORE (Generic, Low Value)
```typescript
log.info('List work items request initiated', {
  operation: 'list_work_items',
  requestingUserId: userContext.user_id,
  organizationId: userContext.current_organization_id,
});

log.info('Request validation completed', { duration: Date.now() - validationStart });
log.info('Request parameters parsed', { filters: {...}, pagination: {...} });
log.info('RBAC service created', { duration: Date.now() - serviceStart });
log.db('SELECT', 'work_items', duration, { rowCount: workItems.length });

log.info('Work items list retrieved successfully', {
  itemCount: workItems.length,
  totalCount,
  duration: Date.now() - startTime,
});
```

**Problems:**
- 6 separate logs for one operation
- No single log has the complete story
- Missing: which filters applied, what kind of results
- Hard to query in CloudWatch

#### ✅ AFTER (Rich, Single Log)
```typescript
// Use template at the END of operation
const template = logTemplates.crud.list('work_items', {
  userId: userContext.user_id,
  organizationId: userContext.current_organization_id,
  filters: {
    type: query.work_item_type_id || 'all',
    status: query.status_id || query.status_category || 'all',
    assignee: query.assigned_to || 'all',
    search: query.search ? query.search.substring(0, 50) : null,
  },
  results: {
    returned: workItems.length,
    total: totalCount,
    page: Math.floor(query.offset / query.limit) + 1,
    hasMore: (query.offset + workItems.length) < totalCount,
  },
  duration: Date.now() - startTime,
  metadata: {
    performance: {
      validation: validationDuration,
      query: queryDuration,
    },
  },
});
log.info(template.message, template.context);
```

**Benefits:**
- ✅ Single comprehensive log
- ✅ Complete story in one place
- ✅ Easy CloudWatch queries
- ✅ All context preserved

---

### Example 2: Organization Update (app/api/organizations/[id]/route.ts)

#### ❌ BEFORE (No Change Tracking)
```typescript
log.info('Update organization request initiated', {
  organizationId: id,
  requestingUserId: userContext.user_id,
});

// ... update happens ...

log.info('Organization updated successfully', {
  organizationId: id,
  duration: Date.now() - startTime,
});
```

**Problems:**
- No record of WHAT changed
- Can't audit state changes
- Can't answer "why did this field change?"

#### ✅ AFTER (With Change Tracking)
```typescript
// Capture state BEFORE update
const before = await orgService.getOrganization(id);

// ... perform update ...

// Log with change tracking
const changes = calculateChanges(before, updatedOrg, ['name', 'description', 'is_active']);

const template = logTemplates.crud.update('organization', {
  resourceId: updatedOrg.id,
  resourceName: updatedOrg.name,
  userId: userContext.user_id,
  changes,
  duration: Date.now() - startTime,
  metadata: {
    reason: updatedOrg.is_active === false ? 'deactivation' : 'update',
  },
});
log.info(template.message, template.context);
```

**Benefits:**
- ✅ Complete audit trail
- ✅ Know exactly what changed
- ✅ Can track down who changed what when

---

### Example 3: Auth Token Refresh (app/api/auth/refresh/route.ts)

#### ❌ BEFORE (Missing Context)
```typescript
log.warn('Token refresh failed - no refresh token in cookie');
log.auth('token_refresh', false, { reason: 'no_refresh_token' });
```

**Problems:**
- Two logs for one event
- Missing: which user, from where, session age

#### ✅ AFTER (Rich Security Context)
```typescript
const template = logTemplates.auth.tokenRefresh(false, {
  userId: payload?.userId || null,
  email: payload?.email || null,
  reason: 'no_refresh_token',
  sessionAge: payload?.exp ? Date.now() - (payload.exp * 1000) : null,
  lastActivity: payload?.iat ? new Date(payload.iat * 1000).toISOString() : null,
  ipAddress: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
  metadata: {
    cookiePresent: !!request.cookies.get('refreshToken'),
    accessTokenExpired: payload?.exp ? Date.now() > (payload.exp * 1000) : false,
  },
});
log.warn(template.message, template.context);
```

**Benefits:**
- ✅ Single comprehensive log
- ✅ Security context included
- ✅ Can detect patterns (repeated failures)

---

## CloudWatch Query Examples

With enriched logs, you can now answer business questions directly in CloudWatch:

### Find All Work Items Queries for User
```sql
fields @timestamp, filters, results, performance
| filter operation = "list_work_items"
  and userId = "user_abc123"
| sort @timestamp desc
| limit 50
```

### Find Slow Database Queries
```sql
fields @timestamp, table, operation, duration, rowCount
| filter component = "database" and slow = true
| stats max(duration) as slowest, avg(duration) as average by table, operation
| sort slowest desc
```

### Audit: Who Changed Organization Settings?
```sql
fields @timestamp, userId, email, resourceName, changes
| filter operation = "update_organization"
  and organizationId = "org_xyz789"
| sort @timestamp desc
```

### Security: Failed Login Attempts by IP
```sql
fields @timestamp, email, ipAddress, reason
| filter operation = "login" and success = false
| stats count() as failures by ipAddress, email
| filter failures > 5
| sort failures desc
```

### Performance: Slowest Operations by User
```sql
fields @timestamp, operation, duration, userId
| filter slow = true
| stats avg(duration) as avg_duration, count() as slow_count by userId, operation
| sort slow_count desc
| limit 20
```

### Find All Changes to Specific Work Item
```sql
fields @timestamp, userId, operation, changes
| filter resourceType = "work_item" and resourceId = "item_123"
| sort @timestamp desc
```

---

## Anti-Patterns (What NOT to Do)

### ❌ Don't Log Secrets or Sensitive Data
```typescript
// ❌ BAD: Raw password logged
log.info('User updated', { password: newPassword });

// ✅ GOOD: Sensitive data omitted
log.info('User password updated', { userId });
```

**Note:** The logger auto-sanitizes emails, phone numbers, SSNs, credit cards - but don't rely on this for passwords/tokens!

### ❌ Don't Log Without Context
```typescript
// ❌ BAD: No context
log.info('Request completed');

// ✅ GOOD: Rich context
log.info('Work item created successfully', {
  operation: 'create_work_item',
  userId,
  workItemId,
  organizationId,
  duration,
});
```

### ❌ Don't Use console.log
```typescript
// ❌ BAD: Bypasses logging system
console.log('User created:', user);

// ✅ GOOD: Use structured logger
log.info('User created successfully', {
  userId: user.id,
  email: user.email, // Auto-sanitized
  organizationId: user.organization_id,
});
```

### ❌ Don't Create Multiple Logs for One Operation
```typescript
// ❌ BAD: 5 logs for one operation
log.info('Starting operation');
log.info('Validation passed');
log.info('Database query complete');
log.info('Processing results');
log.info('Operation complete');

// ✅ GOOD: One comprehensive log at end
log.info('Operation completed successfully', {
  operation: 'process_data',
  performance: { validation: 50, query: 200, processing: 100 },
  results: { processed: 150, failed: 0 },
  duration: 350,
});
```

### ❌ Don't Log Errors Without Error Object
```typescript
// ❌ BAD: Error message only, no stack trace
log.error('Something failed', { message: error.message });

// ✅ GOOD: Include error object for stack trace
log.error('Failed to process payment', error, {
  userId,
  paymentId,
  amount,
});
```

---

## Best Practices

### 1. Use Templates for Common Operations
Templates ensure consistency and include all necessary context.

```typescript
// ✅ Preferred
const template = logTemplates.crud.create('user', { ... });
log.info(template.message, template.context);

// ⚠️ Acceptable (custom scenario)
log.info('Custom operation completed', { custom: 'context' });
```

### 2. Log at the End of Operations
Don't log every step - log once with complete context at the end.

```typescript
const startTime = Date.now();

// ... do work ...

// Single comprehensive log at end
log.info('Operation completed', {
  operation: 'complex_process',
  performance: { step1: dur1, step2: dur2, step3: dur3 },
  results: { success: true, itemsProcessed: 150 },
  duration: Date.now() - startTime,
});
```

### 3. Include Business Context
Help future you understand WHY this happened.

```typescript
log.info('User account deactivated', {
  userId: user.id,
  reason: 'multiple_failed_login_attempts', // ✅ Why it happened
  failedAttempts: 10,
  lastAttempt: lastAttemptTime,
  automatic: true, // ✅ Was this manual or automatic?
});
```

### 4. Track Performance
Include duration and flag slow operations.

```typescript
const duration = Date.now() - startTime;

log.info('Query completed', {
  operation: 'complex_search',
  duration,
  slow: duration > 1000, // ✅ Flag for CloudWatch filtering
  rowCount: results.length,
});
```

### 5. Use Correlation IDs (Automatic)
Thanks to Phase 2, correlation IDs are automatically included in all logs within a request. No action needed!

### 6. Log Errors with Full Context
Always include the error object AND relevant context.

```typescript
try {
  await processPayment(payment);
} catch (error) {
  log.error('Payment processing failed', error, {
    operation: 'process_payment',
    userId: user.id,
    paymentId: payment.id,
    amount: payment.amount,
    provider: payment.provider,
    attemptNumber: payment.attempts,
  });
  throw error; // Re-throw after logging
}
```

### 7. Component Tagging
Tag logs with component for easier filtering.

```typescript
log.info('Cache invalidated', {
  operation: 'cache_invalidation',
  component: 'cache', // ✅ Easy to filter in CloudWatch
  cacheKey: key,
  reason: 'manual_flush',
});
```

---

## Log Levels

### INFO
- Successful operations
- Normal business events
- State changes

**Examples:** User created, payment processed, data imported

### WARN
- Recoverable errors
- Degraded functionality
- Potential issues

**Examples:** Slow query, API rate limit approaching, missing optional config

### ERROR
- Operation failures
- Exceptions
- Data inconsistencies

**Examples:** Payment failed, database error, external API timeout

### DEBUG
- Development debugging
- Detailed traces
- Internal state

**Note:** DEBUG logs are sampled at 1% in production - don't rely on them for critical info!

---

## Summary

**Key Principles:**
1. ✅ Use message templates whenever possible
2. ✅ Log once per operation with complete context
3. ✅ Include: who, what, when, where, why, how
4. ✅ Track changes in update operations
5. ✅ Include performance metrics (duration, slow flag)
6. ✅ Always log errors with error object + context
7. ❌ Never log secrets or sensitive data
8. ❌ Never use console.log directly

**Result:** Logs that tell a story and make debugging a breeze! 🎉
