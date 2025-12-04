# Client-Side Logging Standards

## Overview

This document defines the standard patterns for logging in client-side (browser) code. Following these standards ensures consistent error tracking, security monitoring, and debugging capabilities across the application.

## Core Principle

**Never use `console.error`, `console.log`, `console.warn`, or `console.info` directly in client components.**

Instead, use the standardized logging utilities that provide:
- Consistent formatting
- Security event tracking
- Debug mode control
- Future integration with monitoring services

## Approved Utilities

### 1. `clientErrorLog` - For Error Logging

**Location:** `@/lib/utils/debug-client`

**Usage:**
```typescript
import { clientErrorLog } from '@/lib/utils/debug-client';

// In catch blocks
try {
  await someOperation();
} catch (error) {
  clientErrorLog('Operation failed:', error);
}

// For security events
clientErrorLog('[Security] Invalid input blocked:', sanitizedInput);
```

**When to use:**
- API call failures
- Unexpected errors in event handlers
- Security-related events (input validation failures, blocked actions)
- Any error that should be logged for debugging

### 2. `clientDebugLog` - For Debug Information

**Location:** `@/lib/utils/debug-client`

**Usage:**
```typescript
import { clientDebugLog } from '@/lib/utils/debug-client';

// Debug information (only shows in development)
clientDebugLog('Chart data loaded:', { chartId, dataPoints: data.length });
```

**When to use:**
- Development-only debugging information
- State tracking during development
- Performance timing logs

## Migration Pattern

When encountering existing `console.error` calls, apply this pattern:

### Before:
```typescript
} catch (error) {
  console.error('Failed to save:', error);
}
```

### After:
```typescript
import { clientErrorLog } from '@/lib/utils/debug-client';

} catch (error) {
  clientErrorLog('Failed to save:', error);
}
```

### Before (dev-only logging):
```typescript
if (process.env.NODE_ENV === 'development') {
  console.error('Debug info:', data);
}
```

### After:
```typescript
import { clientErrorLog } from '@/lib/utils/debug-client';

clientErrorLog('Debug info:', data);
// The utility handles environment checking internally
```

## Server-Side Logging

For server-side code (API routes, server components), use the structured logger:

```typescript
import { log } from '@/lib/logger';

log.error('Database operation failed', error, { userId, operation });
log.security('suspicious_activity', 'medium', { details });
log.api(request, { endpoint: '/api/users' });
```

See `CLAUDE.md` for complete server-side logging documentation.

## Exceptions

The following files are exempt from these standards:
- `lib/utils/debug.ts` - Debug utility implementation
- `lib/utils/debug-client.ts` - Client debug utility implementation
- `lib/logger/logger.ts` - Logger implementation

## Linting

The codebase includes a custom lint rule that checks for server logger imports in client code:

```bash
pnpm lint:logger
```

This ensures client components don't accidentally import server-side logging utilities.

## Related Documentation

- `CLAUDE.md` - Section: Logging System
- `lib/utils/debug-client.ts` - Implementation details
- `lib/logger/logger.ts` - Server-side logging

---
*Last updated: December 2024*
*Established during codebase refactoring initiative*




