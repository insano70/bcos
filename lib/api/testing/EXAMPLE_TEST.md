# API Testing Examples

This document shows how to test API handlers using the testing helpers.

---

## Unit Testing (No Database)

Use these helpers for fast unit tests that don't need database interaction:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  createMockRequest,
  createMockUserWithPermission,
  assertSuccessResponse,
  assertPermissionDenied,
  assertNotFound
} from '@/lib/api/testing/api-test-helpers';
import { GET, POST } from '../route';

describe('GET /api/users', () => {
  it('returns users for authorized user', async () => {
    const request = createMockRequest({
      method: 'GET',
      url: '/api/users'
    });

    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    const { data } = await assertSuccessResponse(response);
    expect(data).toBeDefined();
  });

  it('denies access for user without permission', async () => {
    const request = createMockRequest({ url: '/api/users' });
    const userContext = createMockUserContext(); // No permissions

    const response = await GET(request, userContext);

    await assertPermissionDenied(response);
  });

  it('handles query parameters', async () => {
    const request = createMockRequest({
      url: '/api/users',
      searchParams: { page: '2', limit: '10', search: 'john' }
    });

    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    const { pagination } = await assertPaginatedResponse(response);
    expect(pagination.page).toBe(2);
    expect(pagination.limit).toBe(10);
  });
});

describe('POST /api/users', () => {
  it('creates user with valid data', async () => {
    const request = createMockRequest({
      method: 'POST',
      url: '/api/users',
      body: {
        email: 'newuser@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'securePassword123'
      }
    });

    const userContext = createMockUserWithPermission('users:create:organization');

    const response = await POST(request, userContext);

    const { data } = await assertSuccessResponse(response, 201);
    expect(data.email).toBe('newuser@example.com');
  });

  it('rejects invalid data', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: { email: 'invalid-email' } // Missing required fields
    });

    const userContext = createMockUserWithPermission('users:create:organization');

    const response = await POST(request, userContext);

    await assertValidationError(response);
  });
});

describe('GET /api/users/[id]', () => {
  it('returns single user by ID', async () => {
    const request = createMockRequest({
      url: '/api/users/user-123'
    });

    const userContext = createMockUserWithPermission('users:read:all');
    const params = createMockRouteParams({ id: 'user-123' });

    const response = await GET(request, userContext, params);

    const { data } = await assertSuccessResponse(response);
    expect(data.user_id).toBe('user-123');
  });

  it('returns 404 for non-existent user', async () => {
    const request = createMockRequest({
      url: '/api/users/invalid-id'
    });

    const userContext = createMockUserWithPermission('users:read:all');
    const params = createMockRouteParams({ id: 'invalid-id' });

    const response = await GET(request, userContext, params);

    await assertNotFound(response);
  });
});
```

---

## Integration Testing (With Database)

For tests that need actual database interaction:

```typescript
import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup'; // Enables test transactions
import { createTestUser } from '@/tests/factories';
import {
  buildUserContext,
  createUserWithPermissions
} from '@/tests/helpers/rbac-helper';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import {
  createMockRequest,
  assertSuccessResponse,
  assertPaginatedResponse
} from '@/lib/api/testing/api-test-helpers';
import { GET } from '../route';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('GET /api/users (Integration)', () => {
  it('returns actual users from database', async () => {
    // Create test users in database
    const user1 = await createTestUser({ first_name: 'Alice' });
    const user2 = await createTestUser({ first_name: 'Bob' });

    // Create user with permissions
    const requestingUser = await createUserWithPermissions(['users:read:all']);

    // Build real user context from database
    const userContext = await buildUserContext(requestingUser);

    // Create request
    const request = createMockRequest({ url: '/api/users' });

    // Call handler
    const response = await GET(request, userContext);

    // Assert response
    const { data } = await assertPaginatedResponse(response);
    expect(data.length).toBeGreaterThanOrEqual(2);

    const names = data.map(u => u.first_name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
  });

  it('respects RBAC filtering - user can only see own data', async () => {
    // Create test users
    const alice = await createTestUser({ first_name: 'Alice' });
    const bob = await createTestUser({ first_name: 'Bob' });

    // Give Bob permission to read only his own data
    const bobWithPermission = await createUserWithPermissions(
      ['users:read:own'],
      undefined,
      { user_id: bob.user_id }
    );

    const userContext = await buildUserContext(bobWithPermission);

    const request = createMockRequest({ url: '/api/users' });
    const response = await GET(request, userContext);

    const { data } = await assertPaginatedResponse(response);

    // Bob should only see himself
    expect(data.length).toBe(1);
    expect(data[0].user_id).toBe(bob.user_id);
  });

  it('verifies database changes after POST', async () => {
    const requestingUser = await createUserWithPermissions(['users:create:organization']);
    const userContext = await buildUserContext(requestingUser);

    const request = createMockRequest({
      method: 'POST',
      body: {
        email: 'dbtest@example.com',
        first_name: 'Database',
        last_name: 'Test',
        password: 'securePassword123'
      }
    });

    const response = await POST(request, userContext);
    const { data } = await assertSuccessResponse(response, 201);

    // Verify user exists in database
    const tx = getCurrentTransaction();
    const [createdUser] = await tx
      .select()
      .from(users)
      .where(eq(users.email, 'dbtest@example.com'));

    expect(createdUser).toBeDefined();
    expect(createdUser.first_name).toBe('Database');
  });
});
```

---

## Testing Different User Roles

```typescript
describe('RBAC Enforcement', () => {
  it('allows super admin to access everything', async () => {
    const superAdminContext = createMockSuperAdminContext();
    const request = createMockRequest({ url: '/api/users' });

    const response = await GET(request, superAdminContext);

    await assertSuccessResponse(response);
  });

  it('allows org admin to access org resources', async () => {
    const orgAdminContext = createMockOrgAdminContext('org-123');
    const request = createMockRequest({ url: '/api/users' });

    const response = await GET(request, orgAdminContext);

    await assertSuccessResponse(response);
  });

  it('denies regular user access to admin endpoints', async () => {
    const regularUserContext = createMockUserContext();
    const request = createMockRequest({ url: '/api/admin/settings' });

    const response = await GET(request, regularUserContext);

    await assertPermissionDenied(response);
  });

  it('checks permission boundary between organizations', async () => {
    // User is admin of org-123
    const org123Admin = createMockOrgAdminContext('org-123');

    // Try to access resource from org-456
    const request = createMockRequest({ url: '/api/orgs/org-456/users' });

    const response = await GET(request, org123Admin);

    // Should be denied - user is admin of different org
    await assertPermissionDenied(response);
  });
});
```

---

## Testing Error Handling

```typescript
describe('Error Handling', () => {
  it('handles validation errors gracefully', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: { email: 'not-an-email' } // Invalid
    });

    const userContext = createMockUserWithPermission('users:create:organization');

    const response = await POST(request, userContext);

    const error = await assertValidationError(response);
    expect(error.error).toContain('email');
  });

  it('handles not found errors', async () => {
    const request = createMockRequest({ url: '/api/users/nonexistent' });
    const userContext = createMockUserWithPermission('users:read:all');
    const params = createMockRouteParams({ id: 'nonexistent' });

    const response = await GET(request, userContext, params);

    await assertNotFound(response);
  });

  it('handles server errors', async () => {
    // Mock service to throw error
    vi.mock('@/lib/services/rbac-users-service', () => ({
      createRBACUsersService: () => ({
        getUsers: () => { throw new Error('Database connection failed'); }
      })
    }));

    const request = createMockRequest({ url: '/api/users' });
    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    await assertErrorResponse(response, 500);
  });
});
```

---

## Testing Pagination

```typescript
describe('Pagination', () => {
  it('returns correct page of results', async () => {
    const request = createMockRequest({
      searchParams: { page: '2', limit: '10' }
    });

    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    const { pagination } = await assertPaginatedResponse(response);
    expect(pagination.page).toBe(2);
    expect(pagination.limit).toBe(10);
  });

  it('respects limit parameter', async () => {
    const request = createMockRequest({
      searchParams: { page: '1', limit: '5' }
    });

    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    const { data, pagination } = await assertPaginatedResponse(response);
    expect(data.length).toBeLessThanOrEqual(5);
    expect(pagination.limit).toBe(5);
  });

  it('returns total count', async () => {
    const request = createMockRequest({ url: '/api/users' });
    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    const { pagination } = await assertPaginatedResponse(response);
    expect(pagination.total).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Testing with Headers

```typescript
describe('Headers', () => {
  it('includes custom headers in request', async () => {
    const request = createMockRequest({
      url: '/api/users',
      headers: {
        'X-Request-ID': 'test-123',
        'X-Forwarded-For': '192.168.1.1'
      }
    });

    const userContext = createMockUserWithPermission('users:read:all');

    const response = await GET(request, userContext);

    await assertSuccessResponse(response);
  });

  it('validates content-type', async () => {
    const request = createMockRequest({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'test@example.com' }
    });

    const userContext = createMockUserWithPermission('users:create:organization');

    const response = await POST(request, userContext);

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });
});
```

---

## Best Practices

### 1. Choose the Right Test Type

**Unit Tests** - Fast, no database
- Test handler logic in isolation
- Test RBAC checks
- Test validation
- Test error handling

**Integration Tests** - Slower, uses database
- Test actual database operations
- Test RBAC with real permissions
- Test end-to-end flows
- Test data persistence

### 2. Test Coverage Checklist

For each endpoint, test:
- [ ] Happy path (authorized user, valid input)
- [ ] Permission denied (user without permission)
- [ ] Not found (invalid resource ID)
- [ ] Validation error (invalid input)
- [ ] RBAC boundaries (can't access other user's data)
- [ ] Pagination (if applicable)
- [ ] Filtering (if applicable)
- [ ] Sorting (if applicable)

### 3. Naming Convention

```typescript
describe('[METHOD] [endpoint]', () => {
  it('[describes expected behavior]', async () => {
    // Test
  });
});
```

Examples:
- `'GET /api/users' → 'returns list of users'`
- `'POST /api/users' → 'creates new user'`
- `'GET /api/users/[id]' → 'returns single user by ID'`
- `'PUT /api/users/[id]' → 'updates existing user'`

### 4. Arrange-Act-Assert Pattern

```typescript
it('creates user with valid data', async () => {
  // Arrange - Set up test data
  const request = createMockRequest({
    method: 'POST',
    body: { email: 'test@example.com', /* ... */ }
  });
  const userContext = createMockUserWithPermission('users:create:organization');

  // Act - Execute the operation
  const response = await POST(request, userContext);

  // Assert - Verify the results
  const { data } = await assertSuccessResponse(response, 201);
  expect(data.email).toBe('test@example.com');
});
```

---

## Troubleshooting

### "getCurrentTransaction is not a function"

You forgot to import the integration setup:
```typescript
import '@/tests/setup/integration-setup';
```

### "Cannot read property 'user_id' of undefined"

The UserContext mock is incomplete. Use the helper:
```typescript
const userContext = createMockUserContext(); // Not {}
```

### Tests are slow

You're using integration tests when unit tests would work:
- Use unit tests for logic testing
- Use integration tests only when DB access is needed

### Permission checks not working

Make sure you're using the right helper:
```typescript
// Unit test - mock permission
const context = createMockUserWithPermission('users:read:all');

// Integration test - real permission
const user = await createUserWithPermissions(['users:read:all']);
const context = await buildUserContext(user);
```

---

## Resources

- [API Standards](../../../docs/api/STANDARDS.md)
- [RBAC Testing Guide](../../../docs/api/RBAC_TESTING.md)
- [Handler Template](../templates/handler-template.ts)
- [Existing Test Helpers](../../../tests/helpers/rbac-helper.ts)
