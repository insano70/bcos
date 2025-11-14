Route Handler Security System - Detailed Technical Documentation
Overview
Your application implements a composable middleware-based route handler architecture that replaces monolithic security functions with clean, testable components. The system provides three types of route handlers, each with a specific security profile and use case.
Architecture Philosophy
Before: Monolithic Handlers
Previously, security logic lived in deeply nested if/else chains (7+ levels) within large functions, making:
Testing difficult - Hard to test individual security checks in isolation
Maintenance painful - Changes ripple through nested conditionals
Reusability impossible - Logic couldn't be shared between route types
Debugging complex - Difficult to trace which middleware caused failure
After: Middleware Pipeline
The new architecture uses composable middleware that execute sequentially:
Request → Correlation → Rate Limit → Auth → RBAC → Handler → Response
Each middleware:
Has a single responsibility
Returns success/failure with updated context
Can be tested independently
Executes in a clean pipeline with early exit on failure
Route Handler Types
1. rbacRoute - RBAC Permission-Protected Routes
Purpose: Standard API routes requiring specific permissions Pipeline: Correlation → RateLimit → Auth → RBAC → Handler Handler Signature:
async (request: NextRequest, userContext: UserContext) => Promise<Response>
Usage Example:
// app/api/work-items/route.ts
import { rbacRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest, userContext: UserContext) => {
  // Handler receives full RBAC context
  const workItems = await workItemsService.getWorkItems({
    organization_id: userContext.current_organization_id,
  });
  
  return createSuccessResponse({ workItems });
};

export const GET = rbacRoute(handler, {
  permission: 'work_items:read:all',  // Required permission
  rateLimit: 'api',                    // 200 req/min
});
Options:
{
  permission: PermissionName | PermissionName[],  // Required
  rateLimit?: 'auth' | 'mfa' | 'api' | 'upload' | 'session_read',
  requireAllPermissions?: boolean,  // AND vs OR logic for multiple permissions
  extractResourceId?: (request) => string | undefined,
  extractOrganizationId?: (request) => string | undefined,
  onPermissionDenied?: (userContext, deniedPermissions) => Response,
}
Key Features:
Permission checking - Validates user has required RBAC permissions
Scope filtering - Automatic resource/organization scoping
Full user context - Handler receives complete RBAC data (roles, permissions, organizations)
Multiple permissions - Support for AND/OR logic with permission arrays
Custom denial handlers - Override default 403 response
Use Cases:
CRUD operations on business resources
Admin operations
Organization-scoped endpoints
Multi-tenant operations
2. publicRoute - Unauthenticated Public Routes
Purpose: Endpoints that don't require authentication Pipeline: Correlation → RateLimit → Handler Handler Signature:
async (request: NextRequest) => Promise<Response>
Usage Example:
// app/api/security/csp-report/route.ts
import { publicRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest) => {
  const report = await request.json();
  log.security('csp_violation', 'low', { report });
  
  return createSuccessResponse({ received: true });
};

export const POST = publicRoute(
  handler,
  'CSP violation reporting - browsers send these automatically',  // Required reason
  { rateLimit: 'api' }
);
Options:
{
  rateLimit?: 'auth' | 'mfa' | 'api' | 'upload' | 'session_read',
}
Required Documentation:
Second parameter must be a reason string explaining why route is public
Reason stored for security audits and documentation
Examples:
"Health check endpoint for load balancers"
"CSRF tokens must be available before authentication"
"Authentication endpoint - must be public to allow login"
Use Cases:
Health checks
CSRF token generation
CSP violation reporting
Login/signup endpoints
Public webhooks
Contact forms
3. authRoute - Authenticated Without RBAC
Purpose: Auth system routes that need authentication but not permission checks Pipeline: Correlation → RateLimit → Auth → Handler Handler Signature:
async (request: NextRequest, session?: AuthSession) => Promise<Response>
Usage Example:
// app/api/auth/me/route.ts
import { authRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest, session?: AuthSession) => {
  if (!session) {
    return createErrorResponse('Unauthorized', 401, request);
  }
  
  return createSuccessResponse({
    user: session.user,
    roles: session.user.roles,
  });
};

export const GET = authRoute(handler, { 
  rateLimit: 'api',
  requireAuth: true,  // Default: true
});
Options:
{
  rateLimit?: 'auth' | 'mfa' | 'api' | 'upload' | 'session_read',
  requireAuth?: boolean,  // Default: true
  publicReason?: string,  // Required if requireAuth is false
}
Session Object:
interface AuthSession {
  user: {
    id: string;
    email: string | null;
    name: string;
    roles: string[];
    permissions: string[];
    isSuperAdmin: boolean;
    organizationAdminFor: string[];
  };
  accessToken: string;
  sessionId: string;
  userContext: UserContext | null;  // Full RBAC context available
}
Use Cases:
MFA verification endpoints
Credential management (password reset, email verification)
User profile endpoints
Session management
Auth system metadata
Middleware Components
1. Correlation Middleware
Location: lib/api/route-handlers/middleware/correlation-middleware.ts Purpose: Request tracing and correlation ID management Functionality:
Generates or extracts x-correlation-id header
Creates request-scoped logging context
Enables distributed tracing across microservices
All logs within request automatically tagged with correlation ID
Context Updates:
{
  correlationId: string;  // UUID v4 or from header
}
2. Rate Limit Middleware
Location: lib/api/route-handlers/middleware/rate-limit-middleware.ts Purpose: Prevent abuse and DoS attacks Rate Limit Types:
Type	Limit	Window	Use Case
auth	20 requests	15 min	Login, logout, token refresh
mfa	5 requests	15 min	MFA verification (strict to prevent brute force)
api	200 requests	1 min	Standard API operations
upload	10 requests	1 min	File upload endpoints
session_read	500 requests	1 min	High-frequency session checks
Implementation:
IP-based tracking using Redis (via Elasticache Valkey)
Sliding window algorithm
Returns 429 Too Many Requests on limit exceeded
Security event logged for rate limit violations
3. Auth Middleware
Location: lib/api/route-handlers/middleware/auth-middleware.ts Purpose: Validate user authentication Functionality:
Delegates to applyGlobalAuth() for JWT validation
Retrieves session from cookie or Authorization header
Fetches full user context (RBAC permissions, roles, organizations)
Caches user context in session to avoid redundant DB queries
Returns 401 Unauthorized if authentication fails
Context Updates:
{
  session: AuthResult;        // Full session data
  userId: string;             // User ID for logging
  userContext: UserContext;   // RBAC permissions and roles
}
Security Features:
JWT signature verification
Token expiration checking
Session validation against database
Security logging for auth failures
4. RBAC Middleware
Location: lib/api/route-handlers/middleware/rbac-middleware.ts Purpose: Permission-based access control Functionality:
Validates user has required permissions
Supports AND/OR logic for multiple permissions
Resource-level scoping (e.g., "can edit THIS work item")
Organization-level scoping (e.g., "can manage users in THIS org")
Returns 403 Forbidden on permission denial
Permission Format: resource:action:scope
Resource: users, practices, work_items, analytics, etc.
Action: read, create, update, delete, manage
Scope: all, organization, own
Examples:
'users:read:all'                    // Read all users across all orgs
'users:update:organization'         // Update users in your org
'work_items:create:own'            // Create work items for yourself
'analytics:read:organization'      // View analytics for your org
Multiple Permissions:
// User needs ANY of these (OR logic)
permission: ['users:read:all', 'users:read:organization']

// User needs ALL of these (AND logic)
permission: ['users:update:all', 'users:update:sensitive'],
requireAllPermissions: true
Scope Checking:
// Extract resource ID from URL for scope validation
export const PUT = rbacRoute(handler, {
  permission: 'work_items:update:organization',
  extractResourceId: (request) => {
    // GET /api/work-items/123
    const id = request.nextUrl.pathname.split('/').pop();
    return id;
  },
});
Middleware Pipeline Execution
Flow Diagram
┌─────────────────────────────────────────────────────────────────┐
│ Request arrives                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                ┌───────────────▼───────────────┐
                │ Extract/Generate              │
                │ Correlation ID                │
                │ (CorrelationMiddleware)       │
                └───────────────┬───────────────┘
                                │
                                │ Success
                                │
                ┌───────────────▼───────────────┐
                │ Check Rate Limit              │
                │ (RateLimitMiddleware)         │
                └───────────────┬───────────────┘
                                │
                      ┌─────────┴─────────┐
                      │                   │
                   Success              Failure
                      │                   │
                      │         ┌─────────▼──────────┐
                      │         │ Return 429         │
                      │         │ Too Many Requests  │
                      │         └────────────────────┘
                      │
        ┌─────────────▼────────────────┐
        │ Validate Authentication      │
        │ (AuthMiddleware)             │
        │ - Check JWT                  │
        │ - Load UserContext           │
        └─────────────┬────────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
         Success              Failure
            │                   │
            │         ┌─────────▼──────────┐
            │         │ Return 401         │
            │         │ Unauthorized       │
            │         └────────────────────┘
            │
            │ (RBAC routes only)
            │
┌───────────▼──────────────────┐
│ Check RBAC Permissions       │
│ (RBACMiddleware)             │
│ - Validate permissions       │
│ - Check resource scope       │
└───────────┬──────────────────┘
            │
  ┌─────────┴─────────┐
  │                   │
Success             Failure
  │                   │
  │         ┌─────────▼──────────┐
  │         │ Return 403         │
  │         │ Forbidden          │
  │         └────────────────────┘
  │
┌─▼────────────────────────────┐
│ Call Route Handler           │
│ - Handler receives context   │
│ - Execute business logic     │
└─┬────────────────────────────┘
  │
┌─▼────────────────────────────┐
│ Record Metrics               │
│ - Response status            │
│ - Duration                   │
│ - User ID                    │
└─┬────────────────────────────┘
  │
┌─▼────────────────────────────┐
│ Return Response              │
└──────────────────────────────┘
Pipeline Class
Location: lib/api/route-handlers/middleware/pipeline.ts Key Features:
Sequential execution - Middleware run in order
Early exit - First failure stops pipeline
Context accumulation - Each middleware can update shared context
Automatic timing - Records duration of each middleware
Error handling - Ensures error responses are always returned
Implementation:
export class MiddlewarePipeline {
  constructor(private middlewares: Middleware[]) {}

  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    let currentContext = context;

    for (const middleware of this.middlewares) {
      const result = await middleware.execute(request, currentContext);

      // First failure stops pipeline
      if (!result.success) {
        return {
          success: false,
          response: result.response,
          context: result.context ?? currentContext,
        };
      }

      // Accumulate context updates
      if (result.context) {
        currentContext = { ...currentContext, ...result.context };
      }
    }

    return { success: true, context: currentContext };
  }
}
Route Context
Type: RouteContext The context object accumulates state as it flows through middleware:
interface RouteContext {
  // Metadata
  routeType: 'rbac' | 'public' | 'auth';
  url: URL;
  startTime: number;
  correlationId?: string;
  
  // Timing
  timingTracker: TimingTracker;
  timings?: Record<string, number>;
  totalDuration?: number;
  
  // Authentication
  userId?: string;
  session?: AuthResult;
  userContext?: UserContext;
  
  // RBAC
  rbacDenied?: boolean;
}
Automatic Features
1. Timing Tracking
Implementation: TimingTracker Automatic Metrics:
Middleware execution time (correlation, rateLimit, auth, RBAC)
Handler execution time
Total request duration
Logged automatically with each request
Usage in Logs:
INFO: GET /api/work-items completed {
  duration: 234,
  timings: {
    correlation: 2,
    rateLimit: 5,
    auth: 45,
    rbac: 12,
    handler: 170
  }
}
2. Metrics Recording
Implementation: MetricsRecorder Automatic Recording:
Request count by route type
Response status distribution
Duration percentiles (p50, p95, p99)
Error rates
RBAC denial rates
Rate limit violation rates
Stored in: CloudWatch Metrics (via custom metrics API)
3. Error Handling
Implementation: RouteErrorHandler Features:
Catches all unhandled errors in handlers
Logs errors with full context (correlation ID, user ID, route)
Sanitizes error messages (no stack traces to client in production)
Returns appropriate status codes:
400 - Validation errors
401 - Authentication failures
403 - Permission denials
429 - Rate limit exceeded
500 - Internal server errors
Security Features
1. Comprehensive Logging
All security events logged:
Authentication attempts (success/failure)
RBAC permission checks (granted/denied)
Rate limit violations
Suspicious activity (multiple failed auths, unusual patterns)
Log Retention:
ERROR/WARN: 100% retention
INFO: 10% sampling in production
DEBUG: 1% sampling in production
Security logs: 100% retention always
CloudWatch Query Example:
# Find all failed auth attempts for a user
fields @timestamp, message, userId, reason
| filter level = "WARN" and message like /authentication failed/
| filter userId = "user-123"
| sort @timestamp desc
2. Audit Trail
Audit Events:
User actions (create, update, delete)
Permission changes
Role assignments
Organization membership changes
Security-sensitive operations
Audit Logger: AuditLogger Automatic Capture:
User ID (who)
Timestamp (when)
Action (what)
Resource (which entity)
IP address (from where)
User agent (which client)
Correlation ID (trace full request)
3. Rate Limiting
Implementation: Redis-backed sliding window Security Benefits:
Prevents brute force attacks
Mitigates DoS attempts
Protects expensive operations
Identifies malicious actors
Logging:
log.security('rate_limit_exceeded', 'high', {
  ipAddress: clientIp,
  limitType: 'auth',
  blocked: true,
  threat: 'credential_attack',
});
4. CSRF Protection
Automatic CSRF Validation:
All state-changing requests (POST, PUT, DELETE, PATCH) require CSRF token
Tokens bound to session
Double-submit cookie pattern
Validation happens in applyGlobalAuth()
Exceptions:
Routes explicitly marked public
API routes using JWT bearer tokens (stateless)
Migration Guide
Legacy Pattern → New Pattern
Before (Monolithic):
// ❌ Old pattern (deprecated)
import { secureRoute } from '@/lib/api/route-handler';

export const GET = secureRoute(async (request, session) => {
  // Manual permission checking
  if (!hasPermission(session, 'users:read:all')) {
    return new Response('Forbidden', { status: 403 });
  }
  
  return NextResponse.json({ data });
});
After (Composable):
// ✅ New pattern
import { rbacRoute } from '@/lib/api/route-handlers';

const handler = async (request: NextRequest, userContext: UserContext) => {
  // Permission already checked by RBAC middleware
  return createSuccessResponse({ data });
};

export const GET = rbacRoute(handler, {
  permission: 'users:read:all',
  rateLimit: 'api',
});
Testing
Unit Testing Middleware
Each middleware can be tested independently:
describe('AuthMiddleware', () => {
  it('should return 401 for missing session', async () => {
    const middleware = new AuthMiddleware(true);
    const result = await middleware.execute(mockRequest, mockContext);
    
    expect(result.success).toBe(false);
    expect(result.response?.status).toBe(401);
  });
  
  it('should pass for valid session', async () => {
    const middleware = new AuthMiddleware(true);
    const result = await middleware.execute(requestWithSession, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.context?.userContext).toBeDefined();
  });
});
Integration Testing Routes
Test complete route handlers with real middleware:
describe('GET /api/work-items', () => {
  it('should return 403 without permission', async () => {
    const response = await testApiRoute(
      '/api/work-items',
      { method: 'GET' },
      { userId: 'user-without-permission' }
    );
    
    expect(response.status).toBe(403);
  });
  
  it('should return work items with permission', async () => {
    const response = await testApiRoute(
      '/api/work-items',
      { method: 'GET' },
      { userId: 'user-with-permission' }
    );
    
    expect(response.status).toBe(200);
    expect(response.data.work_items).toBeDefined();
  });
});
File Structure
lib/api/route-handlers/
├── index.ts                       # Public API (rbacRoute, publicRoute, authRoute)
├── types.ts                       # TypeScript interfaces
├── builders/
│   ├── rbac-route-builder.ts     # Builds RBAC routes
│   ├── public-route-builder.ts   # Builds public routes
│   └── auth-route-builder.ts     # Builds auth routes
├── middleware/
│   ├── pipeline.ts               # Sequential middleware executor
│   ├── correlation-middleware.ts # Request tracing
│   ├── rate-limit-middleware.ts  # Rate limiting
│   ├── auth-middleware.ts        # Authentication
│   └── rbac-middleware.ts        # Permission checking
└── utils/
    ├── timing-tracker.ts         # Performance tracking
    ├── metrics-recorder.ts       # CloudWatch metrics
    └── error-handler.ts          # Centralized error handling
Best Practices
1. Choose the Right Route Type
Default: Use rbacRoute for all business logic routes
Public: Only use publicRoute when absolutely necessary (health checks, webhooks, public forms)
Auth-only: Use authRoute for auth system endpoints that don't fit RBAC (MFA, profile management)
2. Permission Granularity
// ✅ Good: Specific permissions
permission: 'work_items:update:organization'

// ❌ Bad: Overly broad permissions
permission: 'admin:*:*'
3. Rate Limit Selection
// ✅ Good: Match rate limit to operation
export const POST = rbacRoute(loginHandler, {
  permission: 'users:read:all',
  rateLimit: 'auth',  // Strict for auth
});

export const GET = rbacRoute(listHandler, {
  permission: 'users:read:all',
  rateLimit: 'api',  // Standard for reads
});

export const POST = rbacRoute(uploadHandler, {
  permission: 'files:create:organization',
  rateLimit: 'upload',  // Relaxed for large uploads
});
4. Error Handling
// ✅ Good: Let middleware handle errors, add context
const handler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const data = await fetchData();
    return createSuccessResponse({ data });
  } catch (error) {
    log.error('Failed to fetch data', error, { userId: userContext.user_id });
    throw error;  // Caught by RouteErrorHandler
  }
};
5. Logging
// ✅ Good: Log once at end with all context
log.info('work items listed', {
  operation: 'list_work_items',
  userId: userContext.user_id,
  results: { returned: items.length, total: count },
  filters: sanitizeFilters(query),
  duration,
});

// ❌ Bad: Multiple verbose logs
log.info('Starting work items query');
log.info('Query executed', { duration: 123 });
log.info('Results formatted');
log.info('Response sent');
Performance Characteristics
Overhead Per Request
Middleware	Typical Duration	Notes
Correlation	1-3ms	UUID generation
Rate Limit	3-8ms	Redis lookup
Auth	30-50ms	JWT validation + session fetch
RBAC	8-15ms	Permission checking (cached)
Total	~45-75ms	Before handler execution
Optimization Strategies
Session Caching: User context cached in session (no DB query per request)
Permission Caching: RBAC permissions cached for session duration
Redis Pipeline: Rate limit checks use Redis pipelining
Connection Pooling: Database connections pooled and reused