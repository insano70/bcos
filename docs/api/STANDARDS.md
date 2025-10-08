# API Development Standards

**Last Updated**: 2025-01-07
**Status**: Active
**Owner**: Engineering Team

---

## Table of Contents

1. [Overview](#overview)
2. [Gold Standard Template](#gold-standard-template)
3. [Import Order Convention](#import-order-convention)
4. [Naming Conventions](#naming-conventions)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Logging Requirements](#logging-requirements)
7. [Validation Patterns](#validation-patterns)
8. [Service Layer Requirements](#service-layer-requirements)
9. [RBAC Integration](#rbac-integration)
10. [Rate Limiting](#rate-limiting)
11. [Response Patterns](#response-patterns)
12. [Testing Requirements](#testing-requirements)
13. [Complete Examples](#complete-examples)
14. [Anti-Patterns](#anti-patterns)

---

## Overview

All API route handlers in this codebase must follow the gold standard pattern to ensure:
- **Consistency** - Easy to understand and maintain
- **Type Safety** - Full TypeScript strict mode compliance
- **Security** - RBAC enforcement through service layer
- **Performance** - Tracked and logged
- **Testability** - Clear separation of concerns
- **Maintainability** - Single responsibility principle

### Gold Standard APIs

Use these as reference implementations:
- `app/api/users/route.ts` - Collection endpoints (GET list, POST create)
- `app/api/users/[id]/route.ts` - Detail endpoints (GET, PUT, DELETE)
- `app/api/admin/data-sources/[id]/columns/[columnId]/route.ts` - Nested resources

---

## Gold Standard Template

Every API handler must follow this structure:

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { extractRouteParams } from '@/lib/api/utils/params';
import { [resourceSchema] } from '@/lib/validations/[resource]';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBAC[Resource]Service } from '@/lib/services/rbac-[resource]-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Handler for [operation] on [resource]
 *
 * [Brief description of what this endpoint does]
 *
 * @example
 * GET /api/resources?status=active&page=1&limit=20
 */
const [operation][Resource]Handler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  log.info('[Operation] [resource] request initiated', {
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  });

  try {
    // 1. Extract and validate parameters
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['field1', 'field2', 'created_at']);
    const query = validateQuery(searchParams, querySchema);

    // For route params:
    // const { id } = await extractRouteParams(args[0], paramsSchema);

    // For request body:
    // const body = await validateRequest(request, bodySchema);

    // 2. Create service instance
    const service = createRBAC[Resource]Service(userContext);

    // 3. Execute operation through service
    const result = await service.[operation]({
      ...query,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    });

    // For counts (pagination):
    // const totalCount = await service.getCount(query);

    // 4. Log success with metrics
    log.info('[Operation] [resource] completed successfully', {
      duration: Date.now() - startTime,
      resultCount: Array.isArray(result) ? result.length : 1
    });

    // 5. Return standardized response
    return createSuccessResponse(result, '[Success message]');

    // For paginated lists:
    // return createPaginatedResponse(result, {
    //   page: pagination.page,
    //   limit: pagination.limit,
    //   total: totalCount
    // });

  } catch (error) {
    log.error('[Operation] [resource] failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

// Export with RBAC protection
export const [METHOD] = rbacRoute(
  [operation][Resource]Handler,
  {
    permission: ['[resource]:[action]:[scope]'],
    extractResourceId: extractors.[resource]Id,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

---

## Import Order Convention

**Always organize imports in this exact order:**

```typescript
// 1. Next.js types (type-only imports first)
import type { NextRequest } from 'next/server';

// 2. Database (if needed in exceptional cases - prefer service layer)
import { db, [tables] } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';

// 3. API response utilities
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError, ValidationError } from '@/lib/api/responses/error';

// 4. API middleware and utilities
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { extractRouteParams } from '@/lib/api/utils/params';

// 5. Validation schemas
import { [resourceSchema], [otherSchemas] } from '@/lib/validations/[resource]';

// 6. RBAC infrastructure
import { rbacRoute, publicRoute } from '@/lib/api/rbac-route-handler';
import { extractors, rbacConfigs } from '@/lib/api/utils/rbac-extractors';

// 7. Service layer
import { createRBAC[Resource]Service } from '@/lib/services/rbac-[resource]-service';

// 8. Types
import type { UserContext } from '@/lib/types/rbac';
import type { [CustomType] } from '@/lib/types/[custom]';

// 9. Logging
import { log } from '@/lib/logger';

// 10. Other utilities (if needed)
import { AuditLogger } from '@/lib/api/services/audit';
```

**Rationale**: This order groups related imports together and makes it easy to scan for missing dependencies.

---

## Naming Conventions

### Handler Functions

**Format**: `[operation][Resource]Handler`

```typescript
// ✅ Correct
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {};
const getUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {};
const createUserHandler = async (request: NextRequest, userContext: UserContext) => {};
const updateUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {};
const deleteUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {};

// ❌ Incorrect
const handler = async (request: NextRequest, userContext: UserContext) => {}; // Too generic
const getUsers = async (request: NextRequest, userContext: UserContext) => {}; // Missing "Handler"
const handleGetUsers = async (request: NextRequest, userContext: UserContext) => {}; // Wrong prefix
```

### Service Functions

**Format**: `createRBAC[Resource]Service`

```typescript
// ✅ Correct
export function createRBACUsersService(userContext: UserContext) {}
export function createRBACPracticesService(userContext: UserContext) {}

// ❌ Incorrect
export function usersService(userContext: UserContext) {} // Missing RBAC prefix
export function getUsersService(userContext: UserContext) {} // Wrong format
```

### Variable Names

```typescript
// ✅ Correct
const startTime = Date.now();
const usersService = createRBACUsersService(userContext);
const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

// ❌ Incorrect
const t = Date.now(); // Too short
const service = createRBACUsersService(userContext); // Too generic
const { id } = await extractRouteParams(args[0], userParamsSchema); // Ambiguous
```

---

## Error Handling Patterns

### Standard Error Structure

Every handler must have this try-catch structure:

```typescript
const handler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Operation initiated', { context });

  try {
    // Handler logic

    log.info('Operation completed', { duration: Date.now() - startTime });
    return createSuccessResponse(result, 'Success message');

  } catch (error) {
    log.error('Operation failed', error, {
      duration: Date.now() - startTime,
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};
```

### Using Standard Error Types

```typescript
import { NotFoundError, ValidationError, ConflictError, PermissionError } from '@/lib/api/responses/error';

// ✅ Use factory functions
throw NotFoundError('User');
throw ValidationError('Invalid email format');
throw ConflictError('User with this email already exists');
throw PermissionError('You cannot access this resource');

// ❌ Don't create generic errors
throw new Error('User not found'); // Should use NotFoundError
```

### Error Status Codes

```typescript
// In the catch block, determine appropriate status code:
catch (error) {
  log.error('Operation failed', error);

  let statusCode = 500;
  if (error instanceof NotFoundError) statusCode = 404;
  else if (error instanceof ValidationError) statusCode = 400;
  else if (error instanceof ConflictError) statusCode = 409;
  else if (error instanceof PermissionError) statusCode = 403;

  return createErrorResponse(error, statusCode, request);
}
```

---

## Logging Requirements

### Required Logs

Every handler must log at minimum:

```typescript
// 1. Operation start
log.info('[Operation] initiated', {
  requestingUserId: userContext.user_id,
  organizationId: userContext.current_organization_id,
  // Add relevant context
});

// 2. Operation success
log.info('[Operation] completed successfully', {
  duration: Date.now() - startTime,
  resultCount: results.length, // or other relevant metrics
});

// 3. Operation failure
log.error('[Operation] failed', error, {
  duration: Date.now() - startTime,
  requestingUserId: userContext.user_id,
  // Add error context
});
```

### Log Levels

```typescript
// INFO - Normal operations
log.info('User logged in', { userId });

// WARN - Potentially problematic but not errors
log.warn('Rate limit approaching', { userId, requestCount });

// ERROR - Actual errors
log.error('Database query failed', error, { query });

// DEBUG - Detailed debugging information (development only)
log.debug('Processing batch', { batchSize, currentIndex });

// SECURITY - Security-related events
log.security('authentication_failure', 'medium', {
  action: 'login_attempt',
  blocked: true
});
```

### Structured Logging

**Always use structured logging with context objects:**

```typescript
// ✅ Correct - structured with context
log.info('User created', {
  userId: newUser.user_id,
  email: newUser.email,
  createdBy: userContext.user_id,
  duration: Date.now() - startTime
});

// ❌ Incorrect - string concatenation
log.info(`User ${newUser.user_id} created by ${userContext.user_id}`);
```

---

## Validation Patterns

### Query Parameter Validation

```typescript
import { validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';

const { searchParams } = new URL(request.url);
const pagination = getPagination(searchParams); // Handles page, limit, offset
const sort = getSortParams(searchParams, ['name', 'created_at']); // Validates sortBy
const query = validateQuery(searchParams, querySchema); // Zod validation
```

### Request Body Validation

```typescript
import { validateRequest } from '@/lib/api/middleware/validation';

const validatedData = await validateRequest(request, createUserSchema);
// validatedData is now typed and validated
```

### Route Parameters Validation

```typescript
import { extractRouteParams } from '@/lib/api/utils/params';

// For single param
const { id } = await extractRouteParams(args[0], idParamsSchema);

// For multiple params
const { id, columnId } = await extractRouteParams(args[0], columnsParamsSchema);
```

### Creating Validation Schemas

```typescript
// lib/validations/[resource].ts
import { z } from 'zod';

// Query schema
export const userQuerySchema = z.object({
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  email_verified: z.enum(['true', 'false']).optional()
});

// Create schema
export const userCreateSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email_verified: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true)
});

// Update schema (all fields optional)
export const userUpdateSchema = userCreateSchema.partial();

// Params schema
export const userParamsSchema = z.object({
  id: z.string().uuid()
});
```

---

## Service Layer Requirements

### When to Create a Service

Create a service for:
- ✅ Any resource with CRUD operations
- ✅ Any resource needing RBAC enforcement
- ✅ Complex business logic
- ✅ Database queries

### Service Structure

```typescript
// lib/services/rbac-[resource]-service.ts
import { db, [tables] } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { NotFoundError, PermissionError } from '@/lib/api/responses/error';

export interface [Resource]ServiceInterface {
  get[Resources](filters: [Resource]Filters): Promise<[Resource][]>;
  get[Resource]ById(id: string): Promise<[Resource] | null>;
  get[Resource]Count(filters?: [Resource]Filters): Promise<number>;
  create[Resource](data: Create[Resource]Data): Promise<[Resource]>;
  update[Resource](id: string, data: Update[Resource]Data): Promise<[Resource]>;
  delete[Resource](id: string): Promise<boolean>;
}

export function createRBAC[Resource]Service(userContext: UserContext): [Resource]ServiceInterface {
  // Check permissions once at service creation
  const canReadAll = userContext.all_permissions?.some(p =>
    p.name === '[resource]:read:all'
  ) || userContext.is_super_admin;

  const canReadOwn = userContext.all_permissions?.some(p =>
    p.name === '[resource]:read:own'
  );

  return {
    async get[Resources](filters) {
      // Apply RBAC filtering based on permissions
      const whereConditions = [];

      if (!canReadAll) {
        if (canReadOwn) {
          whereConditions.push(eq([table].user_id, userContext.user_id));
        } else {
          return []; // No permission
        }
      }

      // Add other filters
      // Execute query
      // Return results
    },

    async get[Resource]ById(id) {
      const resource = await db.select()...;

      if (!resource) return null;

      // Check access
      if (!canReadAll && resource.user_id !== userContext.user_id) {
        throw PermissionError('You cannot access this resource');
      }

      return resource;
    },

    // ... other methods
  };
}
```

### Service Best Practices

1. **Permission checking happens in service, not handler**
2. **All database queries go through service**
3. **Service methods throw specific errors** (NotFoundError, PermissionError)
4. **Service is stateless** (no instance variables)
5. **Service returns typed data** (no `any` types)

---

## RBAC Integration

### Using rbacRoute

```typescript
export const GET = rbacRoute(
  getUsersHandler,
  {
    permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Permission Naming Convention

Format: `[resource]:[action]:[scope]`

```typescript
// Resources: users, practices, charts, dashboards, etc.
// Actions: read, create, update, delete, manage
// Scopes: own, organization, all

'users:read:own'           // Read own user data
'users:read:organization'  // Read users in same org
'users:read:all'           // Read all users (super admin)
'practices:create:all'     // Create practices (super admin)
'charts:update:own'        // Update own charts
```

### Public Routes

For endpoints that don't require authentication:

```typescript
export const POST = publicRoute(
  contactFormHandler,
  'Allow visitors to submit contact forms',
  { rateLimit: 'api' }
);
```

### Using rbacConfigs

For common permission sets:

```typescript
import { rbacConfigs } from '@/lib/api/utils/rbac-extractors';

// Super admin only
export const DELETE = rbacRoute(
  deletePracticeHandler,
  {
    ...rbacConfigs.superAdmin,
    rateLimit: 'api'
  }
);
```

---

## Rate Limiting

### Configuration

All API routes are protected by rate limiting to prevent abuse and ensure fair resource allocation. Rate limiting is configured at the route level using the `rateLimit` parameter in `rbacRoute` and `publicRoute` configurations.

### Rate Limit Tiers

The system supports multiple rate limit tiers based on endpoint sensitivity and usage patterns:

```typescript
// Standard API rate limit (default for most endpoints)
export const GET = rbacRoute(
  getResourceHandler,
  {
    permission: 'resource:read:all',
    rateLimit: 'api' // 100 requests per 15 minutes per user
  }
);

// Strict rate limit for sensitive operations
export const POST = rbacRoute(
  createResourceHandler,
  {
    permission: 'resource:create:all',
    rateLimit: 'strict' // 20 requests per 15 minutes per user
  }
);

// Relaxed rate limit for public endpoints
export const GET = publicRoute(
  publicResourceHandler,
  'Public resource access',
  {
    rateLimit: 'public' // 50 requests per 15 minutes per IP
  }
);
```

### Rate Limit Implementation

Rate limiting is implemented using:
- **In-Memory Storage**: Redis-backed rate limit tracking
- **Per-User Limits**: Authenticated requests are rate limited per `user_id`
- **Per-IP Limits**: Public/unauthenticated requests are rate limited per IP address
- **Sliding Window**: Uses sliding window algorithm for accurate request counting

### Rate Limit Headers

All API responses include rate limit information in headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704672000
```

### Rate Limit Response

When rate limit is exceeded, the API returns:

```typescript
{
  success: false,
  error: 'Rate limit exceeded. Please try again later.',
  statusCode: 429,
  retryAfter: 900 // seconds until rate limit resets
}
```

### Best Practices

1. **Choose Appropriate Tier**: Use `strict` for write operations, `api` for reads, `public` for unauthenticated endpoints
2. **Document Limits**: Include rate limit information in API documentation
3. **Handle 429 Responses**: Client applications should implement exponential backoff when receiving 429 responses
4. **Monitor Usage**: Track rate limit hits to identify potential abuse or legitimate high-traffic patterns

### Bypassing Rate Limits

Rate limits can be bypassed for:
- **Super Admins**: Users with `is_super_admin: true` bypass all rate limits
- **Service Accounts**: Internal service-to-service calls bypass rate limits
- **Health Checks**: Health check endpoints are exempt from rate limiting

```typescript
// Health check endpoint (no rate limiting)
export const GET = publicRoute(
  healthCheckHandler,
  'System health check',
  {
    rateLimit: 'none' // No rate limiting for health checks
  }
);
```

### Monitoring Rate Limits

Monitor rate limit effectiveness through:
- **Logs**: Rate limit hits are logged with `log.warn()`
- **Metrics**: Rate limit metrics are tracked in application monitoring
- **Alerts**: Set up alerts for sustained rate limit violations

```typescript
// Rate limit logging example
log.warn('Rate limit exceeded', {
  userId: userContext.user_id,
  ip: request.ip,
  endpoint: request.url,
  limit: 100,
  window: '15m'
});
```

---

## Response Patterns

### Success Responses

```typescript
import { createSuccessResponse, createPaginatedResponse } from '@/lib/api/responses/success';

// Single item
return createSuccessResponse(user, 'User retrieved successfully');

// List with pagination
return createPaginatedResponse(users, {
  page: pagination.page,
  limit: pagination.limit,
  total: totalCount
});

// No data (e.g., after delete)
return createSuccessResponse(null, 'User deleted successfully');
```

### Error Responses

```typescript
import { createErrorResponse } from '@/lib/api/responses/error';

// Generic error
return createErrorResponse('Something went wrong', 500, request);

// Error object
return createErrorResponse(error, 500, request);

// Specific error with custom status
return createErrorResponse('User not found', 404, request);
```

### Response Format

All responses follow this structure:

```typescript
// Success
{
  success: true,
  data: { /* result */ },
  message: 'Operation successful'
}

// Paginated success
{
  success: true,
  data: [/* results */],
  pagination: {
    page: 1,
    limit: 20,
    total: 100
  }
}

// Error
{
  success: false,
  error: 'Error message',
  statusCode: 500
}
```

---

## Testing Requirements

### Test Structure

Every API route must have tests in `__tests__/route.test.ts`:

```typescript
import { createMockRequest, createMockUserContext } from '@/lib/api/testing/api-test-helpers';
import { GET, POST } from '../route';

describe('GET /api/users', () => {
  it('returns users for authenticated user', async () => {
    const request = createMockRequest({ method: 'GET', url: '/api/users' });
    const userContext = createMockUserContext();

    const response = await GET(request, userContext);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('returns 403 for user without permission', async () => {
    const request = createMockRequest({ method: 'GET', url: '/api/users' });
    const userContext = createMockUserContext(); // no permissions

    const response = await GET(request, userContext);

    expect(response.status).toBe(403);
  });
});
```

### Required Test Cases

Minimum tests for each endpoint:
- ✅ Happy path (authorized user, valid input)
- ✅ Permission denied (user without permission)
- ✅ Not found (for detail endpoints)
- ✅ Validation error (invalid input)
- ✅ RBAC boundaries (can't access other user's data)

---

## Complete Examples

### Example 1: List Endpoint with Pagination

```typescript
import type { NextRequest } from 'next/server';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateQuery } from '@/lib/api/middleware/validation';
import { getPagination, getSortParams } from '@/lib/api/utils/request';
import { userQuerySchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('List users request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    const { searchParams } = new URL(request.url);
    const pagination = getPagination(searchParams);
    const sort = getSortParams(searchParams, ['first_name', 'last_name', 'email', 'created_at']);
    const query = validateQuery(searchParams, userQuerySchema);

    const usersService = createRBACUsersService(userContext);
    const users = await usersService.getUsers({
      search: query.search,
      is_active: query.is_active,
      email_verified: query.email_verified,
      limit: pagination.limit,
      offset: pagination.offset,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder
    });

    const totalCount = await usersService.getUserCount();

    log.info('Users list retrieved successfully', {
      count: users.length,
      total: totalCount,
      duration: Date.now() - startTime
    });

    return createPaginatedResponse(users, {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount
    });

  } catch (error) {
    log.error('List users failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};

export const GET = rbacRoute(
  getUsersHandler,
  {
    permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Example 2: Detail Endpoint with Route Params

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { extractRouteParams } from '@/lib/api/utils/params';
import { userParamsSchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const getUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    log.info('Get user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    const usersService = createRBACUsersService(userContext);
    const user = await usersService.getUserById(userId);

    if (!user) {
      throw NotFoundError('User');
    }

    log.info('User retrieved successfully', {
      targetUserId: userId,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(user);

  } catch (error) {
    log.error('Get user failed', error, {
      duration: Date.now() - startTime
    });

    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(error, statusCode, request);
  }
};

export const GET = rbacRoute(
  getUserHandler,
  {
    permission: ['users:read:own', 'users:read:organization', 'users:read:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Example 3: Create Endpoint with Body Validation

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { userCreateSchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Create user request initiated', {
    createdByUserId: userContext.user_id
  });

  try {
    const validatedData = await validateRequest(request, userCreateSchema);

    const usersService = createRBACUsersService(userContext);
    const newUser = await usersService.createUser({
      ...validatedData,
      organization_id: userContext.current_organization_id || ''
    });

    log.info('User created successfully', {
      newUserId: newUser.user_id,
      createdByUserId: userContext.user_id,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(newUser, 'User created successfully');

  } catch (error) {
    log.error('Create user failed', error, {
      duration: Date.now() - startTime
    });
    return createErrorResponse(error, 500, request);
  }
};

export const POST = rbacRoute(
  createUserHandler,
  {
    permission: 'users:create:organization',
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Example 4: Update Endpoint with Partial Data

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { userUpdateSchema, userParamsSchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const updateUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);
    const updateData = await validateRequest(request, userUpdateSchema);

    log.info('Update user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id,
      updateFields: Object.keys(updateData)
    });

    const usersService = createRBACUsersService(userContext);
    const updatedUser = await usersService.updateUser(userId, updateData);

    log.info('User updated successfully', {
      targetUserId: userId,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(updatedUser, 'User updated successfully');

  } catch (error) {
    log.error('Update user failed', error, {
      duration: Date.now() - startTime
    });

    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(error, statusCode, request);
  }
};

export const PUT = rbacRoute(
  updateUserHandler,
  {
    permission: ['users:update:own', 'users:update:organization', 'users:manage:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

### Example 5: Delete Endpoint (Soft Delete)

```typescript
import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { extractRouteParams } from '@/lib/api/utils/params';
import { userParamsSchema } from '@/lib/validations/user';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const deleteUserHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();

  try {
    const { id: userId } = await extractRouteParams(args[0], userParamsSchema);

    log.info('Delete user request initiated', {
      targetUserId: userId,
      requestingUserId: userContext.user_id
    });

    const usersService = createRBACUsersService(userContext);
    await usersService.deleteUser(userId);

    log.info('User deleted successfully', {
      targetUserId: userId,
      duration: Date.now() - startTime
    });

    return createSuccessResponse(null, 'User deleted successfully');

  } catch (error) {
    log.error('Delete user failed', error, {
      duration: Date.now() - startTime
    });

    const statusCode = error instanceof NotFoundError ? 404 : 500;
    return createErrorResponse(error, statusCode, request);
  }
};

export const DELETE = rbacRoute(
  deleteUserHandler,
  {
    permission: ['users:delete:organization', 'users:manage:all'],
    extractResourceId: extractors.userId,
    extractOrganizationId: extractors.organizationId,
    rateLimit: 'api'
  }
);
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Direct Database Queries in Handlers

**Don't do this:**

```typescript
// ❌ BAD - Direct DB query in handler
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const users = await db
    .select()
    .from(users_table)
    .where(eq(users_table.is_active, true));

  return createSuccessResponse(users);
};
```

**Do this instead:**

```typescript
// ✅ GOOD - Use service layer
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const usersService = createRBACUsersService(userContext);
  const users = await usersService.getUsers({ is_active: true });

  return createSuccessResponse(users);
};
```

### ❌ Anti-Pattern 2: Manual Permission Checking in Handlers

**Don't do this:**

```typescript
// ❌ BAD - Manual RBAC in handler
const getUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const canRead = userContext.all_permissions?.some(p =>
    p.name === 'users:read:all'
  );

  if (!canRead) {
    return createErrorResponse('Permission denied', 403, request);
  }

  // ... rest of handler
};
```

**Do this instead:**

```typescript
// ✅ GOOD - Service handles RBAC
const getUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const usersService = createRBACUsersService(userContext);
  const user = await usersService.getUserById(userId); // Throws PermissionError if unauthorized

  return createSuccessResponse(user);
};
```

### ❌ Anti-Pattern 3: Using NextResponse.json

**Don't do this:**

```typescript
// ❌ BAD - Direct NextResponse
return NextResponse.json(
  { success: true, data: users },
  { status: 200 }
);
```

**Do this instead:**

```typescript
// ✅ GOOD - Use standard helper
return createSuccessResponse(users);
```

### ❌ Anti-Pattern 4: Anonymous Handler Functions

**Don't do this:**

```typescript
// ❌ BAD - Anonymous function
export const GET = rbacRoute(
  async (request, userContext) => {
    // ... handler logic
  },
  { permission: 'users:read:all', rateLimit: 'api' }
);
```

**Do this instead:**

```typescript
// ✅ GOOD - Named function
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  // ... handler logic
};

export const GET = rbacRoute(getUsersHandler, {
  permission: 'users:read:all',
  rateLimit: 'api'
});
```

### ❌ Anti-Pattern 5: Missing Performance Logging

**Don't do this:**

```typescript
// ❌ BAD - No timing
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const users = await service.getUsers();
    return createSuccessResponse(users);
  } catch (error) {
    return createErrorResponse(error, 500, request);
  }
};
```

**Do this instead:**

```typescript
// ✅ GOOD - Track timing
const getUsersHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const users = await service.getUsers();

    log.info('Users retrieved', { duration: Date.now() - startTime });
    return createSuccessResponse(users);

  } catch (error) {
    log.error('Get users failed', error, { duration: Date.now() - startTime });
    return createErrorResponse(error, 500, request);
  }
};
```

### ❌ Anti-Pattern 6: Any Types

**Don't do this:**

```typescript
// ❌ BAD - Any type
let query: any;
const data: any = await request.json();
```

**Do this instead:**

```typescript
// ✅ GOOD - Proper typing
const query = validateQuery(searchParams, querySchema);
const data = await validateRequest(request, createSchema);
```

### ❌ Anti-Pattern 7: Missing Error Context

**Don't do this:**

```typescript
// ❌ BAD - No context in error
catch (error) {
  log.error('Error occurred', error);
  return createErrorResponse(error, 500, request);
}
```

**Do this instead:**

```typescript
// ✅ GOOD - Rich context
catch (error) {
  log.error('Get user failed', error, {
    targetUserId: userId,
    requestingUserId: userContext.user_id,
    duration: Date.now() - startTime
  });
  return createErrorResponse(error, 500, request);
}
```

### ❌ Anti-Pattern 8: Inline Business Logic

**Don't do this:**

```typescript
// ❌ BAD - Business logic in handler
const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const data = await validateRequest(request, userCreateSchema);

  // Check if email exists
  const existing = await db.select().from(users).where(eq(users.email, data.email));
  if (existing.length > 0) {
    throw ConflictError('Email already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Create user
  const [newUser] = await db.insert(users).values({
    ...data,
    password_hash: hashedPassword
  }).returning();

  // Send welcome email
  await emailService.sendWelcome(newUser.email);

  return createSuccessResponse(newUser);
};
```

**Do this instead:**

```typescript
// ✅ GOOD - Business logic in service
const createUserHandler = async (request: NextRequest, userContext: UserContext) => {
  const data = await validateRequest(request, userCreateSchema);

  const usersService = createRBACUsersService(userContext);
  const newUser = await usersService.createUser(data); // Service handles all business logic

  return createSuccessResponse(newUser);
};
```

---

## Quick Reference Checklist

Use this checklist when creating or reviewing an API endpoint:

- [ ] Handler follows naming convention: `[operation][Resource]Handler`
- [ ] Imports in correct order (see Import Order Convention)
- [ ] Uses service layer for all DB operations
- [ ] No direct `db` imports in handler
- [ ] No manual RBAC checks (service handles this)
- [ ] Uses `validateRequest`, `validateQuery`, or `extractRouteParams` for input
- [ ] Performance tracking with `startTime` and `duration` logging
- [ ] Structured logging with context objects
- [ ] Uses `createSuccessResponse`, `createPaginatedResponse`, or `createErrorResponse`
- [ ] Proper error handling with try-catch
- [ ] Logs on operation start, success, and failure
- [ ] RBAC configuration with appropriate permissions
- [ ] Rate limiting specified (`rateLimit: 'api'`)
- [ ] No `any` types
- [ ] Full TypeScript strict mode compliance
- [ ] Tests exist in `__tests__/route.test.ts`
- [ ] Test coverage >85%

---

## Getting Help

- **Questions?** Ask in #engineering Slack channel
- **Need review?** Tag @api-standards-team in PR
- **Found a gap?** Update this document and submit PR

---

**Remember**: Consistency is key. When in doubt, reference the gold standard APIs listed at the top of this document.
