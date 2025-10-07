/**
 * API Testing Helpers
 *
 * These helpers complement the existing test infrastructure in tests/helpers/
 * Specifically designed for testing API route handlers.
 *
 * Existing Infrastructure (DO NOT DUPLICATE):
 * - tests/helpers/rbac-helper.ts - buildUserContext, createUserWithPermissions
 * - tests/helpers/db-helper.ts - Transaction management
 * - tests/factories/ - User, role, organization factories
 *
 * These helpers provide:
 * - Mock NextRequest creation
 * - Response assertion helpers
 * - Quick mock UserContext creation for unit tests
 */

import type { Organization, Permission, Role, UserContext } from '@/lib/types/rbac';

/**
 * ============================================================================
 * MOCK REQUEST CREATION
 * ============================================================================
 */

/**
 * Create a mock NextRequest for testing API handlers
 *
 * @example
 * const request = createMockRequest({
 *   method: 'GET',
 *   url: '/api/users?page=1&limit=20'
 * });
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
}): Request {
  const {
    method = 'GET',
    url = 'http://localhost:3000/api/test',
    body,
    headers = {},
    searchParams,
  } = options;

  // Build URL with search params if provided
  let fullUrl = url;
  if (searchParams) {
    const params = new URLSearchParams(searchParams);
    fullUrl = `${url}?${params.toString()}`;
  }

  // Create headers
  const requestHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  });

  // Create request
  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
  };

  // Add body if provided
  if (body) {
    requestInit.body = JSON.stringify(body);
  }

  return new Request(fullUrl, requestInit) as Request;
}

/**
 * ============================================================================
 * MOCK USER CONTEXT CREATION (FOR UNIT TESTS)
 * ============================================================================
 *
 * NOTE: For integration tests, use buildUserContext() from tests/helpers/rbac-helper.ts
 * These mocks are for UNIT tests only where you don't need database interaction
 */

/**
 * Create a minimal mock UserContext for unit testing
 *
 * @example
 * const context = createMockUserContext();
 * const response = await handler(request, context);
 */
export function createMockUserContext(overrides?: Partial<UserContext>): UserContext {
  return {
    // Basic user information
    user_id: 'test-user-id-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    email_verified: true,

    // RBAC information
    roles: [],
    organizations: [],
    accessible_organizations: [],
    user_roles: [],
    user_organizations: [],

    // Current context
    current_organization_id: undefined,

    // Computed properties
    all_permissions: [],
    is_super_admin: false,
    organization_admin_for: [],

    // Apply overrides
    ...overrides,
  };
}

/**
 * Create a mock super admin UserContext
 *
 * @example
 * const adminContext = createMockSuperAdminContext();
 * const response = await handler(request, adminContext);
 */
export function createMockSuperAdminContext(overrides?: Partial<UserContext>): UserContext {
  return createMockUserContext({
    user_id: 'super-admin-id',
    email: 'admin@example.com',
    first_name: 'Super',
    last_name: 'Admin',
    is_super_admin: true,
    all_permissions: [
      {
        permission_id: 'admin-perm-1',
        name: 'admin:all',
        resource: 'admin',
        action: 'all',
        scope: 'all',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    ...overrides,
  });
}

/**
 * Create a mock UserContext with specific permission
 *
 * @example
 * const context = createMockUserWithPermission('users:read:all');
 * const response = await handler(request, context);
 */
export function createMockUserWithPermission(
  permissionName: string,
  overrides?: Partial<UserContext>
): UserContext {
  const [resource, action, scope] = permissionName.split(':');

  const permission: Permission = {
    permission_id: 'test-permission-id',
    name: permissionName,
    resource: resource || 'resource',
    action: action || 'read',
    scope: (scope as 'own' | 'organization' | 'all') || 'own',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  return createMockUserContext({
    all_permissions: [permission],
    ...overrides,
  });
}

/**
 * Create a mock UserContext with multiple permissions
 *
 * @example
 * const context = createMockUserWithPermissions([
 *   'users:read:all',
 *   'users:create:organization'
 * ]);
 */
export function createMockUserWithPermissions(
  permissionNames: string[],
  overrides?: Partial<UserContext>
): UserContext {
  const permissions: Permission[] = permissionNames.map((name) => {
    const [resource, action, scope] = name.split(':');
    return {
      permission_id: `test-perm-${name}`,
      name,
      resource: resource || 'resource',
      action: action || 'read',
      scope: (scope as 'own' | 'organization' | 'all') || 'own',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  return createMockUserContext({
    all_permissions: permissions,
    ...overrides,
  });
}

/**
 * Create a mock organization admin context
 *
 * @example
 * const context = createMockOrgAdminContext('org-123');
 */
export function createMockOrgAdminContext(
  organizationId: string,
  overrides?: Partial<UserContext>
): UserContext {
  const org: Organization = {
    organization_id: organizationId,
    name: 'Test Organization',
    slug: 'test-org',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  return createMockUserContext({
    current_organization_id: organizationId,
    organizations: [org],
    accessible_organizations: [org],
    organization_admin_for: [organizationId],
    all_permissions: [
      {
        permission_id: 'org-admin-perm',
        name: 'admin:organization',
        resource: 'admin',
        action: 'all',
        scope: 'organization',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ],
    ...overrides,
  });
}

/**
 * ============================================================================
 * RESPONSE ASSERTION HELPERS
 * ============================================================================
 */

/**
 * Assert that response is a success response with correct format
 *
 * @example
 * const response = await GET(request, userContext);
 * const data = await assertSuccessResponse(response);
 * expect(data.users).toHaveLength(10);
 */
export async function assertSuccessResponse(
  response: Response,
  expectedStatus = 200
): Promise<{
  success: boolean;
  data: unknown;
  message?: string;
}> {
  expect(response.status).toBe(expectedStatus);

  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');

  const json = await response.json();

  expect(json).toHaveProperty('success', true);
  expect(json).toHaveProperty('data');

  return json;
}

/**
 * Assert that response is a paginated success response
 *
 * @example
 * const response = await GET(request, userContext);
 * const { data, pagination } = await assertPaginatedResponse(response);
 * expect(pagination.total).toBeGreaterThan(0);
 */
export async function assertPaginatedResponse(
  response: Response,
  expectedStatus = 200
): Promise<{
  success: boolean;
  data: unknown[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}> {
  expect(response.status).toBe(expectedStatus);

  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');

  const json = await response.json();

  expect(json).toHaveProperty('success', true);
  expect(json).toHaveProperty('data');
  expect(json).toHaveProperty('pagination');
  expect(json.pagination).toHaveProperty('page');
  expect(json.pagination).toHaveProperty('limit');
  expect(json.pagination).toHaveProperty('total');

  expect(Array.isArray(json.data)).toBe(true);

  return json;
}

/**
 * Assert that response is an error response
 *
 * @example
 * const response = await GET(request, userContext);
 * const error = await assertErrorResponse(response, 404);
 * expect(error.error).toContain('not found');
 */
export async function assertErrorResponse(
  response: Response,
  expectedStatus = 500
): Promise<{
  success: boolean;
  error: string;
  statusCode?: number;
}> {
  expect(response.status).toBe(expectedStatus);

  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');

  const json = await response.json();

  expect(json).toHaveProperty('success', false);
  expect(json).toHaveProperty('error');

  return json;
}

/**
 * Assert that response is a permission denied error (403)
 *
 * @example
 * const response = await GET(request, restrictedUserContext);
 * await assertPermissionDenied(response);
 */
export async function assertPermissionDenied(response: Response): Promise<void> {
  await assertErrorResponse(response, 403);
}

/**
 * Assert that response is a not found error (404)
 *
 * @example
 * const response = await GET(request, userContext, { params: { id: 'invalid' } });
 * await assertNotFound(response);
 */
export async function assertNotFound(response: Response): Promise<void> {
  await assertErrorResponse(response, 404);
}

/**
 * Assert that response is a validation error (400)
 *
 * @example
 * const response = await POST(request, userContext);
 * await assertValidationError(response);
 */
export async function assertValidationError(response: Response): Promise<void> {
  await assertErrorResponse(response, 400);
}

/**
 * ============================================================================
 * ROUTE PARAMS HELPERS
 * ============================================================================
 */

/**
 * Create mock route params for Next.js dynamic routes
 *
 * @example
 * const params = createMockRouteParams({ id: 'user-123' });
 * const response = await GET(request, userContext, params);
 */
export function createMockRouteParams(params: Record<string, string>): {
  params: Record<string, string>;
} {
  return { params };
}

/**
 * ============================================================================
 * COMPREHENSIVE TEST EXAMPLE
 * ============================================================================
 *
 * @example Complete API handler test
 * ```typescript
 * import { describe, it, expect } from 'vitest';
 * import {
 *   createMockRequest,
 *   createMockUserWithPermission,
 *   assertSuccessResponse,
 *   assertPermissionDenied
 * } from '@/lib/api/testing/api-test-helpers';
 * import { GET } from '../route';
 *
 * describe('GET /api/users', () => {
 *   it('returns users for authenticated user with permission', async () => {
 *     const request = createMockRequest({
 *       method: 'GET',
 *       url: '/api/users?page=1&limit=20'
 *     });
 *
 *     const userContext = createMockUserWithPermission('users:read:all');
 *
 *     const response = await GET(request, userContext);
 *
 *     const { data } = await assertSuccessResponse(response);
 *     expect(Array.isArray(data)).toBe(true);
 *   });
 *
 *   it('returns 403 for user without permission', async () => {
 *     const request = createMockRequest({ method: 'GET', url: '/api/users' });
 *     const userContext = createMockUserContext(); // No permissions
 *
 *     const response = await GET(request, userContext);
 *
 *     await assertPermissionDenied(response);
 *   });
 *
 *   it('handles pagination parameters', async () => {
 *     const request = createMockRequest({
 *       method: 'GET',
 *       searchParams: { page: '2', limit: '10' }
 *     });
 *
 *     const userContext = createMockUserWithPermission('users:read:all');
 *
 *     const response = await GET(request, userContext);
 *
 *     const { pagination } = await assertPaginatedResponse(response);
 *     expect(pagination.page).toBe(2);
 *     expect(pagination.limit).toBe(10);
 *   });
 * });
 * ```
 */

/**
 * ============================================================================
 * INTEGRATION WITH EXISTING TEST INFRASTRUCTURE
 * ============================================================================
 *
 * For integration tests that need database interaction:
 *
 * @example Integration test with database
 * ```typescript
 * import { describe, it, expect } from 'vitest';
 * import '@/tests/setup/integration-setup'; // Use test transaction
 * import { createTestUser } from '@/tests/factories';
 * import { buildUserContext, createUserWithPermissions } from '@/tests/helpers/rbac-helper';
 * import { getCurrentTransaction } from '@/tests/helpers/db-helper';
 * import { createMockRequest, assertSuccessResponse } from '@/lib/api/testing/api-test-helpers';
 * import { GET } from '../route';
 *
 * describe('GET /api/users (Integration)', () => {
 *   it('returns actual users from database', async () => {
 *     // Create real user in database with permissions
 *     const user = await createUserWithPermissions(['users:read:all']);
 *
 *     // Build real user context from database
 *     const userContext = await buildUserContext(user);
 *
 *     // Create mock request
 *     const request = createMockRequest({ url: '/api/users' });
 *
 *     // Call handler
 *     const response = await GET(request, userContext);
 *
 *     // Assert response
 *     const { data } = await assertSuccessResponse(response);
 *     expect(data).toBeDefined();
 *   });
 * });
 * ```
 */
