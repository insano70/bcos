# Claude AI Assistant Rules and Guidelines

This document contains the rules, guidelines, and context for AI assistants working on this codebase.

## Git Operations

### Strict Prohibitions
- **NEVER** use `git reset`, `git reset --hard`, `git reset --soft`, or any destructive git operations under any circumstances
- **FORBIDDEN**: All forms of `git reset` are prohibited
- Do not interact with git unless explicitly instructed to do so
- Do not commit work without being told to do so
- Never run force push to main/master
- Never skip hooks (`--no-verify`, `--no-gpg-sign`, etc.) unless explicitly requested

## Code Quality Standards

### Type Safety
- **FORBIDDEN**: The `any` type is never to be used under any circumstance
- If you encounter the `any` type in existing code, address it and report it to the user
- Maintain strict TypeScript typing throughout the codebase

### Quality Over Speed
- Do not take shortcuts for speed
- Speed is not the priority; high quality code is the priority
- Always prioritize correctness and maintainability

### Post-Change Validation
- **ALWAYS** run `pnpm tsc` after any code changes are completed
- **ALWAYS** run `pnpm lint` after any code changes are completed
- Fix all errors before proceeding, even if they were unrelated to your changes

## Security

- Security is paramount
- Never make an infrastructure or code change that will negatively impact the security profile
- Always consider security implications of any changes

## Logging Standards

### Node Only
Logging is Node-only. Do not import logging into the client. This will cause build failures and is forbidden. 

### Core Principles
- Use native `console.log/error/warn/debug` through the logger wrapper in `lib/logger/index.ts`
- **NEVER** use external logging libraries (Pino, Winston, etc.)
- **NEVER** use `console.*` directly - always use the `log` wrapper
- All logs automatically include file, line, function, and correlation ID

### Logger Usage

#### Import Pattern
```typescript
import { log, correlation } from '@/lib/logger';
```

#### Basic Logging
```typescript
// Info logging
log.info('Operation completed', { data });

// Warnings
log.warn('Approaching limit', { limit, current });

// Errors (always include error object)
try {
  await operation();
} catch (error) {
  log.error('Operation failed', error, { context });
  // Automatically includes stack trace, file, line, function
}

// Debug (1% sampled in production)
log.debug('Debug state', { variable });
```

#### API Routes with Correlation
```typescript
export const POST = async (request: NextRequest) => {
  return correlation.withContext(
    correlation.generate(),
    {
      method: request.method,
      path: new URL(request.url).pathname,
    },
    async () => {
      log.api('Request started', request);

      try {
        // ... handler logic

        log.api('Request completed', request, 200, duration);
        return NextResponse.json(result);
      } catch (error) {
        log.error('Request failed', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
      }
    }
  );
};
```

#### Specialized Logging
```typescript
// Authentication
log.auth('login', true, { userId, method: 'saml' });
log.auth('login', false, { email, reason: 'invalid_password' });

// Security events
log.security('suspicious_activity', 'high', {
  blocked: true,
  reason: 'rate_limit_exceeded'
});

// Database operations
log.db('SELECT', 'users', duration, { recordCount });
```

### PII Protection
- **NEVER** log raw passwords, tokens, or sensitive data
- The logger automatically sanitizes: emails, phone numbers, SSNs, credit cards, UUIDs
- When in doubt, use generic identifiers instead of actual values

### Log Levels
- **ERROR**: Application errors, exceptions, failures (100% in production)
- **WARN**: Potential issues, degraded performance (100% in production)
- **INFO**: Business events, successful operations (10% sampled in production)
- **DEBUG**: Detailed debugging (1% sampled in production)

### Required Context
When logging errors, always include:
1. The error object itself
2. Relevant context (operation, resourceId, etc.)
3. Never suppress stack traces

### Debugging
- Use CloudWatch Logs Insights for production debugging
- Query by `correlationId` to trace complete requests
- All logs include automatic context capture (file:line:function)
- See `/docs/logging_strategy.md` for CloudWatch query examples

## Enriched Logging Patterns

### Standard Patterns for API Routes

#### Success Log Pattern
All successful operations should log with rich context:

```typescript
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

const duration = Date.now() - startTime;

log.info('operation completed - summary', {
  operation: 'list_users',  // Required: unique operation identifier
  userId: userContext.user_id,  // Required: who performed the operation
  results: {
    returned: users.length,
    total: totalCount,
    page: currentPage,
  },
  filters: sanitizeFilters(filters),  // Use sanitizeFilters() for filter context
  duration,
  slow: duration > SLOW_THRESHOLDS.API_OPERATION,  // Use constants
  component: 'api',  // Required: component tag for CloudWatch filtering
});
```

#### Error Log Pattern
All errors must include operation and component:

```typescript
log.error('operation failed', error, {
  operation: 'create_user',  // Required
  userId: userContext.user_id,
  duration: Date.now() - startTime,
  component: 'api',  // Required
});
```

#### CRUD Operations Pattern
For standard CRUD operations, use logTemplates:

```typescript
import { logTemplates, calculateChanges } from '@/lib/logger';

// CREATE
const template = logTemplates.crud.create('user', {
  resourceId: String(newUser.user_id),
  resourceName: newUser.email,
  userId: userContext.user_id,
  organizationId: userContext.current_organization_id,
  duration,
  metadata: { role: newUser.role, emailVerified: newUser.email_verified },
});
log.info(template.message, template.context);

// UPDATE (with change tracking)
const changes = calculateChanges(existingUser, updatedData);
const template = logTemplates.crud.update('user', {
  resourceId: String(user.user_id),
  resourceName: user.email,
  userId: userContext.user_id,
  changes,
  duration,
  metadata: { fieldsChanged: Object.keys(changes).length },
});
log.info(template.message, template.context);

// LIST
const template = logTemplates.crud.list('users', {
  userId: userContext.user_id,
  organizationId: userContext.current_organization_id,
  filters: { status: 'active', role: 'admin' },
  results: { returned: 25, total: 100, page: 1 },
  duration,
});
log.info(template.message, template.context);
```

### Slow Thresholds

Use centralized constants for consistency:

```typescript
import { SLOW_THRESHOLDS } from '@/lib/logger';

// Database queries - 500ms threshold
slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY

// Standard API operations - 1000ms threshold
slow: duration > SLOW_THRESHOLDS.API_OPERATION

// Complex auth operations - 2000ms threshold
slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION
```

**Rationale:**
- `DB_QUERY: 500ms` - Detect missing indexes, complex joins
- `API_OPERATION: 1000ms` - User experience threshold for simple operations
- `AUTH_OPERATION: 2000ms` - Tolerance for password hashing, token generation, MFA

### Security Event Logging

Always preserve security logs:

```typescript
// Authentication events
log.auth('login_attempt', true, {
  userId,
  method: 'password',
  mfaRequired: true
});

// Security threats
log.security('rate_limit_exceeded', 'high', {
  userId,
  ipAddress: metadata.ipAddress,
  blocked: true,
  threat: 'credential_attack',
});

// Use AuditLogger for compliance
await AuditLogger.logUserAction({
  action: 'user_deleted',
  userId: actingUserId,
  resourceType: 'user',
  resourceId: deletedUserId,
  ipAddress: metadata.ipAddress,
  metadata: { reason: 'admin_action' },
});
```

### What NOT to Log

#### ❌ Verbose Intermediate Logs
```typescript
// DON'T DO THIS:
log.info('Rate limit check completed', { duration: 5 });
log.info('Request validation completed', { duration: 12 });
log.info('Database query completed', { duration: 234 });
log.info('Response formatted', { duration: 3 });

// DO THIS INSTEAD:
// Remove intermediate logs, keep one comprehensive final log
log.info('user list completed - returned 25 of 100', {
  operation: 'list_users',
  results: { returned: 25, total: 100 },
  query: { duration: 234, slow: false },
  duration: 254,  // Total duration only
  component: 'api',
});
```

#### ❌ Debug console.log Statements
```typescript
// DON'T DO THIS:
console.log('🔍 Debugging:', data);

// DO THIS INSTEAD:
log.debug('debugging context', { data });  // 1% sampled in production
```

### CloudWatch Queries

Query logs by operation:
```
fields @timestamp, message, duration, operation, userId
| filter component = "api" and operation = "list_users"
| sort @timestamp desc
| limit 100
```

Find slow operations:
```
fields @timestamp, message, duration, operation
| filter slow = true
| stats count() by operation
| sort count desc
```

Trace request by correlation ID:
```
fields @timestamp, message, level, file
| filter correlationId = "abc123..."
| sort @timestamp asc
```

## File Naming Conventions

- Do not use adjectives or buzzwords in file naming
- Avoid: "enhanced", "optimized", "new", "updated", etc.
- Name files plainly and descriptively
- Focus on what the file does, not marketing language

## Testing Standards

### Test Quality
- Do not create "testing theater" where the test only tests itself
- Tests should always test real code and should add value
- Quality code is the priority, not 100% pass rate

### Test Failures
- When addressing testing failures, always analyze first and determine appropriate action
- Do not blindly modify tests to make them pass
- If a test is failing, determine if:
  - The code is wrong (fix the code)
  - The test is wrong (fix the test)
  - The requirement changed (discuss with user)
- Do it correctly, not just to make tests pass

## Development Workflow

1. Make code changes
2. Run `pnpm tsc` to check TypeScript compilation
3. Run `pnpm lint` to check linting rules
4. Fix any errors that you created
5. Only proceed when all checks pass
6. Do not create documents unless asked. Display your findings to the user.
7. Do not defer work unless previously instructed and approved.

## Project Context

- OS: macOS (darwin 24.6.0)
- Shell: zsh
- Package Manager: pnpm
- Workspace: `/Users/pstewart/bcos`
- Tech Stack: Next.js, TypeScript, React
- Infrastructure: AWS CDK

## Key Principles

1. **Security First**: Always prioritize security in all decisions
2. **Type Safety**: Strict TypeScript, no `any` types
3. **Quality Over Speed**: Take time to do things correctly
4. **Test Value**: Tests must provide real value, not just coverage
5. **Clean Git History**: No destructive git operations
6. **Explicit Actions**: Only commit or interact with git when explicitly instructed


