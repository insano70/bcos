# RBAC Route Handler Refactoring - Implementation Plan

## Executive Summary

Refactoring [lib/api/rbac-route-handler.ts](../lib/api/rbac-route-handler.ts) from **652-line monolith** to composable middleware system. Following the proven Organizations pattern.

**Status:** Ready to implement
**Timeline:** 3-4 weeks
**Risk Level:** Medium (106 API routes depend on this)

---

## Current State - Confirmed Problems

### File Metrics
- **Lines:** 652 (after removing unused webhook code)
- **API Routes:** 106 files
- **Usages:** 254 instances across codebase
- **Route Types:** rbacRoute, publicRoute, legacySecureRoute

### Code Duplication (70% across 2 wrappers)
- **Correlation setup:** Lines 44-64, 439-458 **(2x duplicate)**
- **Rate limiting:** Lines 78-86, 467-475 **(2x duplicate)**
- **Metrics recording:** Lines 149-170, 275-300, 522-545 **(3x duplicate)**
- **Error handling:** Lines 349-391, 548-591 **(2x duplicate)**

### Excessive Nesting (7 levels)
```typescript
correlation.withContext → try → if rateLimit → if requireAuth
  → if session → if rbacResult.success → handler call
```

### Dependencies (Already integrated)
- ✅ [lib/api/middleware/global-auth.ts](../lib/api/middleware/global-auth.ts) - Authentication
- ✅ [lib/api/middleware/rate-limit.ts](../lib/api/middleware/rate-limit.ts) - Rate limiting
- ✅ [lib/rbac/middleware.ts](../lib/rbac/middleware.ts) - RBAC permissions
- ✅ [lib/monitoring/metrics-collector.ts](../lib/monitoring/metrics-collector.ts) - Metrics
- ✅ [lib/api/utils/rbac-extractors.ts](../lib/api/utils/rbac-extractors.ts) - Resource extraction

---

## Target Architecture

### Final Structure
```
lib/api/route-handlers/
├── index.ts                       (80 lines - exports only)
├── types.ts                       (50 lines - interfaces)
├── middleware/
│   ├── pipeline.ts                (120 lines - orchestrator)
│   ├── correlation-middleware.ts  (60 lines)
│   ├── rate-limit-middleware.ts   (40 lines)
│   ├── auth-middleware.ts         (80 lines)
│   └── rbac-middleware.ts         (70 lines)
├── utils/
│   ├── metrics-recorder.ts        (80 lines - consolidate 3 duplicates)
│   ├── error-handler.ts           (60 lines - consolidate 2 duplicates)
│   └── timing-tracker.ts          (40 lines)
└── builders/
    ├── rbac-route-builder.ts      (100 lines)
    ├── public-route-builder.ts    (60 lines)
    └── legacy-route-builder.ts    (80 lines)

Total: ~920 lines across 13 focused files
```

### Benefits
- **Main file:** 652 lines → 80 lines (**-88%**)
- **Code duplication:** 3 duplicate blocks → 1 utility (**-67%**)
- **Nesting depth:** 7 levels → 3 levels (**-57%**)
- **Testability:** Impossible (652-line monolith) → Easy (isolated modules)

---

## Implementation Plan (3-4 Weeks)

### Week 1: Extract Utilities (Low Risk)
**Goal:** Consolidate duplicate code into reusable utilities

#### Tasks
1. Create `lib/api/route-handlers/utils/metrics-recorder.ts`
   - Consolidate 3 duplicate metrics recording blocks
   - Extract from lines 149-170, 275-300, 522-545
   - Functions: `recordRequest()`, `recordSecurityEvents()`

2. Create `lib/api/route-handlers/utils/error-handler.ts`
   - Consolidate 2 duplicate error handling blocks
   - Extract from lines 349-391, 548-591
   - Functions: `handleError()`, `getErrorType()`, `getErrorMessage()`

3. Create `lib/api/route-handlers/utils/timing-tracker.ts`
   - Centralize 15+ `Date.now()` calls
   - Track operation timings in structured way
   - Functions: `start()`, `getTotalDuration()`, `getTimings()`

#### Deliverables
```typescript
// utils/metrics-recorder.ts
export class MetricsRecorder {
  static async recordRequest(
    request: NextRequest,
    context: RouteContext,
    response: Response
  ): Promise<void>;

  private static recordSecurityEvents(
    status: number,
    context: RouteContext
  ): void;
}

// utils/error-handler.ts
export class RouteErrorHandler {
  static async handleError(
    error: unknown,
    request: NextRequest,
    context: RouteContext
  ): Promise<Response>;

  private static getErrorType(error: unknown): string;
  private static getErrorMessage(error: unknown): string;
}

// utils/timing-tracker.ts
export class TimingTracker {
  constructor();
  start(name: string): () => void;
  getTotalDuration(): number;
  getTimings(): Record<string, number>;
}
```

#### Success Criteria
- [ ] All utilities are pure functions (no side effects)
- [ ] No framework coupling (can be tested standalone)
- [ ] Zero behavior changes vs existing code

---

### Week 2: Build Middleware Pipeline (Medium Risk)
**Goal:** Create composable middleware system

#### Tasks
1. Create `lib/api/route-handlers/types.ts`
   - Define core interfaces: `Middleware`, `MiddlewareResult`, `RouteContext`
   - Define route options types: `RBACRouteOptions`, `PublicRouteOptions`

2. Create `lib/api/route-handlers/middleware/pipeline.ts`
   - Implement `MiddlewarePipeline` class
   - Sequential execution with early exit on failure
   - Context accumulation pattern

3. Create individual middleware classes:
   - `correlation-middleware.ts` - Sets up correlation context
   - `rate-limit-middleware.ts` - Applies rate limiting
   - `auth-middleware.ts` - Authentication check
   - `rbac-middleware.ts` - Permission verification

#### Deliverables
```typescript
// types.ts
export interface Middleware {
  name: string;
  execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult>;
}

export interface MiddlewareResult {
  success: boolean;
  context?: RouteContext;
  response?: Response;
}

export interface RouteContext {
  routeType: 'rbac' | 'public' | 'legacy';
  timingTracker: TimingTracker;
  startTime: number;
  totalDuration?: number;
  url: URL;
  correlationId?: string;
  userId?: string;
  userContext?: UserContext;
  session?: AuthResult;
  rbacDenied?: boolean;
  timings?: Record<string, number>;
}

// pipeline.ts
export class MiddlewarePipeline {
  constructor(private middlewares: Middleware[]) {}

  async execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult> {
    for (const middleware of this.middlewares) {
      const result = await middleware.execute(request, context);

      if (!result.success) {
        return result; // Early exit
      }

      context = { ...context, ...result.context }; // Merge
    }

    return { success: true, context };
  }
}
```

#### Middleware Implementations

**CorrelationMiddleware:**
```typescript
export class CorrelationMiddleware implements Middleware {
  name = 'correlation';

  async execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult> {
    const correlationId =
      request.headers.get('x-correlation-id') ||
      correlation.generate();

    correlation.setRequest({
      method: request.method,
      path: context.url.pathname,
      ipAddress: request.headers.get('x-forwarded-for') ||
                 request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    });

    return {
      success: true,
      context: { ...context, correlationId },
    };
  }
}
```

**RateLimitMiddleware:**
```typescript
export class RateLimitMiddleware implements Middleware {
  name = 'rateLimit';

  constructor(private limitType?: 'auth' | 'api' | 'upload') {}

  async execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult> {
    if (!this.limitType) {
      return { success: true, context };
    }

    const endTiming = context.timingTracker.start('rateLimit');
    await applyRateLimit(request, this.limitType);
    endTiming();

    return { success: true, context };
  }
}
```

**AuthMiddleware:**
```typescript
export class AuthMiddleware implements Middleware {
  name = 'auth';

  constructor(private requireAuth: boolean = true) {}

  async execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult> {
    if (!this.requireAuth) {
      return { success: true, context };
    }

    const endTiming = context.timingTracker.start('auth');
    const session = await applyGlobalAuth(request);
    endTiming();

    if (!session?.user?.id) {
      return {
        success: false,
        response: createErrorResponse(
          'Authentication required',
          401,
          request
        ) as Response,
      };
    }

    return {
      success: true,
      context: {
        ...context,
        session,
        userId: session.user.id,
        userContext: session.userContext || undefined,
      },
    };
  }
}
```

**RBACMiddleware:**
```typescript
export class RBACMiddleware implements Middleware {
  name = 'rbac';

  constructor(
    private permission: PermissionName | PermissionName[],
    private options: RBACMiddlewareOptions
  ) {}

  async execute(
    request: NextRequest,
    context: RouteContext
  ): Promise<MiddlewareResult> {
    if (!context.userContext) {
      return {
        success: false,
        response: createErrorResponse(
          'User context required for RBAC',
          500,
          request
        ) as Response,
      };
    }

    const endTiming = context.timingTracker.start('rbac');

    const rbacMiddleware = createRBACMiddleware(this.permission, {
      requireAll: this.options.requireAllPermissions,
      extractResourceId: this.options.extractResourceId,
      extractOrganizationId: this.options.extractOrganizationId,
    });

    const rbacResult = await rbacMiddleware(request, context.userContext);
    endTiming();

    if (!('success' in rbacResult) || !rbacResult.success) {
      return {
        success: false,
        response: rbacResult as Response,
        context: { ...context, rbacDenied: true },
      };
    }

    return {
      success: true,
      context: {
        ...context,
        userContext: rbacResult.userContext,
      },
    };
  }
}
```

#### Success Criteria
- [ ] Pipeline executes middlewares sequentially
- [ ] Early exit on first failure
- [ ] Context accumulates through pipeline
- [ ] Each middleware can be tested in isolation
- [ ] Uses existing utilities (TimingTracker, etc.)

---

### Week 3: Rebuild Route Handlers (Higher Risk)
**Goal:** Create new route builders using pipeline system

#### Tasks
1. Create `lib/api/route-handlers/builders/rbac-route-builder.ts`
   - Pipeline: Correlation → RateLimit → Auth → RBAC
   - Maintains exact same behavior as current `rbacRoute()`

2. Create `lib/api/route-handlers/builders/public-route-builder.ts`
   - Pipeline: Correlation → RateLimit
   - Maintains exact same behavior as current `publicRoute()`

3. Create `lib/api/route-handlers/builders/legacy-route-builder.ts`
   - Pipeline: Correlation → RateLimit → Auth (optional)
   - Maintains exact same behavior as current `legacySecureRoute()`

#### Deliverables

**RBACRouteBuilder:**
```typescript
export class RBACRouteBuilder {
  static build(
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>,
    options: RBACRouteOptions & {
      permission: PermissionName | PermissionName[]
    }
  ) {
    // Build middleware pipeline
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
      new AuthMiddleware(options.requireAuth !== false),
      new RBACMiddleware(options.permission, {
        requireAllPermissions: options.requireAllPermissions,
        extractResourceId: options.extractResourceId,
        extractOrganizationId: options.extractOrganizationId,
      }),
    ]);

    return async (
      request: NextRequest,
      ...args: unknown[]
    ): Promise<Response> => {
      const timingTracker = new TimingTracker();
      const url = new URL(request.url);

      return correlation.withContext(
        request.headers.get('x-correlation-id') ||
        correlation.generate(),
        { method: request.method, path: url.pathname },
        async () => {
          try {
            log.info('RBAC route initiated', {
              endpoint: url.pathname,
              method: request.method,
              permissions: Array.isArray(options.permission)
                ? options.permission
                : [options.permission],
            });

            // Execute middleware pipeline
            const result = await pipeline.execute(request, {
              routeType: 'rbac',
              timingTracker,
              startTime: Date.now(),
              url,
            });

            if (!result.success) {
              await MetricsRecorder.recordRequest(
                request,
                result.context!,
                result.response!
              );
              return result.response!;
            }

            // Call handler
            const endHandlerTiming =
              result.context!.timingTracker.start('handler');
            const response = await handler(
              request,
              result.context!.userContext!,
              ...args
            );
            endHandlerTiming();

            // Record metrics
            const finalContext = {
              ...result.context!,
              totalDuration:
                result.context!.timingTracker.getTotalDuration(),
            };
            await MetricsRecorder.recordRequest(
              request,
              finalContext,
              response
            );

            log.info('RBAC route completed', {
              statusCode: response.status,
              totalDuration: finalContext.totalDuration,
              timings: result.context!.timingTracker.getTimings(),
            });

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'rbac',
              timingTracker,
              totalDuration: timingTracker.getTotalDuration(),
            });
          }
        }
      );
    };
  }
}
```

**PublicRouteBuilder:**
```typescript
export class PublicRouteBuilder {
  static build(
    handler: (
      request: NextRequest,
      ...args: unknown[]
    ) => Promise<Response>,
    reason: string,
    options: Omit<
      RBACRouteOptions,
      'requireAuth' | 'publicReason' | 'permission'
    > = {}
  ) {
    // Simpler pipeline - no auth or RBAC
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
    ]);

    return async (
      request: NextRequest,
      ...args: unknown[]
    ): Promise<Response> => {
      const timingTracker = new TimingTracker();
      const url = new URL(request.url);

      return correlation.withContext(
        request.headers.get('x-correlation-id') ||
        correlation.generate(),
        { method: request.method, path: url.pathname },
        async () => {
          try {
            log.info('Public route initiated', {
              endpoint: url.pathname,
              method: request.method,
              reason,
            });

            const result = await pipeline.execute(request, {
              routeType: 'public',
              timingTracker,
              startTime: Date.now(),
              url,
            });

            if (!result.success) {
              await MetricsRecorder.recordRequest(
                request,
                result.context!,
                result.response!
              );
              return result.response!;
            }

            const response = await handler(request, ...args);

            const finalContext = {
              ...result.context!,
              totalDuration:
                result.context!.timingTracker.getTotalDuration(),
            };
            await MetricsRecorder.recordRequest(
              request,
              finalContext,
              response
            );

            log.info('Public route completed', {
              statusCode: response.status,
              totalDuration: finalContext.totalDuration,
            });

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'public',
              timingTracker,
              totalDuration: timingTracker.getTotalDuration(),
            });
          }
        }
      );
    };
  }
}
```

**LegacyRouteBuilder:**
```typescript
export class LegacyRouteBuilder {
  static build(
    handler: (
      request: NextRequest,
      session?: AuthSession,
      ...args: unknown[]
    ) => Promise<Response>,
    options: {
      rateLimit?: 'auth' | 'api' | 'upload';
      requireAuth?: boolean;
      publicReason?: string
    } = {}
  ) {
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
      new AuthMiddleware(options.requireAuth !== false),
    ]);

    return async (
      request: NextRequest,
      ...args: unknown[]
    ): Promise<Response> => {
      const timingTracker = new TimingTracker();
      const url = new URL(request.url);

      return correlation.withContext(
        request.headers.get('x-correlation-id') ||
        correlation.generate(),
        { method: request.method, path: url.pathname },
        async () => {
          try {
            const result = await pipeline.execute(request, {
              routeType: 'legacy',
              timingTracker,
              startTime: Date.now(),
              url,
            });

            if (!result.success) {
              await MetricsRecorder.recordRequest(
                request,
                result.context!,
                result.response!
              );
              return result.response!;
            }

            const response = await handler(
              request,
              result.context!.session,
              ...args
            );

            const finalContext = {
              ...result.context!,
              totalDuration:
                result.context!.timingTracker.getTotalDuration(),
            };
            await MetricsRecorder.recordRequest(
              request,
              finalContext,
              response
            );

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'legacy',
              timingTracker,
              totalDuration: timingTracker.getTotalDuration(),
            });
          }
        }
      );
    };
  }
}
```

#### Success Criteria
- [ ] All builders maintain exact API signatures
- [ ] Behavior matches current implementation
- [ ] All log messages preserved
- [ ] Correlation IDs flow correctly
- [ ] Metrics recorded identically

---

### Week 4: Integration & Migration
**Goal:** Replace old implementation with new system

#### Tasks
1. Create `lib/api/route-handlers/index.ts`
   - Export public API functions
   - Maintain backward compatibility

2. Update main exports to point to new implementation

3. Monitor production metrics

4. Deprecate old file after validation period

#### Deliverables

**Clean Public API:**
```typescript
// lib/api/route-handlers/index.ts

/**
 * Secure route with RBAC permission checking
 */
export function rbacRoute(
  handler: (
    request: NextRequest,
    userContext: UserContext,
    ...args: unknown[]
  ) => Promise<Response>,
  options: RBACRouteOptions & {
    permission: PermissionName | PermissionName[]
  }
) {
  return RBACRouteBuilder.build(handler, options);
}

/**
 * Public route (no authentication required)
 */
export function publicRoute(
  handler: (
    request: NextRequest,
    ...args: unknown[]
  ) => Promise<Response>,
  reason: string,
  options: Omit<
    RBACRouteOptions,
    'requireAuth' | 'publicReason' | 'permission'
  > = {}
) {
  return PublicRouteBuilder.build(handler, reason, options);
}

/**
 * Backward compatibility wrapper
 */
export function legacySecureRoute(
  handler: (
    request: NextRequest,
    session?: AuthSession,
    ...args: unknown[]
  ) => Promise<Response>,
  options: {
    rateLimit?: 'auth' | 'api' | 'upload';
    requireAuth?: boolean;
    publicReason?: string
  } = {}
) {
  return LegacyRouteBuilder.build(handler, options);
}

// Export types
export type {
  RBACRouteOptions,
  RouteContext,
  MiddlewareResult
} from './types';

// Re-export from rbac-extractors for convenience
export { extractors, rbacConfigs } from '../utils/rbac-extractors';
```

**Migration Steps:**
1. Complete implementation of all files
2. Export new functions from `lib/api/route-handlers/index.ts`
3. Update import in main API barrel export
4. Monitor CloudWatch for errors
5. Watch latency metrics (p95, p99)
6. Verify correlation IDs work
7. Mark old file as deprecated (add comment at top)
8. Remove old file after 1 release cycle

#### Success Criteria
- [ ] All 106 API routes work without modification
- [ ] Zero increase in error rates
- [ ] No regression in p95 latency
- [ ] All CloudWatch queries still work
- [ ] Correlation IDs preserved correctly

---

## Risk Mitigation

### Critical Safeguards

**1. API Compatibility**
- ✅ Function signatures unchanged
- ✅ Return types unchanged
- ✅ Option interfaces unchanged
- ✅ All existing routes work without modification

**2. Logging Consistency**
- ✅ Use same log templates (`logTemplates.crud`)
- ✅ Preserve correlation IDs
- ✅ Same field names (operation, userId, duration, component)
- ✅ Existing CloudWatch queries continue working

**3. Performance**
- ✅ Same number of async operations
- ✅ Context passing is lightweight (object spread)
- ✅ No additional database queries
- ✅ Metrics recording unchanged

**4. Rollback Plan**
- ✅ Keep old file for one release
- ✅ Simple import swap to revert
- ✅ No database migrations required
- ✅ No breaking changes to reverse

---

## Expected Benefits

### Quantified Improvements
- **Main file size:** 652 lines → 80 lines (**-88%**)
- **Code duplication:** 3 duplicate blocks → 1 utility (**-67%**)
- **Nesting depth:** 7 levels → 3 levels (**-57%**)
- **Files:** 1 monolith → 13 focused modules

### Qualitative Improvements
- **Separation of Concerns:** Each middleware has single responsibility
- **Composability:** Can create custom pipelines easily
- **Testability:** Impossible (652-line file) → Easy (isolated modules)
- **Maintainability:** Bug fixes in one place, not 3
- **Onboarding:** New developers understand system faster

### Pattern Consistency
This refactoring follows the **proven Organizations pattern**:
- ✅ Extract utilities (like sanitization.ts, query-builder.ts)
- ✅ Create focused modules (like members-service.ts, hierarchy-service.ts)
- ✅ Main file becomes orchestrator (like organizations/index.ts)
- ✅ Clean public API (factory function exports)

---

## Success Criteria

The refactoring is complete when:

1. ✅ All 106 API routes work without modification
2. ✅ Zero increase in error rates
3. ✅ No regression in p95 latency
4. ✅ All existing CloudWatch queries work
5. ✅ Main file reduced from 652 → ~80 lines
6. ✅ Code duplication eliminated (3 blocks → 1)
7. ✅ All middleware can be tested in isolation
8. ✅ Old file marked deprecated and removed after validation

---

## Implementation Checklist

### Week 1: Utilities ✅
- [ ] Create `lib/api/route-handlers/utils/metrics-recorder.ts`
- [ ] Create `lib/api/route-handlers/utils/error-handler.ts`
- [ ] Create `lib/api/route-handlers/utils/timing-tracker.ts`

### Week 2: Middleware ✅
- [ ] Create `lib/api/route-handlers/types.ts`
- [ ] Create `lib/api/route-handlers/middleware/pipeline.ts`
- [ ] Create `lib/api/route-handlers/middleware/correlation-middleware.ts`
- [ ] Create `lib/api/route-handlers/middleware/rate-limit-middleware.ts`
- [ ] Create `lib/api/route-handlers/middleware/auth-middleware.ts`
- [ ] Create `lib/api/route-handlers/middleware/rbac-middleware.ts`

### Week 3: Builders ✅
- [ ] Create `lib/api/route-handlers/builders/rbac-route-builder.ts`
- [ ] Create `lib/api/route-handlers/builders/public-route-builder.ts`
- [ ] Create `lib/api/route-handlers/builders/legacy-route-builder.ts`

### Week 4: Integration ✅
- [ ] Create `lib/api/route-handlers/index.ts` (public API)
- [ ] Update exports to point to new implementation
- [ ] Monitor production metrics (errors, latency, correlation IDs)
- [ ] Mark old file as deprecated
- [ ] Remove old file after validation period (1 release cycle)

---

## Conclusion

This refactoring transforms a **652-line monolith** with significant code duplication into a **clean, composable, testable middleware system** across 13 focused files.

**Key Success Factors:**
1. ✅ Maintain API compatibility throughout migration
2. ✅ Direct cutover (no feature flags needed)
3. ✅ Simple rollback plan (import swap)
4. ✅ Incremental implementation (utilities → middleware → builders)
5. ✅ Monitor metrics closely during rollout

**Pattern Proven:** Same refactoring approach successfully used for Organizations service.

**Status:** Ready to begin implementation.
