# Universal Logger Migration Guide

This guide helps you migrate from the existing Winston-based logging system to the new Universal Logging System that works across both Node.js and Edge Runtime environments.

## Overview

The new Universal Logging System provides:
- **Cross-runtime compatibility** - Works in both Node.js and Edge Runtime
- **Backward compatibility** - Drop-in replacements for existing functions
- **Enhanced API logging** - Comprehensive request/response tracking
- **Automatic adapter selection** - Chooses the best logger based on runtime
- **Performance monitoring** - Built-in timing and metrics
- **Security logging** - Enhanced security event tracking

## Quick Migration

### 1. Update Imports (Recommended)

**Old:**
```typescript
import { createAppLogger, logger } from '@/lib/logger/winston-logger'
import { createAPILogger } from '@/lib/logger/api-logger'
```

**New:**
```typescript
import { createAppLogger, logger } from '@/lib/logger/factory'
import { createAPILogger } from '@/lib/logger/api-features'
```

### 2. No Code Changes Required

The factory functions provide drop-in replacements with identical APIs:

```typescript
// This code works unchanged with the new system
const moduleLogger = createAppLogger('my-module')
moduleLogger.info('Hello world', { data: 'test' })

const childLogger = moduleLogger.child({ userId: '123' })
childLogger.error('Something went wrong', error)
```

## Enhanced Features

### 1. Enhanced API Logging

**Old API Logger:**
```typescript
import { createAPILogger, logAPIRequest, logAPIResponse } from '@/lib/logger/api-logger'

export async function handler(request: NextRequest) {
  const logger = createAPILogger(request)
  logAPIRequest(logger, request)
  
  try {
    const result = await processRequest()
    logAPIResponse(logger, 200, Date.now())
    return Response.json(result)
  } catch (error) {
    logAPIResponse(logger, 500, Date.now(), undefined, error)
    throw error
  }
}
```

**New Enhanced API Logger:**
```typescript
import { createAPILogger, withAPILogging } from '@/lib/logger/api-features'

// Option 1: Manual logging with enhanced features
export async function handler(request: NextRequest) {
  const logger = createAPILogger(request, 'my-api')
  logger.logRequest({ authType: 'bearer', userId: '123' })
  
  try {
    // Database operation logging
    const start = Date.now()
    const users = await db.select().from(userTable)
    logger.logDatabase('SELECT', 'users', { 
      duration: Date.now() - start,
      recordCount: users.length
    })
    
    // Business logic logging
    logger.logBusiness('user_retrieval', 'users', 'success', {
      recordsProcessed: users.length
    })
    
    logger.logResponse(200, { 
      size: JSON.stringify(users).length,
      recordCount: users.length 
    })
    
    return Response.json(users)
  } catch (error) {
    logger.logResponse(500, {}, error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

// Option 2: Automatic logging with middleware
export const GET = withAPILogging(async (request, logger) => {
  // Logger automatically handles request/response logging
  // You just need to handle business logic
  const users = await getUsers()
  return Response.json(users)
}, 'users-api')
```

### 2. Runtime-Adaptive Behavior

The new system automatically selects the appropriate logging adapter:

```typescript
import { createUniversalLogger } from '@/lib/logger/runtime-logger'

// This works identically in both Node.js and Edge Runtime
const logger = createUniversalLogger('my-module')
logger.info('This works everywhere!')

// In Node.js: Uses Winston with file/console output
// In Edge Runtime: Uses console with structured JSON
```

### 3. Enhanced Context Management

```typescript
// Enhanced request context
const logger = createAPILogger(request)
  .child({ feature: 'user-management' })
  .withUser('user-123', 'org-456')

// All subsequent logs include this context
logger.info('Processing user data')
// Output: { ..., userId: 'user-123', organizationId: 'org-456', feature: 'user-management' }
```

### 4. Specialized Logging Methods

```typescript
const logger = createAPILogger(request)

// Authentication logging
logger.logAuth('login_attempt', true, { 
  method: 'bearer', 
  userId: '123' 
})

// Security event logging
logger.logSecurity('suspicious_activity', 'medium', {
  threat: 'brute_force',
  blocked: true
})

// Database performance logging  
logger.logDatabase('SELECT', 'users', {
  duration: 150,
  recordCount: 25,
  queryComplexity: 'complex'
})

// Rate limiting logging
logger.logRateLimit(100, 95, new Date(Date.now() + 3600000), 'warn')

// Business logic logging
logger.logBusiness('payment_processing', 'payments', 'success', {
  recordsProcessed: 1,
  notifications: 2
})

// External API logging
logger.logExternalAPI('stripe', '/charges', 'POST', 'success', {
  duration: 350,
  statusCode: 200
})
```

## Backward Compatibility

### Existing Code Still Works

All existing winston-logger code continues to work unchanged:

```typescript
// These still work exactly as before
import { logger, loggers, createAppLogger } from '@/lib/logger'

logger.info('App startup')
loggers.auth.info('User authenticated')
loggers.db.debug('Query executed')

const apiLogger = createAppLogger('api')
apiLogger.error('API error', error, { endpoint: '/users' })
```

### Progressive Migration Strategy

1. **Phase 1**: Update imports to use factory functions (no code changes)
2. **Phase 2**: Enhance new API routes with `api-features`
3. **Phase 3**: Gradually migrate existing APIs to use enhanced features
4. **Phase 4**: Remove old winston-logger imports when fully migrated

## Runtime Diagnostics

Monitor which adapter is being used:

```typescript
import { getLoggerDiagnostics } from '@/lib/logger/runtime-logger'

const diagnostics = getLoggerDiagnostics()
console.log('Current runtime:', diagnostics.currentRuntime)
console.log('Node adapter available:', diagnostics.nodeAdapterAvailable)
console.log('Edge adapter available:', diagnostics.edgeAdapterAvailable)
```

## Configuration Options

```typescript
import { createUniversalLogger } from '@/lib/logger/runtime-logger'

// Custom configuration
const logger = createUniversalLogger('my-module', {}, {
  level: 'debug',
  format: 'pretty', // vs 'json'
  sanitizeData: true,
  silent: false
})
```

## Testing

The system includes comprehensive test coverage and diagnostics:

```typescript
// Development/testing helpers
import { createTrackedLogger } from '@/lib/logger/factory'

// This will log which adapter is selected (development only)
const logger = createTrackedLogger('test-module')
```

## Best Practices

### 1. Use Domain-Specific Modules

```typescript
// Good: Specific module names
const userLogger = createAppLogger('user-service')
const paymentLogger = createAppLogger('payment-processor')

// Less ideal: Generic names
const logger = createAppLogger('api')
```

### 2. Leverage Enhanced API Features

```typescript
// Good: Use specialized methods
logger.logDatabase('SELECT', 'users', { duration: 25, recordCount: 5 })
logger.logAuth('login', true, { userId: '123', method: 'bearer' })

// Less ideal: Generic logging
logger.info('Database query completed', { table: 'users', duration: 25 })
logger.info('User authenticated', { userId: '123' })
```

### 3. Context Inheritance

```typescript
// Good: Build context progressively
const baseLogger = createAPILogger(request)
const userLogger = baseLogger.withUser(userId, organizationId)
const operationLogger = userLogger.child({ operation: 'data-export' })

// All logs automatically include full context
operationLogger.info('Export started') // Includes user, org, operation context
```

## Migration Checklist

- [ ] Update imports to use factory functions
- [ ] Test existing functionality still works
- [ ] Identify API routes for enhancement
- [ ] Migrate to enhanced API logging progressively  
- [ ] Add specialized logging methods where appropriate
- [ ] Configure runtime diagnostics for monitoring
- [ ] Update documentation and team training

## Need Help?

The new system is designed to be fully backward compatible. If you encounter any issues:

1. Check that imports are updated correctly
2. Verify TypeScript compilation passes
3. Review runtime diagnostics for adapter selection
4. Test in both development and production environments

The migration can be done incrementally with no breaking changes to existing functionality.
